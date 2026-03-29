from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Deque

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class IPRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limit: int, window_seconds: int = 60) -> None:
        super().__init__(app)
        self.limit = max(limit, 1)
        self.window = timedelta(seconds=window_seconds)
        self.hits: dict[str, Deque[datetime]] = defaultdict(deque)
        self._last_sweep = datetime.now(timezone.utc)
        self._sweep_interval = self.window

    async def dispatch(self, request: Request, call_next):
        if request.url.path.endswith("/health"):
            return await call_next(request)

        key = request.client.host if request.client else "unknown"
        now = datetime.now(timezone.utc)
        cutoff = now - self.window
        if now - self._last_sweep >= self._sweep_interval:
            self._sweep(cutoff)
            self._last_sweep = now

        bucket = self.hits[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()

        if len(bucket) >= self.limit:
            retry_after = int(self.window.total_seconds())
            return JSONResponse(
                {"detail": "rate limit exceeded"},
                status_code=429,
                headers={"Retry-After": str(retry_after)},
            )

        bucket.append(now)
        self.hits[key] = bucket
        return await call_next(request)

    def _sweep(self, cutoff: datetime) -> None:
        for ip, bucket in list(self.hits.items()):
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if not bucket:
                self.hits.pop(ip, None)
