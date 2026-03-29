import asyncio
import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import JSONResponse, PlainTextResponse
from app.core.config import get_settings
from app.core.metrics import metrics_state
from app.core.security import ChatAccess, require_admin_http, require_chat_http_access
from app.db.database import get_db
from app.models.schemas import ShareGPayInput, ConfirmInput, AdminStatusInput
from app.services.chat_manager import chat_manager
from app.services.whatsapp import send_whatsapp_confirmation

router = APIRouter(prefix="/api", tags=["api"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".m4v", ".ogv"}


def _safe_extension(filename: str | None) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext in ALLOWED_EXTENSIONS:
        return ext
    return ".jpg"


async def _upload_to_s3(
    lead_id: int,
    extension: str,
    payload: bytes,
    content_type: str,
) -> str:
    settings = get_settings()
    if settings.s3_bucket.strip() == "":
        raise HTTPException(status_code=500, detail="S3_BUCKET is required for s3 storage backend")

    key = f"{settings.s3_prefix.strip('/').strip() or 'payment-proofs'}/proof_{lead_id}_{uuid.uuid4().hex}{extension}"

    def write_object() -> None:
        import boto3

        client_kwargs: dict[str, str] = {}
        if settings.s3_region:
            client_kwargs["region_name"] = settings.s3_region
        if settings.s3_endpoint_url:
            client_kwargs["endpoint_url"] = settings.s3_endpoint_url

        client = boto3.client("s3", **client_kwargs)
        client.put_object(Bucket=settings.s3_bucket, Key=key, Body=payload, ContentType=content_type)

    await asyncio.to_thread(write_object)

    public_base = settings.s3_public_base_url.strip().rstrip("/")
    if public_base:
        return f"{public_base}/{key}"

    region = settings.s3_region.strip() or "us-east-1"
    if region == "us-east-1":
        return f"https://{settings.s3_bucket}.s3.amazonaws.com/{key}"
    return f"https://{settings.s3_bucket}.s3.{region}.amazonaws.com/{key}"


async def _upload_blob_to_s3(
    key: str,
    payload: bytes,
    content_type: str,
) -> str:
    settings = get_settings()
    if settings.s3_bucket.strip() == "":
        raise HTTPException(status_code=500, detail="S3_BUCKET is required for s3 storage backend")

    def write_object() -> None:
        import boto3

        client_kwargs: dict[str, str] = {}
        if settings.s3_region:
            client_kwargs["region_name"] = settings.s3_region
        if settings.s3_endpoint_url:
            client_kwargs["endpoint_url"] = settings.s3_endpoint_url

        client = boto3.client("s3", **client_kwargs)
        client.put_object(Bucket=settings.s3_bucket, Key=key, Body=payload, ContentType=content_type)

    await asyncio.to_thread(write_object)

    public_base = settings.s3_public_base_url.strip().rstrip("/")
    if public_base:
        return f"{public_base}/{key}"

    region = settings.s3_region.strip() or "us-east-1"
    if region == "us-east-1":
        return f"https://{settings.s3_bucket}.s3.amazonaws.com/{key}"
    return f"https://{settings.s3_bucket}.s3.{region}.amazonaws.com/{key}"


async def _send_delayed_auto_intro_reply(lead_id: int, clean_name: str) -> None:
    try:
        await asyncio.sleep(3)
        auto_reply_text = (
            f"Thank you for reaching out to Aditi Stays, {clean_name}. "
            "We are currently checking availability with the property for your requested dates. "
            "Please wait while we get back to you."
        )
        auto_reply = {
            "event": "message",
            "lead_id": lead_id,
            "sender_role": "admin",
            "sender_label": "Aditi Stays",
            "message_type": "AUTO_RESPONSE",
            "content": auto_reply_text,
            "metadata": {"auto_reply": True},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await chat_manager.broadcast_event(lead_id, auto_reply, persist=True)
    except Exception:
        # Do not fail the request path if delayed auto reply task fails.
        return


@router.get("/health")
async def health() -> dict:
    return {"ok": True}


@router.get("/metrics")
async def metrics() -> PlainTextResponse:
    return PlainTextResponse(metrics_state.prometheus_text(), media_type="text/plain; version=0.0.4")


@router.get("/chat/{lead_id}/messages")
async def list_messages(lead_id: int, _: ChatAccess = Depends(require_chat_http_access)) -> dict:
    history = await chat_manager.fetch_history(lead_id)
    return {"data": history}


@router.post("/chat/{lead_id}/share-gpay")
async def share_gpay(
    lead_id: int,
    payload: ShareGPayInput,
    admin_actor: str = Depends(require_admin_http),
) -> JSONResponse:
    mobile_number = (payload.mobile_number or "").strip()
    content = (
        f"GPay details shared. Number: {mobile_number}. "
        "Please scan the QR and share payment proof here."
    )
    message = {
        "event": "message",
        "lead_id": lead_id,
        "sender_role": "admin",
        "sender_label": payload.sender_label,
        "message_type": "GPAY_DETAILS",
        "content": content,
        "metadata": {
            "qr_url": payload.qr_url,
            "mobile_number": payload.mobile_number,
            "admin_actor": admin_actor,
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await chat_manager.broadcast_event(lead_id, message, persist=True)
    return JSONResponse({"ok": True, "data": message}, status_code=201)


@router.post("/chat/{lead_id}/upload-proof")
async def upload_proof(
    lead_id: int,
    file: UploadFile = File(...),
    access: ChatAccess = Depends(require_chat_http_access),
) -> JSONResponse:
    settings = get_settings()

    allowed_prefix = "image/"
    if not file.content_type or not file.content_type.startswith(allowed_prefix):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    total_bytes = 0
    chunks: list[bytes] = []
    while chunk := await file.read(1024 * 1024):
        total_bytes += len(chunk)
        if total_bytes > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Upload exceeds {settings.max_upload_size_mb}MB limit",
            )
        chunks.append(chunk)

    if not chunks:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    data = b"".join(chunks)
    ext = _safe_extension(file.filename)

    storage_backend = settings.storage_backend.strip().lower()
    if storage_backend == "s3":
        file_url = await _upload_to_s3(lead_id, ext, data, file.content_type)
    else:
        os.makedirs(settings.upload_dir, exist_ok=True)
        filename = f"proof_{lead_id}_{uuid.uuid4().hex}{ext}"
        path = os.path.join(settings.upload_dir, filename)
        with open(path, "wb") as out:
            out.write(data)
        file_url = f"{settings.public_base_url.rstrip('/')}/uploads/{filename}"

    db = await get_db()
    uploaded_by = "admin" if access.role == "admin" else "user"
    sender_label = "Aditi Stays" if uploaded_by == "admin" else "Guest"
    if uploaded_by == "user":
        row = await db.fetchrow(
            """
            SELECT customer_name
            FROM leads
            WHERE id=$1
            """,
            lead_id,
        )
        customer_name = (row["customer_name"] if row and row["customer_name"] is not None else "").strip()
        if customer_name:
            sender_label = customer_name

    await db.execute(
        """
        INSERT INTO payment_proofs(lead_id, file_url, uploaded_by)
        VALUES($1, $2, $3)
        """,
        lead_id,
        file_url,
        uploaded_by,
    )

    message = {
        "event": "message",
        "lead_id": lead_id,
        "sender_role": uploaded_by,
        "sender_label": sender_label,
        "message_type": "PAYMENT_PROOF",
        "content": "Payment proof uploaded",
        "metadata": {"file_url": file_url},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await chat_manager.broadcast_event(lead_id, message, persist=True)

    return JSONResponse({"ok": True, "data": message}, status_code=201)


@router.post("/chat/{lead_id}/confirm")
async def confirm_booking(
    lead_id: int,
    payload: ConfirmInput,
    admin_actor: str = Depends(require_admin_http),
) -> JSONResponse:
    db = await get_db()
    await db.execute(
        """
        UPDATE leads
        SET status='CONFIRMED', admin_notes=$2, updated_at=NOW()
        WHERE id=$1
        """,
        lead_id,
        payload.details,
    )

    message = {
        "event": "message",
        "lead_id": lead_id,
        "sender_role": "admin",
        "sender_label": payload.sender_label,
        "message_type": "CONFIRMATION",
        "content": payload.details,
        "metadata": {"whatsapp_number": payload.whatsapp_number, "admin_actor": admin_actor},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await chat_manager.broadcast_event(lead_id, message, persist=True)

    whatsapp_sent = False
    if payload.whatsapp_number:
        whatsapp_sent = await send_whatsapp_confirmation(payload.whatsapp_number, payload.details)

    return JSONResponse({"ok": True, "whatsapp_sent": whatsapp_sent, "data": message}, status_code=200)


@router.post("/chat/{lead_id}/status")
async def admin_status_message(
    lead_id: int,
    payload: AdminStatusInput,
    admin_actor: str = Depends(require_admin_http),
) -> JSONResponse:
    message = {
        "event": "message",
        "lead_id": lead_id,
        "sender_role": "admin",
        "sender_label": payload.sender_label,
        "message_type": "STATUS",
        "content": payload.text,
        "metadata": {"admin_actor": admin_actor},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await chat_manager.broadcast_event(lead_id, message, persist=True)
    return JSONResponse({"ok": True, "data": message}, status_code=201)


@router.post("/chat/{lead_id}/auto-intro")
async def auto_intro_message(
    lead_id: int,
    name: str = Form(...),
    property_id: str = Form(...),
    from_date: str = Form(...),
    to_date: str = Form(...),
    members: int = Form(...),
    access: ChatAccess = Depends(require_chat_http_access),
) -> JSONResponse:
    if access.role != "user":
        raise HTTPException(status_code=403, detail="auto intro is only available for user chat sessions")

    clean_name = (name or "").strip()
    clean_property = (property_id or "").strip()
    clean_from = (from_date or "").strip()
    clean_to = (to_date or "").strip()
    if clean_name == "" or clean_property == "" or clean_from == "" or clean_to == "":
        raise HTTPException(status_code=400, detail="name, property_id, from_date and to_date are required")
    if members <= 0:
        raise HTTPException(status_code=400, detail="members should be greater than 0")

    text = (
        f"Hi, I am {clean_name}. I would like to know the availability of "
        f"{clean_property} from {clean_from} to {clean_to} for {members} member(s)."
    )
    message = {
        "event": "message",
        "lead_id": lead_id,
        "sender_role": "user",
        "sender_label": clean_name,
        "message_type": "TRIP_REQUIREMENT",
        "content": text,
        "metadata": {
            "property_id": clean_property,
            "from_date": clean_from,
            "to_date": clean_to,
            "members": members,
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await chat_manager.broadcast_event(lead_id, message, persist=True)
    asyncio.create_task(_send_delayed_auto_intro_reply(lead_id, clean_name))

    return JSONResponse({"ok": True, "data": message}, status_code=201)


@router.post("/admin/banners/upload")
async def upload_banner_video(
    file: UploadFile = File(...),
    quality: str = Form("1080p"),
    bitrate_kbps: int = Form(6000),
    admin_actor: str = Depends(require_admin_http),
) -> JSONResponse:
    settings = get_settings()
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Only video uploads are supported")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported video format")

    max_bytes = settings.banner_max_upload_size_mb * 1024 * 1024
    total_bytes = 0
    chunks: list[bytes] = []
    while chunk := await file.read(1024 * 1024):
        total_bytes += len(chunk)
        if total_bytes > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Upload exceeds {settings.banner_max_upload_size_mb}MB limit",
            )
        chunks.append(chunk)

    if not chunks:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    data = b"".join(chunks)
    filename = f"banner_{uuid.uuid4().hex}{ext}"
    storage_backend = settings.storage_backend.strip().lower()
    if storage_backend == "s3":
        prefix = settings.s3_prefix.strip("/").strip() or "payment-proofs"
        key = f"{prefix}/banners/{filename}"
        file_url = await _upload_blob_to_s3(key, data, file.content_type)
    else:
        banner_dir = os.path.join(settings.upload_dir, "banners")
        os.makedirs(banner_dir, exist_ok=True)
        path = os.path.join(banner_dir, filename)
        with open(path, "wb") as out:
            out.write(data)
        file_url = f"{settings.public_base_url.rstrip('/')}/uploads/banners/{filename}"

    payload = {
        "url": file_url,
        "quality": quality,
        "bitrate_kbps": bitrate_kbps,
        "mime_type": file.content_type,
        "file_name": file.filename or filename,
        "uploaded_by": admin_actor,
    }
    return JSONResponse({"ok": True, "data": payload}, status_code=201)


@router.post("/admin/properties/upload-image")
async def upload_property_image(
    file: UploadFile = File(...),
    admin_actor: str = Depends(require_admin_http),
) -> JSONResponse:
    settings = get_settings()
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")

    ext = _safe_extension(file.filename)
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    total_bytes = 0
    chunks: list[bytes] = []
    while chunk := await file.read(1024 * 1024):
        total_bytes += len(chunk)
        if total_bytes > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Upload exceeds {settings.max_upload_size_mb}MB limit",
            )
        chunks.append(chunk)

    if not chunks:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    data = b"".join(chunks)
    filename = f"property_{uuid.uuid4().hex}{ext}"
    storage_backend = settings.storage_backend.strip().lower()
    if storage_backend == "s3":
        prefix = settings.s3_prefix.strip("/").strip() or "payment-proofs"
        key = f"{prefix}/properties/{filename}"
        file_url = await _upload_blob_to_s3(key, data, file.content_type)
    else:
        prop_dir = os.path.join(settings.upload_dir, "properties")
        os.makedirs(prop_dir, exist_ok=True)
        path = os.path.join(prop_dir, filename)
        with open(path, "wb") as out:
            out.write(data)
        file_url = f"{settings.public_base_url.rstrip('/')}/uploads/properties/{filename}"

    payload = {
        "url": file_url,
        "mime_type": file.content_type,
        "file_name": file.filename or filename,
        "uploaded_by": admin_actor,
    }
    return JSONResponse({"ok": True, "data": payload}, status_code=201)
