from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query

from app.auth.jwt import get_current_user
from app.db.connection import get_pool
from app.services.health_index import get_cached_hi

import json

router = APIRouter(prefix="/api/v1/health-index", tags=["Health Index"])


@router.get("/{loco_id}/current")
async def get_current_hi(loco_id: str, user: dict = Depends(get_current_user)):
    """Get current Health Index with top factors and subsystem scores."""
    cached = get_cached_hi(loco_id)
    if cached:
        return cached

    # Fallback: fetch latest from DB
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT ts, score, status, top_factors, subsystem_scores
            FROM health_index_history
            WHERE loco_id = $1
            ORDER BY ts DESC LIMIT 1
            """,
            loco_id,
        )
    if not row:
        return {"loco_id": loco_id, "score": 0, "status": "Unknown", "top_factors": [], "subsystem_scores": {}}

    return {
        "loco_id": loco_id,
        "ts": row["ts"].isoformat(),
        "score": row["score"],
        "status": row["status"],
        "top_factors": json.loads(row["top_factors"]) if row["top_factors"] else [],
        "subsystem_scores": json.loads(row["subsystem_scores"]) if row["subsystem_scores"] else {},
    }


@router.get("/{loco_id}/history")
async def get_hi_history(
    loco_id: str,
    from_ts: datetime = Query(None, alias="from"),
    to_ts: datetime = Query(None, alias="to"),
    limit: int = Query(1000, ge=1, le=10000),
    user: dict = Depends(get_current_user),
):
    """Get Health Index history."""
    if from_ts is None:
        from_ts = datetime.now(timezone.utc) - timedelta(minutes=15)
    if to_ts is None:
        to_ts = datetime.now(timezone.utc)

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT ts, score, status, top_factors, subsystem_scores
            FROM health_index_history
            WHERE loco_id = $1 AND ts >= $2 AND ts <= $3
            ORDER BY ts ASC
            LIMIT $4
            """,
            loco_id, from_ts, to_ts, limit,
        )

    return {
        "loco_id": loco_id,
        "count": len(rows),
        "data": [
            {
                "ts": row["ts"].isoformat(),
                "score": row["score"],
                "status": row["status"],
            }
            for row in rows
        ],
    }
