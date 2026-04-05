from pydantic import BaseModel, model_validator
from functools import lru_cache
import os


class Settings(BaseModel):
    app_port: int = int(os.getenv("APP_PORT", "8000"))
    database_url: str = os.getenv("DATABASE_URL", "")
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    lead_notification_channel: str = os.getenv("LEAD_NOTIFICATION_CHANNEL", "lead_notifications")
    chat_events_channel: str = os.getenv("CHAT_EVENTS_CHANNEL", "chat_events")
    upload_dir: str = os.getenv("UPLOAD_DIR", "uploads")
    public_base_url: str = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000")
    cors_allowed_origins: str = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    max_upload_size_mb: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "8"))
    banner_max_upload_size_mb: int = int(os.getenv("BANNER_MAX_UPLOAD_SIZE_MB", "120"))

    storage_backend: str = os.getenv("STORAGE_BACKEND", "local").lower()
    s3_bucket: str = os.getenv("S3_BUCKET", "")
    s3_region: str = os.getenv("S3_REGION", "")
    s3_endpoint_url: str = os.getenv("S3_ENDPOINT_URL", "")
    s3_public_base_url: str = os.getenv("S3_PUBLIC_BASE_URL", "")
    s3_prefix: str = os.getenv("S3_PREFIX", "payment-proofs")

    db_connect_retries: int = int(os.getenv("DB_CONNECT_RETRIES", "30"))
    db_connect_retry_delay_seconds: float = float(os.getenv("DB_CONNECT_RETRY_DELAY_SECONDS", "1.5"))
    redis_connect_retries: int = int(os.getenv("REDIS_CONNECT_RETRIES", "30"))
    redis_connect_retry_delay_seconds: float = float(os.getenv("REDIS_CONNECT_RETRY_DELAY_SECONDS", "1.0"))

    admin_api_token: str = os.getenv("ADMIN_API_TOKEN", "")
    admin_chat_token: str = os.getenv("ADMIN_CHAT_TOKEN", "")
    admin_session_secret: str = os.getenv("ADMIN_SESSION_SECRET", "")
    admin_session_cookie_name: str = os.getenv("ADMIN_SESSION_COOKIE_NAME", "aditi_admin_session")
    user_chat_token_secret: str = os.getenv("USER_CHAT_TOKEN_SECRET", "")
    chat_rate_limit_per_minute: int = int(os.getenv("CHAT_RATE_LIMIT_PER_MINUTE", "180"))

    whatsapp_provider: str = os.getenv("WHATSAPP_PROVIDER", "stub").lower()
    twilio_account_sid: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    twilio_auth_token: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    twilio_whatsapp_from: str = os.getenv("TWILIO_WHATSAPP_FROM", "")
    meta_whatsapp_token: str = os.getenv("META_WHATSAPP_TOKEN", "")
    meta_phone_number_id: str = os.getenv("META_PHONE_NUMBER_ID", "")

    @model_validator(mode="after")
    def validate_required_secrets(self) -> "Settings":
        if self.database_url.strip() == "":
            raise ValueError("DATABASE_URL is required")
        _require_secret("ADMIN_API_TOKEN", self.admin_api_token)
        _require_secret("ADMIN_CHAT_TOKEN", self.admin_chat_token)
        _require_secret("ADMIN_SESSION_SECRET", self.admin_session_secret)
        _require_secret("USER_CHAT_TOKEN_SECRET", self.user_chat_token_secret)
        return self


def _require_secret(name: str, value: str) -> None:
    secret = value.strip()
    if secret == "":
        raise ValueError(f"{name} is required")
    lower = secret.lower()
    if "change-me" in lower:
        raise ValueError(f"{name} must not use a placeholder secret")
    if len(secret) < 24:
        raise ValueError(f"{name} must be at least 24 characters long")


@lru_cache
def get_settings() -> Settings:
    return Settings()
