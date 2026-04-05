import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.jwt import get_current_user, require_admin
from app.db.connection import get_pool

router = APIRouter(prefix="/api/v1/config", tags=["Configuration"])


@router.get("/{loco_type}")
async def get_config(loco_type: str, user: dict = Depends(get_current_user)):
    """Get locomotive configuration (parameters, thresholds, weights)."""
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT config, updated_at FROM loco_config WHERE loco_type = $1",
            loco_type,
        )
    if not row:
        raise HTTPException(status_code=404, detail=f"Config not found for {loco_type}")

    return {
        "loco_type": loco_type,
        "config": json.loads(row["config"]),
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


class UpdateConfigRequest(BaseModel):
    config: dict


@router.put("/{loco_type}")
async def update_config(
    loco_type: str,
    body: UpdateConfigRequest,
    user: dict = Depends(require_admin),
):
    """Update locomotive configuration (admin only)."""
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE loco_config
            SET config = $1, updated_at = $2
            WHERE loco_type = $3
            """,
            json.dumps(body.config),
            datetime.now(timezone.utc),
            loco_type,
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail=f"Config not found for {loco_type}")

    return {"status": "updated", "loco_type": loco_type}


@router.get("/subsystems/{loco_type}")
async def get_subsystems(loco_type: str, user: dict = Depends(get_current_user)):
    """Get list of subsystems and their weights."""
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT config FROM loco_config WHERE loco_type = $1",
            loco_type,
        )
    if not row:
        raise HTTPException(status_code=404, detail=f"Config not found for {loco_type}")

    config = json.loads(row["config"])
    subsystems = []
    for name, sub in config.get("subsystems", {}).items():
        subsystems.append({
            "name": name,
            "weight": sub.get("weight", 0),
            "parameter_count": len(sub.get("parameters", {})),
        })

    return {"loco_type": loco_type, "subsystems": subsystems}
