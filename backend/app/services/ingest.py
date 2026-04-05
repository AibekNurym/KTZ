import asyncio
import json
import time
from collections import deque
from datetime import datetime

import redis.asyncio as aioredis
import structlog

from app.config import settings
from app.db.connection import get_pool
from app.services.health_index import compute_health_index, save_health_index, load_configs as load_hi_configs
from app.services.alert_generator import check_and_generate_alerts

logger = structlog.get_logger(component="ingest")

# Latest smoothed params per loco_id for HI computation
_latest_smoothed: dict[str, dict[str, float]] = {}

# Recent alerts for penalty calculations
_recent_alerts: list[dict] = []

QUEUE_KEY = "telemetry_queue"
EMA_ALPHA = 0.3
FORWARD_FILL_MAX_SEC = 5.0

# In-memory state per (loco_id, parameter)
_smooth_values: dict[tuple[str, str], float] = {}
_last_raw_values: dict[tuple[str, str], tuple[float, float]] = {}  # (value, timestamp)
_dedup_set: deque[tuple[str, str]] = deque(maxlen=200)  # (loco_id, ts)

# Physical ranges per loco_type loaded from DB config
_loco_configs: dict[str, dict] = {}


async def load_loco_configs():
    """Load loco configs from DB for outlier filtering."""
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT loco_type, config FROM loco_config")
        for row in rows:
            _loco_configs[row["loco_type"]] = json.loads(row["config"])
    logger.info("loco_configs_loaded", types=list(_loco_configs.keys()))


def _get_param_config(loco_type: str, param: str) -> dict | None:
    """Get parameter config from loaded loco configs."""
    cfg = _loco_configs.get(loco_type)
    if not cfg:
        return None
    for sub_name, sub in cfg.get("subsystems", {}).items():
        params = sub.get("parameters", {})
        if param in params:
            return params[param]
    return None


def _is_duplicate(loco_id: str, ts: str) -> bool:
    key = (loco_id, ts)
    if key in _dedup_set:
        return True
    _dedup_set.append(key)
    return False


def _filter_outlier(loco_type: str, param: str, value: float) -> bool:
    """Return True if value is an outlier (should be rejected)."""
    pcfg = _get_param_config(loco_type, param)
    if not pcfg:
        return False
    crit_low = pcfg.get("crit_low", float("-inf"))
    crit_high = pcfg.get("crit_high", float("inf"))
    # Allow some margin beyond critical for physical plausibility
    margin = (crit_high - crit_low) * 0.5 if crit_high > crit_low else 100
    if value < crit_low - margin or value > crit_high + margin:
        return True
    return False


def _ema_smooth(loco_id: str, param: str, raw: float) -> float:
    key = (loco_id, param)
    prev = _smooth_values.get(key)
    if prev is None:
        _smooth_values[key] = raw
        return raw
    smoothed = EMA_ALPHA * raw + (1 - EMA_ALPHA) * prev
    _smooth_values[key] = smoothed
    return smoothed


def _forward_fill(loco_id: str, param: str, now_ts: float) -> tuple[float | None, int]:
    """Try forward-fill for missing param. Returns (value, quality) or (None, -)."""
    key = (loco_id, param)
    last = _last_raw_values.get(key)
    if last is None:
        return None, 0
    last_val, last_ts = last
    if (now_ts - last_ts) <= FORWARD_FILL_MAX_SEC:
        return last_val, 1  # quality=1 means interpolated
    return None, 0


async def _insert_telemetry_batch(records: list[dict]):
    if not records:
        return
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.executemany(
            """
            INSERT INTO telemetry_raw (ts, loco_id, loco_type, parameter, value_raw, value_smooth, unit, quality)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
            [
                (
                    r["ts"], r["loco_id"], r["loco_type"], r["parameter"],
                    r["value_raw"], r["value_smooth"], r["unit"], r["quality"],
                )
                for r in records
            ],
        )


async def process_message(msg_str: str) -> list[dict]:
    """Process a single telemetry message. Returns list of records for DB."""
    try:
        msg = json.loads(msg_str)
    except json.JSONDecodeError:
        logger.warning("invalid_json")
        return []

    loco_id = msg.get("loco_id")
    loco_type = msg.get("loco_type")
    ts_str = msg.get("ts")
    parameters = msg.get("parameters")

    # Validate required fields
    if not all([loco_id, loco_type, ts_str, parameters]):
        logger.warning("missing_fields", loco_id=loco_id)
        return []

    # Parse timestamp
    try:
        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        logger.warning("invalid_timestamp", ts=ts_str)
        return []

    # Deduplicate
    if _is_duplicate(loco_id, ts_str):
        logger.debug("duplicate_skipped", loco_id=loco_id, ts=ts_str)
        return []

    now_ts = time.time()
    records = []

    for param_name, raw_value in parameters.items():
        if raw_value is None:
            continue

        try:
            raw_value = float(raw_value)
        except (ValueError, TypeError):
            continue

        # Filter outliers
        if _filter_outlier(loco_type, param_name, raw_value):
            logger.debug("outlier_rejected", param=param_name, value=raw_value)
            continue

        # Track last raw value
        _last_raw_values[(loco_id, param_name)] = (raw_value, now_ts)

        # EMA smoothing
        smooth_value = _ema_smooth(loco_id, param_name, raw_value)

        # Get unit from config
        pcfg = _get_param_config(loco_type, param_name)
        unit = pcfg.get("unit", "") if pcfg else ""

        records.append({
            "ts": ts,
            "loco_id": loco_id,
            "loco_type": loco_type,
            "parameter": param_name,
            "value_raw": round(raw_value, 4),
            "value_smooth": round(smooth_value, 4),
            "unit": unit,
            "quality": 0,
        })

    return records


async def ingest_worker():
    """Background worker consuming telemetry from Redis queue."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)

    # Wait for Redis
    while True:
        try:
            await r.ping()
            logger.info("ingest_redis_connected")
            break
        except Exception:
            await asyncio.sleep(2)

    # Load configs
    await load_loco_configs()

    # Load HI configs
    await load_hi_configs()

    tick_count = 0
    while True:
        try:
            # BRPOP with 1s timeout (FIFO: LPUSH + BRPOP)
            result = await r.brpop(QUEUE_KEY, timeout=1)
            if result is None:
                continue

            _, msg_str = result
            records = await process_message(msg_str)

            if not records:
                continue

            await _insert_telemetry_batch(records)

            # Update latest smoothed params
            loco_id = records[0]["loco_id"]
            loco_type = records[0]["loco_type"]
            if loco_id not in _latest_smoothed:
                _latest_smoothed[loco_id] = {}
            for rec in records:
                _latest_smoothed[loco_id][rec["parameter"]] = rec["value_smooth"]

            # Generate alerts
            config = _loco_configs.get(loco_type, {})
            new_alerts = await check_and_generate_alerts(
                loco_id, loco_type, _latest_smoothed[loco_id], config,
            )
            _recent_alerts.extend(new_alerts)
            # Keep only last 100 alerts in memory
            if len(_recent_alerts) > 100:
                _recent_alerts[:] = _recent_alerts[-100:]

            # Build active alerts map for penalty
            from app.services.alert_generator import get_active_alerts_map
            active_alerts = get_active_alerts_map(loco_id, _recent_alerts)

            # Compute Health Index
            hi_result = await compute_health_index(
                loco_id, loco_type, _latest_smoothed[loco_id], active_alerts,
            )
            await save_health_index(loco_id, hi_result)

            # Broadcast via WebSocket
            from app.ws.manager import broadcast_telemetry_update
            await broadcast_telemetry_update(
                loco_id=loco_id,
                ts=records[0]["ts"].isoformat(),
                parameters=_latest_smoothed[loco_id],
                health_index=hi_result,
                new_alerts=new_alerts,
            )

            tick_count += 1
            if tick_count % 20 == 0:
                queue_len = await r.llen(QUEUE_KEY)
                logger.info(
                    "ingest_progress",
                    processed=tick_count,
                    batch_size=len(records),
                    queue_depth=queue_len,
                    hi_score=hi_result["score"],
                )

        except Exception as e:
            logger.error("ingest_error", error=str(e))
            await asyncio.sleep(1)
