from datetime import datetime, timezone, timedelta

import structlog
from fastapi import APIRouter, Query

from app.db.connection import get_pool

logger = structlog.get_logger(component="api.telemetry")

router = APIRouter(prefix="/api/v1/telemetry", tags=["Telemetry"])


@router.get("/{loco_id}/latest")
async def get_latest_telemetry(loco_id: str):
    """Get latest values of all parameters for a locomotive."""
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT ON (parameter)
                parameter, value_raw, value_smooth, unit, quality, ts
            FROM telemetry_raw
            WHERE loco_id = $1
            ORDER BY parameter, ts DESC
            """,
            loco_id,
        )

    if not rows:
        return {"loco_id": loco_id, "parameters": {}, "ts": None}

    parameters = {}
    latest_ts = None
    for row in rows:
        parameters[row["parameter"]] = {
            "value_raw": row["value_raw"],
            "value_smooth": row["value_smooth"],
            "unit": row["unit"],
            "quality": row["quality"],
            "ts": row["ts"].isoformat(),
        }
        if latest_ts is None or row["ts"] > latest_ts:
            latest_ts = row["ts"]

    return {
        "loco_id": loco_id,
        "parameters": parameters,
        "ts": latest_ts.isoformat() if latest_ts else None,
    }


@router.get("/{loco_id}/history")
async def get_telemetry_history(
    loco_id: str,
    parameter: str = Query(..., description="Parameter name"),
    from_ts: datetime = Query(
        None, alias="from", description="Start time (ISO 8601)"
    ),
    to_ts: datetime = Query(
        None, alias="to", description="End time (ISO 8601)"
    ),
    limit: int = Query(1000, ge=1, le=10000),
):
    """Get historical telemetry data for a specific parameter."""
    if from_ts is None:
        from_ts = datetime.now(timezone.utc) - timedelta(minutes=15)
    if to_ts is None:
        to_ts = datetime.now(timezone.utc)

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT ts, value_raw, value_smooth, quality
            FROM telemetry_raw
            WHERE loco_id = $1 AND parameter = $2 AND ts >= $3 AND ts <= $4
            ORDER BY ts ASC
            LIMIT $5
            """,
            loco_id, parameter, from_ts, to_ts, limit,
        )

    return {
        "loco_id": loco_id,
        "parameter": parameter,
        "from": from_ts.isoformat(),
        "to": to_ts.isoformat(),
        "count": len(rows),
        "data": [
            {
                "ts": row["ts"].isoformat(),
                "value_raw": row["value_raw"],
                "value_smooth": row["value_smooth"],
                "quality": row["quality"],
            }
            for row in rows
        ],
    }
