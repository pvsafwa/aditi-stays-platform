from __future__ import annotations

import httpx
from app.core.config import get_settings


def _normalize_whatsapp_phone(phone: str) -> str:
    cleaned = phone.strip().replace(" ", "")
    if cleaned.startswith("+"):
        return cleaned
    return f"+{cleaned}"


async def _send_twilio(phone: str, body: str) -> bool:
    settings = get_settings()
    if not settings.twilio_account_sid or not settings.twilio_auth_token or not settings.twilio_whatsapp_from:
        print("[whatsapp] twilio credentials missing")
        return False

    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
    payload = {
        "To": f"whatsapp:{_normalize_whatsapp_phone(phone)}",
        "From": f"whatsapp:{_normalize_whatsapp_phone(settings.twilio_whatsapp_from)}",
        "Body": body,
    }

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            url,
            data=payload,
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
        )
    if response.status_code >= 400:
        print(f"[whatsapp] twilio failed: {response.status_code} {response.text}")
        return False
    return True


async def _send_meta(phone: str, body: str) -> bool:
    settings = get_settings()
    if not settings.meta_whatsapp_token or not settings.meta_phone_number_id:
        print("[whatsapp] meta credentials missing")
        return False

    url = f"https://graph.facebook.com/v21.0/{settings.meta_phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": _normalize_whatsapp_phone(phone),
        "type": "text",
        "text": {"body": body},
    }
    headers = {
        "Authorization": f"Bearer {settings.meta_whatsapp_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(url, json=payload, headers=headers)
    if response.status_code >= 400:
        print(f"[whatsapp] meta failed: {response.status_code} {response.text}")
        return False
    return True


async def send_whatsapp_confirmation(phone: str, body: str) -> bool:
    settings = get_settings()
    if not phone:
        return False

    provider = settings.whatsapp_provider
    if provider == "twilio":
        return await _send_twilio(phone, body)
    if provider == "meta":
        return await _send_meta(phone, body)

    print(f"[whatsapp:stub] {phone} <- {body}")
    return False
