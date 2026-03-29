import asyncio
import asyncpg
from redis.asyncio import Redis
from app.core.config import get_settings

_db_pool: asyncpg.Pool | None = None
_redis: Redis | None = None


async def init_db() -> asyncpg.Pool:
    global _db_pool
    if _db_pool is None:
        settings = get_settings()
        dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        last_error: Exception | None = None
        for attempt in range(1, settings.db_connect_retries + 1):
            try:
                _db_pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=12)
                break
            except Exception as err:
                last_error = err
                if attempt == settings.db_connect_retries:
                    raise
                await asyncio.sleep(settings.db_connect_retry_delay_seconds)

        if _db_pool is None and last_error is not None:
            raise last_error
    return _db_pool


async def get_db() -> asyncpg.Pool:
    if _db_pool is None:
        return await init_db()
    return _db_pool


async def init_redis() -> Redis:
    global _redis
    if _redis is None:
        settings = get_settings()
        last_error: Exception | None = None
        for attempt in range(1, settings.redis_connect_retries + 1):
            try:
                _redis = Redis.from_url(settings.redis_url, decode_responses=True)
                await _redis.ping()
                break
            except Exception as err:
                last_error = err
                if attempt == settings.redis_connect_retries:
                    raise
                await asyncio.sleep(settings.redis_connect_retry_delay_seconds)

        if _redis is None and last_error is not None:
            raise last_error
    return _redis


async def get_redis() -> Redis:
    if _redis is None:
        return await init_redis()
    return _redis


async def close_all() -> None:
    global _db_pool, _redis
    if _db_pool is not None:
        await _db_pool.close()
        _db_pool = None
    if _redis is not None:
        await _redis.aclose()
        _redis = None
