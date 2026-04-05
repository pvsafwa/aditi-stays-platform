import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass

from fastapi import Header, HTTPException, Query, Request, WebSocket

from app.core.config import get_settings


def _extract_bearer(authorization: str | None) -> str:
    if not authorization:
        return ""
    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return ""
    return parts[1].strip()


@dataclass(frozen=True)
class AdminSession:
    email: str
    actor: str
    role: str


@dataclass(frozen=True)
class ChatAccess:
    role: str
    actor: str


def _urlsafe_b64decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def verify_admin_session_token(token: str | None) -> AdminSession | None:
    if not token:
        return None
    try:
        payload_b64, signature_b64 = token.split(".", 1)
    except ValueError:
        return None

    settings = get_settings()
    expected_signature = hmac.new(
        settings.admin_session_secret.encode(),
        payload_b64.encode(),
        hashlib.sha256,
    ).digest()

    try:
        actual_signature = _urlsafe_b64decode(signature_b64)
        payload = json.loads(_urlsafe_b64decode(payload_b64))
    except Exception:
        return None

    if not secrets.compare_digest(actual_signature, expected_signature):
        return None

    email = str(payload.get("email", "")).strip().lower()
    actor = str(payload.get("actor", "")).strip()
    role = str(payload.get("role", "")).strip()

    try:
        exp = int(payload.get("exp", 0) or 0)
    except (TypeError, ValueError):
        return None

    if role != "admin" or not email or not actor or exp <= int(time.time()):
        return None
    return AdminSession(email=email, actor=actor, role=role)


def admin_session_from_request(request: Request) -> AdminSession | None:
    settings = get_settings()
    return verify_admin_session_token(request.cookies.get(settings.admin_session_cookie_name))


def admin_session_from_websocket(websocket: WebSocket) -> AdminSession | None:
    settings = get_settings()
    return verify_admin_session_token(websocket.cookies.get(settings.admin_session_cookie_name))


async def require_admin_http(
    request: Request,
    authorization: str | None = Header(default=None),
    x_admin_actor: str | None = Header(default=None),
) -> str:
    settings = get_settings()
    session = admin_session_from_request(request)
    if session is not None:
        return session.actor

    token = _extract_bearer(authorization)
    if not token or not secrets.compare_digest(token, settings.admin_api_token):
        raise HTTPException(status_code=403, detail="invalid admin token")
    return (x_admin_actor or "admin").strip() or "admin"


def _sign_user_chat_token(lead_id: int, exp: int, secret: str) -> str:
    payload = f"{lead_id}.{exp}".encode()
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def verify_user_chat_token(token: str | None, lead_id: int) -> bool:
    if not token:
        return False
    parts = token.split(".")
    if len(parts) != 3:
        return False

    lead_raw, exp_raw, signature = parts
    if len(signature) != 64:
        return False

    try:
        token_lead_id = int(lead_raw)
        exp = int(exp_raw)
    except ValueError:
        return False

    if token_lead_id != lead_id:
        return False
    if exp <= int(time.time()):
        return False

    settings = get_settings()
    expected_signature = _sign_user_chat_token(lead_id, exp, settings.user_chat_token_secret)
    return secrets.compare_digest(signature, expected_signature)


def verify_admin_ws_token(token: str | None) -> bool:
    if not token:
        return False
    settings = get_settings()
    return secrets.compare_digest(token, settings.admin_chat_token) or secrets.compare_digest(token, settings.admin_api_token)


async def ws_token_query(token: str | None = Query(default=None)) -> str | None:
    return token


async def require_chat_http_access(
    lead_id: int,
    request: Request,
    authorization: str | None = Header(default=None),
    x_chat_token: str | None = Header(default=None),
    x_admin_actor: str | None = Header(default=None),
) -> ChatAccess:
    settings = get_settings()

    session = admin_session_from_request(request)
    if session is not None:
        return ChatAccess(role="admin", actor=session.actor)

    bearer = _extract_bearer(authorization)
    if bearer and secrets.compare_digest(bearer, settings.admin_api_token):
        actor = (x_admin_actor or "admin").strip() or "admin"
        return ChatAccess(role="admin", actor=actor)

    candidate = (x_chat_token or bearer or "").strip()
    if verify_user_chat_token(candidate, lead_id):
        return ChatAccess(role="user", actor="user")

    raise HTTPException(status_code=403, detail="invalid chat token")
