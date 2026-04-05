import asyncio
import json
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.config import get_settings
from app.core.metrics import metrics_state
from app.core.security import admin_session_from_websocket, verify_admin_ws_token, verify_user_chat_token
from app.db.database import get_redis
from app.models.schemas import ChatInput
from app.services.chat_manager import chat_manager

router = APIRouter(tags=["ws"])


@router.websocket("/ws/chat/{lead_id}")
async def chat_socket(websocket: WebSocket, lead_id: int):
    requested_role = websocket.query_params.get("role", "user")
    role = "admin" if requested_role == "admin" else "user"
    actor = websocket.query_params.get("actor", role)
    token = websocket.query_params.get("token")

    if role == "admin":
        session = admin_session_from_websocket(websocket)
        if session is not None:
            actor = session.actor
        elif not verify_admin_ws_token(token):
            await websocket.close(code=1008)
            return
    else:
        if not verify_user_chat_token(token, lead_id):
            await websocket.close(code=1008)
            return
        actor = "user"

    await chat_manager.connect(lead_id, websocket, role=role, actor=actor)
    try:
        history = await chat_manager.fetch_history(lead_id)
        await websocket.send_text(json.dumps({"event": "history", "items": history}))

        while True:
            raw = await websocket.receive_text()
            payload = ChatInput.model_validate_json(raw)
            sender_role = "admin" if role == "admin" else "user"
            sender_label = payload.sender_label.strip() or ("Admin" if sender_role == "admin" else "Guest")

            event_payload = {
                "event": "message",
                "lead_id": lead_id,
                "sender_role": sender_role,
                "sender_label": sender_label,
                "message_type": "TEXT" if payload.type == "message" else "STATUS",
                "content": payload.text,
                "metadata": payload.metadata,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

            if payload.type == "status":
                event_payload["message_type"] = "STATUS"

            metrics_state.record_ws_message()
            await chat_manager.broadcast_event(lead_id, event_payload, persist=True)
    except WebSocketDisconnect:
        await chat_manager.disconnect(lead_id, websocket)
    except Exception:
        await chat_manager.disconnect(lead_id, websocket)
        await websocket.close()


@router.websocket("/ws/admin/notifications")
async def admin_notifications(websocket: WebSocket):
    settings = get_settings()
    token = websocket.query_params.get("token")
    if admin_session_from_websocket(websocket) is None and not verify_admin_ws_token(token):
        await websocket.close(code=1008)
        return

    redis = await get_redis()
    pubsub = redis.pubsub(ignore_subscribe_messages=True)
    await websocket.accept()

    await pubsub.subscribe(settings.lead_notification_channel, settings.chat_events_channel)

    async def redis_pump():
        while True:
            message = await pubsub.get_message(timeout=1.0)
            if message and message.get("type") == "message":
                await websocket.send_text(message["data"])
            await asyncio.sleep(0.05)

    async def inbound_pump():
        while True:
            _ = await websocket.receive_text()

    task1 = asyncio.create_task(redis_pump())
    task2 = asyncio.create_task(inbound_pump())

    try:
        await asyncio.gather(task1, task2)
    except WebSocketDisconnect:
        task1.cancel()
        task2.cancel()
    except Exception:
        task1.cancel()
        task2.cancel()
    finally:
        await pubsub.unsubscribe(settings.lead_notification_channel, settings.chat_events_channel)
        await pubsub.close()
