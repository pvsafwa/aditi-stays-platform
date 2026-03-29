import asyncio
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from fastapi import WebSocket
from app.core.config import get_settings
from app.db.database import get_db, get_redis


@dataclass(frozen=True)
class SocketClient:
    websocket: WebSocket
    role: str
    actor: str


class ChatManager:
    def __init__(self) -> None:
        self._rooms: dict[int, set[SocketClient]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, lead_id: int, websocket: WebSocket, role: str, actor: str) -> None:
        await websocket.accept()
        client = SocketClient(websocket=websocket, role=role, actor=actor)
        async with self._lock:
            self._rooms[lead_id].add(client)

        redis = await get_redis()
        await redis.sadd("chat:active_leads", str(lead_id))

        await self.broadcast_event(
            lead_id,
            {
                "event": "presence",
                "lead_id": lead_id,
                "role": role,
                "actor": actor,
                "at": datetime.now(timezone.utc).isoformat(),
            },
            persist=False,
        )

    async def disconnect(self, lead_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            if lead_id not in self._rooms:
                return

            remaining = {
                c for c in self._rooms[lead_id] if c.websocket is not websocket
            }
            if remaining:
                self._rooms[lead_id] = remaining
            else:
                self._rooms.pop(lead_id, None)

        redis = await get_redis()
        room_size = await self.active_count(lead_id)
        if room_size == 0:
            await redis.srem("chat:active_leads", str(lead_id))

    async def active_count(self, lead_id: int) -> int:
        async with self._lock:
            return len(self._rooms.get(lead_id, set()))

    async def broadcast_event(self, lead_id: int, payload: dict, persist: bool = False) -> None:
        if persist:
            await self._save_message(lead_id, payload)

        data = json.dumps(payload)
        async with self._lock:
            clients = list(self._rooms.get(lead_id, set()))

        stale: list[SocketClient] = []
        for client in clients:
            try:
                await client.websocket.send_text(data)
            except Exception:
                stale.append(client)

        if stale:
            async with self._lock:
                for client in stale:
                    self._rooms[lead_id].discard(client)

        redis = await get_redis()
        settings = get_settings()
        await redis.publish(settings.chat_events_channel, data)

    async def _save_message(self, lead_id: int, payload: dict) -> None:
        db = await get_db()
        sender_role = payload.get("sender_role", "system")
        sender_label = payload.get("sender_label", "System")
        message_type = payload.get("message_type", "TEXT")
        content = payload.get("content", payload.get("text", ""))
        metadata = payload.get("metadata", {})

        await db.execute(
            """
            INSERT INTO chat_messages(lead_id, sender_role, sender_label, message_type, content, metadata)
            VALUES($1, $2, $3, $4, $5, $6::jsonb)
            """,
            lead_id,
            sender_role,
            sender_label,
            message_type,
            content,
            json.dumps(metadata),
        )

    async def fetch_history(self, lead_id: int) -> list[dict]:
        db = await get_db()
        rows = await db.fetch(
            """
            SELECT sender_role, sender_label, message_type, content, metadata, created_at
            FROM chat_messages
            WHERE lead_id=$1
            ORDER BY created_at ASC
            """,
            lead_id,
        )

        def normalize_metadata(raw: object) -> dict:
            if raw is None:
                return {}
            if isinstance(raw, dict):
                return raw
            if isinstance(raw, str):
                try:
                    parsed = json.loads(raw)
                except Exception:
                    return {}
                return parsed if isinstance(parsed, dict) else {}
            return {}

        return [
            {
                "event": "message",
                "lead_id": lead_id,
                "sender_role": row["sender_role"],
                "sender_label": row["sender_label"],
                "message_type": row["message_type"],
                "content": row["content"],
                "metadata": normalize_metadata(row["metadata"]),
                "created_at": row["created_at"].isoformat(),
            }
            for row in rows
        ]


chat_manager = ChatManager()
