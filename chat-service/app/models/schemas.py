from pydantic import BaseModel, Field
from typing import Literal, Optional, Any


class ChatInput(BaseModel):
    type: Literal["message", "status"] = "message"
    sender_role: Literal["user", "admin", "system"]
    sender_label: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=3000)
    metadata: dict[str, Any] = {}


class ShareGPayInput(BaseModel):
    sender_label: str = Field(default="Admin")
    qr_url: str
    mobile_number: str


class ConfirmInput(BaseModel):
    sender_label: str = Field(default="Admin")
    details: str = Field(default="Confirmed")
    whatsapp_number: Optional[str] = None


class AdminStatusInput(BaseModel):
    sender_label: str = Field(default="Admin")
    text: str = Field(min_length=1, max_length=1200)


class HealthResponse(BaseModel):
    ok: bool
