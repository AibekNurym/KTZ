import json

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.jwt import require_admin
from app.config import settings

logger = structlog.get_logger(component="api.simulator")

router = APIRouter(prefix="/api/v1/simulator", tags=["Simulator Control"])

CONTROL_CHANNEL = "simulator_control"
STATUS_KEY = "simulator_status"


async def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.redis_url, decode_responses=True)


@router.post("/start")
async def start_simulator(user: dict = Depends(require_admin)):
    r = await _get_redis()
    await r.publish(CONTROL_CHANNEL, json.dumps({"action": "start"}))
    await r.close()
    return {"status": "started"}


@router.post("/stop")
async def stop_simulator(user: dict = Depends(require_admin)):
    r = await _get_redis()
    await r.publish(CONTROL_CHANNEL, json.dumps({"action": "stop"}))
    await r.close()
    return {"status": "stopped"}


class ScenarioRequest(BaseModel):
    scenario: str


@router.post("/scenario")
async def set_scenario(body: ScenarioRequest, user: dict = Depends(require_admin)):
    r = await _get_redis()
    await r.publish(
        CONTROL_CHANNEL,
        json.dumps({"action": "scenario", "scenario": body.scenario}),
    )
    await r.close()
    logger.info("scenario_set", scenario=body.scenario)
    return {"status": "scenario_set", "scenario": body.scenario}


@router.get("/status")
async def get_status(user: dict = Depends(require_admin)):
    r = await _get_redis()
    raw = await r.get(STATUS_KEY)
    await r.close()
    if raw:
        return json.loads(raw)
    return {"running": False, "scenario": None, "uptime": 0}
