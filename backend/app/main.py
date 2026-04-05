import asyncio
import time

import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.connection import init_db, close_db, get_pool
from app.logging_config import setup_logging
from app.services.ingest import ingest_worker
from app.api.telemetry import router as telemetry_router
from app.api.auth import router as auth_router
from app.api.health_index import router as health_index_router
from app.api.alerts import router as alerts_router
from app.api.config import router as config_router
from app.ws.telemetry_ws import router as ws_router
from app.ws.manager import get_connection_count
from app.api.simulator import router as simulator_router
from app.api.export import router as export_router
from app.api.users import router as users_router

setup_logging()
logger = structlog.get_logger(component="main")

START_TIME = time.time()

app = FastAPI(
    title="Digital Twin of Locomotive",
    description="Real-time locomotive health monitoring API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(telemetry_router)
app.include_router(health_index_router)
app.include_router(alerts_router)
app.include_router(config_router)
app.include_router(ws_router)
app.include_router(simulator_router)
app.include_router(export_router)
app.include_router(users_router)

redis_client: aioredis.Redis | None = None
_background_tasks: list[asyncio.Task] = []


@app.on_event("startup")
async def startup():
    global redis_client
    await init_db()
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    # Start background ingest worker
    task = asyncio.create_task(ingest_worker())
    _background_tasks.append(task)
    logger.info("application_started")


@app.on_event("shutdown")
async def shutdown():
    global redis_client
    for task in _background_tasks:
        task.cancel()
    await close_db()
    if redis_client:
        await redis_client.close()
    logger.info("application_stopped")


@app.get("/health", tags=["System"])
async def health_check():
    db_ok = False
    redis_ok = False

    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        db_ok = True
    except Exception:
        pass

    try:
        if redis_client:
            await redis_client.ping()
            redis_ok = True
    except Exception:
        pass

    uptime = round(time.time() - START_TIME, 1)
    status = "ok" if (db_ok and redis_ok) else "degraded"

    return {
        "status": status,
        "db": "connected" if db_ok else "disconnected",
        "redis": "connected" if redis_ok else "disconnected",
        "uptime_seconds": uptime,
        "ws_connections": get_connection_count(),
    }
