import asyncio
import json
import math
import os
import random
import time
from datetime import datetime, timezone
from pathlib import Path

import redis.asyncio as aioredis
import structlog
import yaml

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    logger_factory=structlog.PrintLoggerFactory(),
)
logger = structlog.get_logger(component="simulator")

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
QUEUE_KEY = "telemetry_queue"
CONTROL_CHANNEL = "simulator_control"
STATUS_KEY = "simulator_status"
PROFILES_DIR = Path(__file__).parent / "loco_profiles"
SCENARIOS_DIR = Path(__file__).parent / "scenarios"

# ---------------------------------------------------------------------------
# Operational modes — simulate realistic locomotive operating conditions.
# Each mode defines offsets from the profile nominal values, pushing certain
# parameters toward (or beyond) safe-zone boundaries so that the Health Index
# produces meaningful variation instead of a flat 100.
# ---------------------------------------------------------------------------
OPERATIONAL_MODES = {
    "idle": {
        "duration_range": (60, 180),
        "transition_weight": 1.0,
        "offsets": {
            "traction_motor_current_a": -200,
            "traction_motor_temp_c": -15,
            "dc_bus_voltage_v": -50,
            "pantograph_current_a": -100,
            "regen_braking_power_kw": -1000,
            "engine_rpm": -200,
            "exhaust_temp_c": -100,
            "fuel_consumption_g_kwh": -30,
            "speed_kmh": -40,
        },
    },
    "cruising": {
        "duration_range": (120, 300),
        "transition_weight": 2.0,
        "offsets": {},
    },
    "heavy_load": {
        "duration_range": (90, 240),
        "transition_weight": 1.5,
        "offsets": {
            "traction_motor_current_a": 350,
            "traction_motor_temp_c": 25,
            "dc_bus_voltage_v": 80,
            "pantograph_current_a": 120,
            "coolant_temp_c": 8,
            "oil_temp_c": 10,
            "engine_rpm": 200,
            "exhaust_temp_c": 80,
            "fuel_consumption_g_kwh": 40,
            "oil_pressure_kpa": -30,
            "speed_kmh": 15,
        },
    },
    "uphill": {
        "duration_range": (60, 180),
        "transition_weight": 1.0,
        "offsets": {
            "traction_motor_current_a": 400,
            "traction_motor_temp_c": 30,
            "dc_bus_voltage_v": 100,
            "pantograph_current_a": 150,
            "coolant_temp_c": 10,
            "oil_temp_c": 12,
            "engine_rpm": 300,
            "exhaust_temp_c": 120,
            "fuel_consumption_g_kwh": 60,
            "oil_pressure_kpa": -50,
            "speed_kmh": -15,
            "wheel_slip_pct": 1.5,
        },
    },
    "braking": {
        "duration_range": (30, 90),
        "transition_weight": 0.8,
        "offsets": {
            "traction_motor_current_a": -300,
            "brake_main_pressure_bar": 0.6,
            "brake_cylinder_pressure_bar": 2.5,
            "regen_braking_power_kw": 3000,
            "speed_kmh": -20,
        },
    },
}


def load_profiles() -> list[dict]:
    profiles = []
    for f in sorted(PROFILES_DIR.glob("*.json")):
        with open(f) as fh:
            profiles.append(json.load(fh))
    return profiles


def load_scenarios() -> dict[str, dict]:
    scenarios = {}
    for f in sorted(SCENARIOS_DIR.glob("*.yaml")):
        with open(f) as fh:
            data = yaml.safe_load(fh)
            scenarios[data["name"]] = data
    return scenarios


class LocoSimulator:
    def __init__(self, profile: dict):
        self.loco_id = profile["loco_id"]
        self.loco_type = profile["loco_type"]
        self.params = profile["parameters"]
        self.current: dict[str, float] = {}
        # Track which params are under scenario control (no mean-reversion)
        self.scenario_params: set[str] = set()
        for name, cfg in self.params.items():
            self.current[name] = cfg["nominal"]

        # Operational mode state
        self.current_mode = "cruising"
        self.mode_timer = random.randint(120, 300)

        # Per-parameter sinusoidal drift (slow environmental oscillation)
        self.tick_count = 0
        self.drift_phases: dict[str, float] = {}
        self.drift_periods: dict[str, float] = {}
        for name in self.params:
            self.drift_phases[name] = random.uniform(0, 2 * math.pi)
            self.drift_periods[name] = random.uniform(300, 1200)

    def _pick_next_mode(self):
        """Weighted random mode selection, reducing weight of current mode."""
        modes = list(OPERATIONAL_MODES.keys())
        weights = []
        for m in modes:
            w = OPERATIONAL_MODES[m]["transition_weight"]
            if m == self.current_mode:
                w *= 0.3  # reduce chance of staying in same mode
            weights.append(w)
        self.current_mode = random.choices(modes, weights=weights, k=1)[0]
        lo, hi = OPERATIONAL_MODES[self.current_mode]["duration_range"]
        self.mode_timer = random.randint(lo, hi)
        logger.info("mode_change", loco=self.loco_id, mode=self.current_mode,
                     duration=self.mode_timer)

    def tick(self) -> dict:
        self.tick_count += 1

        # Transition operational mode when timer expires (skip during scenarios)
        if not self.scenario_params:
            self.mode_timer -= 1
            if self.mode_timer <= 0:
                self._pick_next_mode()

        mode_offsets = OPERATIONAL_MODES[self.current_mode]["offsets"]

        ts = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        parameters = {}
        for name, cfg in self.params.items():
            prev = self.current[name]

            # Layer 1: random noise (increased from 0.3 to 0.5)
            step = random.gauss(0, cfg["sigma"] * 0.5)

            # Layer 2: slow sinusoidal drift
            sin_drift = cfg["sigma"] * 1.5 * math.sin(
                2 * math.pi * self.tick_count / self.drift_periods[name]
                + self.drift_phases[name]
            )

            # Layer 3: mean-reversion toward effective nominal
            if name in self.scenario_params:
                reversion = 0
            else:
                offset = mode_offsets.get(name, 0)
                effective_nom = cfg["nominal"] + offset
                reversion = (effective_nom + sin_drift - prev) * 0.03

            new_val = prev + step + reversion
            new_val = max(cfg["min"], min(cfg["max"], new_val))
            self.current[name] = new_val
            parameters[name] = round(new_val, 2)

        return {
            "loco_id": self.loco_id,
            "loco_type": self.loco_type,
            "ts": ts,
            "parameters": parameters,
        }

    def apply_drift(self, param: str, rate: float):
        """Apply gradual drift toward a target."""
        if param in self.current:
            self.scenario_params.add(param)
            self.current[param] += rate

    def apply_step(self, param: str, target: float):
        """Instantly set a parameter to target."""
        if param in self.current:
            self.scenario_params.add(param)
            self.current[param] = target

    def clear_scenario_params(self):
        """Release all params from scenario control."""
        self.scenario_params.clear()
        # Reset to cruising after scenario ends
        self.current_mode = "cruising"
        self.mode_timer = random.randint(60, 120)


class ScenarioManager:
    def __init__(self, scenarios: dict[str, dict], simulators: list[LocoSimulator]):
        self.scenarios = scenarios
        self.simulators = simulators
        self.active_scenario: str | None = None
        self.scenario_start: float = 0
        self.scenario_data: dict | None = None

    @property
    def is_active(self) -> bool:
        return self.active_scenario is not None

    def start_scenario(self, name: str):
        if name not in self.scenarios:
            logger.warning("unknown_scenario", name=name)
            return
        self.active_scenario = name
        self.scenario_data = self.scenarios[name]
        self.scenario_start = time.monotonic()
        logger.info("scenario_started", scenario=name)

    def stop_scenario(self):
        if self.active_scenario:
            logger.info("scenario_stopped", scenario=self.active_scenario)
        self.active_scenario = None
        self.scenario_data = None
        for sim in self.simulators:
            sim.clear_scenario_params()

    def get_tick_hz(self) -> float:
        """Return tick rate (Hz) — normally 1, higher during burst."""
        if self.scenario_data and self.scenario_data.get("type") == "burst":
            return self.scenario_data.get("burst_hz", 10)
        return 1.0

    def is_silent(self) -> bool:
        """Return True if we should NOT send data (connection_loss)."""
        return self.scenario_data is not None and self.scenario_data.get("type") == "silence"

    def tick(self):
        """Apply scenario effects for one tick. Auto-stop if duration exceeded."""
        if not self.scenario_data:
            return

        elapsed = time.monotonic() - self.scenario_start
        duration = self.scenario_data.get("duration_sec", 60)

        if elapsed > duration:
            self.stop_scenario()
            return

        scenario_type = self.scenario_data.get("type")
        params = self.scenario_data.get("parameters", {})

        for sim in self.simulators:
            for param_name, pcfg in params.items():
                if param_name not in sim.params:
                    continue

                if scenario_type == "drift":
                    rate = pcfg.get("rate_per_sec", 0)
                    sim.apply_drift(param_name, rate)
                elif scenario_type == "step":
                    target = pcfg.get("target", 0)
                    sim.apply_step(param_name, target)


async def listen_control(r: aioredis.Redis, scenario_mgr: ScenarioManager, state: dict):
    """Listen for control commands on Redis pub/sub."""
    pubsub = r.pubsub()
    await pubsub.subscribe(CONTROL_CHANNEL)
    logger.info("control_listener_started")

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        try:
            cmd = json.loads(message["data"])
            action = cmd.get("action")
            logger.info("control_command", action=action, cmd=cmd)

            if action == "start":
                state["running"] = True
                scenario_mgr.stop_scenario()
            elif action == "stop":
                state["running"] = False
                scenario_mgr.stop_scenario()
            elif action == "scenario":
                name = cmd.get("scenario", "")
                if name == "normal":
                    scenario_mgr.stop_scenario()
                else:
                    scenario_mgr.start_scenario(name)
                state["running"] = True
        except Exception as e:
            logger.error("control_error", error=str(e))


async def update_status(r: aioredis.Redis, state: dict, scenario_mgr: ScenarioManager):
    """Periodically update status in Redis."""
    while True:
        status = {
            "running": state["running"],
            "scenario": scenario_mgr.active_scenario,
            "uptime": round(time.monotonic() - state["start_time"], 1),
            "tick_count": state.get("tick_count", 0),
        }
        await r.set(STATUS_KEY, json.dumps(status))
        await asyncio.sleep(2)


async def main():
    r = aioredis.from_url(REDIS_URL, decode_responses=True)

    while True:
        try:
            await r.ping()
            logger.info("redis_connected")
            break
        except Exception:
            await asyncio.sleep(2)

    profiles = load_profiles()
    scenarios = load_scenarios()
    simulators = [LocoSimulator(p) for p in profiles]
    scenario_mgr = ScenarioManager(scenarios, simulators)

    state = {"running": True, "start_time": time.monotonic(), "tick_count": 0}

    logger.info("simulator_started",
                locomotives=[s.loco_id for s in simulators],
                scenarios=list(scenarios.keys()))

    # Background tasks
    asyncio.create_task(listen_control(r, scenario_mgr, state))
    asyncio.create_task(update_status(r, state, scenario_mgr))

    while True:
        start = time.monotonic()

        if not state["running"]:
            await asyncio.sleep(0.5)
            continue

        # Apply scenario effects
        scenario_mgr.tick()

        # If silent scenario (connection_loss), skip sending
        if scenario_mgr.is_silent():
            await asyncio.sleep(1.0)
            continue

        for sim in simulators:
            msg = sim.tick()
            await r.lpush(QUEUE_KEY, json.dumps(msg))

        state["tick_count"] += 1

        if state["tick_count"] % 10 == 0:
            queue_len = await r.llen(QUEUE_KEY)
            logger.info("simulator_tick",
                        tick=state["tick_count"],
                        queue_depth=queue_len,
                        scenario=scenario_mgr.active_scenario)

        # Tick rate
        hz = scenario_mgr.get_tick_hz()
        elapsed = time.monotonic() - start
        sleep_time = max(0, (1.0 / hz) - elapsed)
        await asyncio.sleep(sleep_time)


if __name__ == "__main__":
    asyncio.run(main())
