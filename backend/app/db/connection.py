import asyncpg
import structlog

from app.config import settings

logger = structlog.get_logger(component="db")

pool: asyncpg.Pool | None = None


def _get_dsn() -> str:
    return (
        f"postgresql://{settings.postgres_user}:{settings.postgres_password}"
        f"@db:5432/{settings.postgres_db}"
    )


async def init_db():
    global pool
    dsn = _get_dsn()
    pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10)
    logger.info("database_pool_created")


async def close_db():
    global pool
    if pool:
        await pool.close()
        logger.info("database_pool_closed")


def get_pool() -> asyncpg.Pool:
    if pool is None:
        raise RuntimeError("Database pool not initialized")
    return pool
