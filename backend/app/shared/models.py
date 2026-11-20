"""Shared domain models (Firestore document shapes). Core-foundation owned.

Conventions: UTC timestamps, Decimal money (stored in Firestore as strings),
quantities are integers. ``Inventory.available_quantity`` is physical on-hand
stock and ``reserved_quantity`` is stock promised to open orders, so the
pickable stock is ``available_quantity - reserved_quantity``.
"""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.shared.enums import OrderStatus, OrderType, Role, StoreOperatingStatus
from app.shared.money import Money


def utc_now() -> datetime:
    """Current time as a timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


def ensure_utc(value: datetime) -> datetime:
    """Normalise a datetime to timezone-aware UTC (naive values are assumed UTC)."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class DomainModel(BaseModel):
    """Base for all stored models: UTC-normalises every datetime field."""

    model_config = ConfigDict(use_enum_values=False, extra="ignore")

    @field_validator("*", mode="after")
    @classmethod
    def _utc(cls, value: object) -> object:
        return ensure_utc(value) if isinstance(value, datetime) else value


class GeoLocation(BaseModel):
    """Latitude/longitude pair (stored as a plain map)."""

    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class User(DomainModel):
    """``users/{uid}``. ``role`` mirrors the token claim; the claim is authoritative."""

    uid: str
    name: str
    email: str | None = None
    phone: str | None = None
    role: Role = Role.CUSTOMER
    created_at: datetime
    updated_at: datetime


class Store(DomainModel):
    """``stores/{id}``."""

    id: str
    name: str
    address: str
    location: GeoLocation
    operating_status: StoreOperatingStatus = StoreOperatingStatus.CLOSED
    pickup_enabled: bool = False
    preparation_capacity: int = Field(default=10, ge=1, description="Max concurrent open orders")
    created_at: datetime
    updated_at: datetime


class Product(DomainModel):
    """``products/{id}`` (global catalogue; per-store stock lives in ``inventory``)."""

    id: str
    name: str
    description: str = ""
    category: str
    image_url: str | None = None
    price: Money
    unit: str
    is_active: bool = True


class Inventory(DomainModel):
    """``inventory/{store_id}__{product_id}``."""

    store_id: str
    product_id: str
    available_quantity: int = Field(ge=0)
    reserved_quantity: int = Field(default=0, ge=0)
    updated_at: datetime

    @property
    def pickable_quantity(self) -> int:
        """Stock that can still be reserved: on-hand minus already reserved."""
        return self.available_quantity - self.reserved_quantity


def inventory_doc_id(store_id: str, product_id: str) -> str:
    """Deterministic inventory document id (enables transactional reads without queries)."""
    return f"{store_id}__{product_id}"


class OrderItem(BaseModel):
    """Line item. Name/price are an intentional snapshot so history survives catalogue edits."""

    product_id: str
    name: str
    unit_price: Money
    quantity: int = Field(ge=1)
    line_total: Money


class StatusEvent(BaseModel):
    """One entry of the order's append-only status history."""

    status: OrderStatus
    at: datetime
    actor_uid: str | None = None
    note: str | None = None


class Order(DomainModel):
    """``orders/{id}``."""

    id: str
    customer_id: str
    store_id: str
    items: list[OrderItem]
    subtotal: Money
    delivery_fee: Money
    pickup_discount: Money
    pickup_fee: Money
    total_amount: Money
    order_type: OrderType = OrderType.PICKUP
    order_status: OrderStatus
    pickup_code_reference: str | None = None
    idempotency_key: str
    status_history: list[StatusEvent] = Field(default_factory=list)
    cancel_reason: str | None = None
    accepted_at: datetime | None = None
    preparing_at: datetime | None = None
    ready_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    expired_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PickupVerification(DomainModel):
    """``pickup_verifications/{order_id}``. Raw token/OTP are never stored, only keyed hashes."""

    order_id: str
    store_id: str
    customer_id: str
    token_hash: str
    otp_hash: str
    issued_at: datetime
    expires_at: datetime
    attempts: int = 0
    consumed_at: datetime | None = None
    consumed_by: str | None = None
    method: str | None = None
