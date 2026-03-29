from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class MetricsState:
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    requests_total: int = 0
    by_status: Counter[int] = field(default_factory=Counter)
    by_path: Counter[str] = field(default_factory=Counter)
    websocket_messages_total: int = 0

    def record_http(self, path: str, status: int) -> None:
        self.requests_total += 1
        self.by_status[status] += 1
        self.by_path[path] += 1

    def record_ws_message(self) -> None:
        self.websocket_messages_total += 1

    def prometheus_text(self) -> str:
        lines: list[str] = []
        lines.append("# HELP aditi_chat_requests_total Total HTTP requests")
        lines.append("# TYPE aditi_chat_requests_total counter")
        lines.append(f"aditi_chat_requests_total {self.requests_total}")

        lines.append("# HELP aditi_chat_requests_by_status_total Requests by HTTP status")
        lines.append("# TYPE aditi_chat_requests_by_status_total counter")
        for status, count in sorted(self.by_status.items()):
            lines.append(f'aditi_chat_requests_by_status_total{{status="{status}"}} {count}')

        lines.append("# HELP aditi_chat_requests_by_path_total Requests by path")
        lines.append("# TYPE aditi_chat_requests_by_path_total counter")
        for path, count in sorted(self.by_path.items()):
            escaped = path.replace('"', '\\"')
            lines.append(f'aditi_chat_requests_by_path_total{{path="{escaped}"}} {count}')

        lines.append("# HELP aditi_chat_websocket_messages_total Total websocket messages")
        lines.append("# TYPE aditi_chat_websocket_messages_total counter")
        lines.append(f"aditi_chat_websocket_messages_total {self.websocket_messages_total}")

        uptime = int((datetime.now(timezone.utc) - self.started_at).total_seconds())
        lines.append("# HELP aditi_chat_uptime_seconds Process uptime in seconds")
        lines.append("# TYPE aditi_chat_uptime_seconds gauge")
        lines.append(f"aditi_chat_uptime_seconds {uptime}")

        return "\n".join(lines) + "\n"


metrics_state = MetricsState()
