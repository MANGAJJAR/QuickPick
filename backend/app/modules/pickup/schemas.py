"""Pickup schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PickupCredentialOut(BaseModel):
    """Credential shown to the customer. Raw values exist only in this response."""

    order_id: str
    qr_payload: str
    otp: str
    expires_at: datetime


class VerifyQrRequest(BaseModel):
    """Scanned QR payload."""

    qr_payload: str = Field(min_length=10, max_length=512)


class VerifyOtpRequest(BaseModel):
    """Order id selected from the queue plus the OTP the customer reads out."""

    order_id: str = Field(min_length=1, max_length=64)
    otp: str = Field(pattern=r"^[0-9]{4,10}$")


class QueueEntry(BaseModel):
    """One row of the live pickup queue."""

    order_id: str
    order_status: str
    item_count: int
    total_amount: str
    placed_at: datetime
    preparation_elapsed_seconds: int | None = None
    ready_waiting_seconds: int | None = None
