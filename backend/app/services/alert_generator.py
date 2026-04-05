"""
Alert Generator — checks thresholds and creates alerts.
"""

import json
import time
from datetime import datetime, timezone

import structlog

from app.db.connection import get_pool

logger = structlog.get_logger(component="alert_generator")

# Cooldown tracking: (loco_id, param, severity) -> last_alert_time
_alert_cooldowns: dict[tuple[str, str, str], float] = {}

COOLDOWN_CRITICAL = 15  # seconds
COOLDOWN_WARNING = 30


def _check_cooldown(loco_id: str, param: str, severity: str) -> bool:
    """Return True if we can fire an alert (cooldown expired)."""
    key = (loco_id, param, severity)
    last_time = _alert_cooldowns.get(key, 0)
    cooldown = COOLDOWN_CRITICAL if severity == "critical" else COOLDOWN_WARNING
    now = time.time()
    if now - last_time < cooldown:
        return False
    _alert_cooldowns[key] = now
    return True


def _get_severity_and_threshold(value: float, param_cfg: dict) -> tuple[str | None, float | None]:
    """Determine severity based on value vs thresholds."""
    safe_low = param_cfg["safe_low"]
    safe_high = param_cfg["safe_high"]
    crit_low = param_cfg["crit_low"]
    crit_high = param_cfg["crit_high"]

    # Critical zone
    if value >= crit_high:
        return "critical", crit_high
    if crit_low is not None and crit_low >= 0 and value <= crit_low:
        return "critical", crit_low

    # Warning zone (between safe and critical)
    if value > safe_high:
        return "warning", safe_high
    if value < safe_low:
        return "warning", safe_low

    return None, None


def _make_message(param: str, severity: str, value: float, threshold: float) -> str:
    direction = "exceeded" if value > threshold else "below"
    return f"{param} {direction} {severity} threshold: {value:.2f} (threshold: {threshold:.2f})"


async def check_and_generate_alerts(
    loco_id: str,
    loco_type: str,
    smoothed_params: dict[str, float],
    config: dict,
) -> list[dict]:
    """
    Check all parameters against thresholds and generate alerts.
    Returns list of new alert dicts.
    """
    new_alerts = []

    for sub_name, sub_cfg in config.get("subsystems", {}).items():
        for param_name, param_cfg in sub_cfg.get("parameters", {}).items():
            value = smoothed_params.get(param_name)
            if value is None:
                continue

            severity, threshold = _get_severity_and_threshold(value, param_cfg)
            if severity is None:
                continue

            if not _check_cooldown(loco_id, param_name, severity):
                continue

            message = _make_message(param_name, severity, value, threshold)

            alert = {
                "loco_id": loco_id,
                "parameter": param_name,
                "severity": severity,
                "value": round(value, 4),
                "threshold": threshold,
                "message": message,
            }
            new_alerts.append(alert)

    if new_alerts:
        await _save_alerts(new_alerts)
        logger.info("alerts_generated", loco_id=loco_id, count=len(new_alerts))

    return new_alerts


async def _save_alerts(alerts: list[dict]):
    pool = get_pool()
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        await conn.executemany(
            """
            INSERT INTO alerts (ts, loco_id, parameter, severity, value, threshold, message)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            [
                (now, a["loco_id"], a["parameter"], a["severity"],
                 a["value"], a["threshold"], a["message"])
                for a in alerts
            ],
        )


def get_active_alerts_map(loco_id: str, recent_alerts: list[dict]) -> dict[str, dict]:
    """Build map of param -> latest alert for penalty calculations."""
    result: dict[str, dict] = {}
    for alert in recent_alerts:
        if alert.get("loco_id") == loco_id:
            param = alert["parameter"]
            if param not in result:
                result[param] = alert
    return result
