from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.routes import router as api_router
from app.websocket.routes import router as ws_router
from app.db.database import init_db, init_redis, close_all
from app.core.config import get_settings
from app.core.rate_limit import IPRateLimitMiddleware
from app.core.metrics import metrics_state
import os


def parse_origins(raw: str) -> list[str]:
    out: list[str] = []
    for part in raw.split(","):
        origin = part.strip()
        if origin and origin not in out:
            out.append(origin)
    return out


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    if settings.storage_backend == "local":
        os.makedirs(settings.upload_dir, exist_ok=True)
    await init_db()
    await init_redis()
    yield
    await close_all()


app = FastAPI(title="Aditi Stays Chat Service", lifespan=lifespan)
settings = get_settings()
allowed_origins = parse_origins(settings.cors_allowed_origins)
allow_all_origins = "*" in allowed_origins

if settings.storage_backend == "local":
    os.makedirs(settings.upload_dir, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["http://localhost:3000"],
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(IPRateLimitMiddleware, limit=settings.chat_rate_limit_per_minute, window_seconds=60)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir, check_dir=False), name="uploads")


@app.middleware("http")
async def capture_metrics(request: Request, call_next):
    response = await call_next(request)
    metrics_state.record_http(request.url.path, response.status_code)
    return response


app.include_router(api_router)
app.include_router(ws_router)
