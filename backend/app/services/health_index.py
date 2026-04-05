"""
Health Index Engine — mathematical model per ТЗ section 10.

Pipeline: Parameters → normalize → subsystem scores → global HI
"""

import json
import time
from datetime import datetime, timezone

import structlog

from app.db.connection import get_pool

logger = structlog.get_logger(component="health_index")

# In-memory cache of latest HI per loco_id
_hi_cache: dict[str, dict] = {}

# Loaded configs
_configs: dict[str, dict] = {}


async def load_configs():
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT loco_type, config FROM loco_config")
        for row in rows:
            _configs[row["loco_type"]] = json.loads(row["config"])
    logger.info("hi_configs_loaded", types=list(_configs.keys()))


def get_cached_hi(loco_id: str) -> dict | None:
    return _hi_cache.get(loco_id)


def normalize(value: float | None, param_cfg: dict) -> float:
    """
    Normalize parameter value to [0, 1].
    1.0 = safe zone, linear decay in warning zone, 0.0 = beyond critical.
    NaN/None → 0.0
    """
    if value is None:
        return 0.0

    safe_low = param_cfg["safe_low"]
    safe_high = param_cfg["safe_high"]
    warn_low = param_cfg.get("warn_low", safe_low)
    warn_high = param_cfg.get("warn_high", safe_high)
    crit_low = param_cfg["crit_low"]
    crit_high = param_cfg["crit_high"]

    # In safe zone
    if safe_low <= value <= safe_high:
        return 1.0

    # Below safe — check warning/critical zones on low side
    if value < safe_low:
        if crit_low is not None and value <= crit_low:
            return 0.0
        # Warning zone: linear interpolation
        s_near = safe_low
        t_bound = crit_low if crit_low is not None else warn_low
        if t_bound >= s_near:
            return 0.0
        return max(0.0, 1.0 - abs(value - s_near) / abs(t_bound - s_near))

    # Above safe — check warning/critical zones on high side
    if value > safe_high:
        if crit_high is not None and value >= crit_high:
            return 0.0
        s_near = safe_high
        t_bound = crit_high if crit_high is not None else warn_high
        if t_bound <= s_near:
            return 0.0
        return max(0.0, 1.0 - abs(value - s_near) / abs(t_bound - s_near))

    return 1.0


def calculate_penalty(n_crit: int, n_warn: int) -> float:
    """
    Alert penalty multiplier per ТЗ section 10.3.
    penalty = max(0.5, 1 - 0.1 * N_crit - 0.05 * N_warn)
    """
    return max(0.5, 1.0 - 0.1 * n_crit - 0.05 * n_warn)


def calculate_subsystem_score(
    param_norms: dict[str, float],
    param_weights: dict[str, float],
    penalty: float,
) -> float:
    """
    Subsystem score per ТЗ section 10.4.
    S_sub = penalty * sum(w_p * norm_p) / sum(w_p)
    """
    total_weighted = 0.0
    total_weight = 0.0
    for param, norm_val in param_norms.items():
        w = param_weights.get(param, 1.0)
        total_weighted += w * norm_val
        total_weight += w

    if total_weight == 0:
        return 0.0

    return penalty * (total_weighted / total_weight)


def calculate_global_hi(
    subsystem_scores: dict[str, float],
    subsystem_weights: dict[str, float],
) -> float:
    """
    Global HI per ТЗ section 10.5.
    HI = round(sum(W_sub * S_sub) / sum(W_sub) * 100, 1)
    Clamped to [0, 100].
    """
    total_weighted = 0.0
    total_weight = 0.0
    for sub_name, score in subsystem_scores.items():
        w = subsystem_weights.get(sub_name, 1.0)
        total_weighted += w * score
        total_weight += w

    if total_weight == 0:
        return 0.0

    hi = round((total_weighted / total_weight) * 100, 1)
    return max(0.0, min(100.0, hi))


def categorize(score: float) -> str:
    """Categorize HI score per ТЗ section 10.6."""
    if score >= 70:
        return "Normal"
    elif score >= 40:
        return "Attention"
    else:
        return "Critical"


def get_top_factors(
    all_params: dict[str, float | None],
    config: dict,
    k: int = 5,
) -> list[dict]:
    """
    Top-k factors per ТЗ section 10.7.
    contribution(p) = W_sub(p) * w_p * (1 - norm(v_p, p))
    """
    contributions = []

    for sub_name, sub_cfg in config.get("subsystems", {}).items():
        w_sub = sub_cfg.get("weight", 1.0)
        for param_name, param_cfg in sub_cfg.get("parameters", {}).items():
            value = all_params.get(param_name)
            norm_val = normalize(value, param_cfg)
            w_p = param_cfg.get("weight", 1.0)
            contribution = w_sub * w_p * (1.0 - norm_val)

            if contribution > 0.0001:
                contributions.append({
                    "parameter": param_name,
                    "subsystem": sub_name,
                    "value": value,
                    "safe_range": [param_cfg["safe_low"], param_cfg["safe_high"]],
                    "contribution": round(contribution, 4),
                    "norm": round(norm_val, 4),
                    "action": _recommend_action(param_name, value, param_cfg, norm_val),
                })

    contributions.sort(key=lambda x: x["contribution"], reverse=True)
    return contributions[:k]


def _recommend_action(param: str, value: float | None, cfg: dict, norm: float) -> str:
    if value is None:
        return "Check sensor connectivity"
    if norm == 0.0:
        return f"CRITICAL: {param} at {value} — immediate intervention required"
    if norm < 0.5:
        return f"WARNING: {param} at {value} — monitor closely, prepare for action"
    if norm < 1.0:
        return f"Monitor {param} trend — approaching warning zone"
    return "Normal"


async def compute_health_index(
    loco_id: str,
    loco_type: str,
    smoothed_params: dict[str, float],
    active_alerts: dict[str, dict] | None = None,
) -> dict:
    """
    Compute full Health Index for a locomotive.
    Returns dict with score, status, top_factors, subsystem_scores.
    """
    if not _configs:
        await load_configs()

    config = _configs.get(loco_type)
    if not config:
        logger.warning("no_config_for_type", loco_type=loco_type)
        return {"score": 0, "status": "Critical", "top_factors": [], "subsystem_scores": {}}

    start = time.monotonic()

    subsystem_scores = {}
    subsystem_weights = {}

    if active_alerts is None:
        active_alerts = {}

    for sub_name, sub_cfg in config.get("subsystems", {}).items():
        w_sub = sub_cfg.get("weight", 1.0)
        subsystem_weights[sub_name] = w_sub

        param_norms = {}
        param_weights = {}

        # Count alerts for this subsystem
        n_crit = 0
        n_warn = 0

        for param_name, param_cfg in sub_cfg.get("parameters", {}).items():
            value = smoothed_params.get(param_name)
            param_norms[param_name] = normalize(value, param_cfg)
            param_weights[param_name] = param_cfg.get("weight", 1.0)

            # Count alerts per subsystem
            alert_info = active_alerts.get(param_name)
            if alert_info:
                if alert_info.get("severity") == "critical":
                    n_crit += 1
                elif alert_info.get("severity") == "warning":
                    n_warn += 1

        penalty = calculate_penalty(n_crit, n_warn)
        subsystem_scores[sub_name] = round(
            calculate_subsystem_score(param_norms, param_weights, penalty), 4
        )

    score = calculate_global_hi(subsystem_scores, subsystem_weights)
    status = categorize(score)
    top_factors = get_top_factors(smoothed_params, config)

    elapsed_ms = round((time.monotonic() - start) * 1000, 2)

    result = {
        "score": score,
        "status": status,
        "top_factors": top_factors,
        "subsystem_scores": subsystem_scores,
    }

    # Cache
    _hi_cache[loco_id] = {
        **result,
        "loco_id": loco_id,
        "ts": datetime.now(timezone.utc).isoformat(),
        "compute_ms": elapsed_ms,
    }

    return result


async def save_health_index(loco_id: str, result: dict):
    """Persist HI to health_index_history table."""
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO health_index_history (ts, loco_id, score, status, top_factors, subsystem_scores)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            datetime.now(timezone.utc),
            loco_id,
            result["score"],
            result["status"],
            json.dumps(result["top_factors"]),
            json.dumps(result["subsystem_scores"]),
        )
