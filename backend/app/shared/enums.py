"""Shared enums. OWNED BY NEITHER DEVELOPER: change only via a core-foundation PR."""

from __future__ import annotations

from enum import Enum


class Role(str, Enum):
    """User roles (set as a Firebase custom claim, never by the client)."""

    CUSTOMER = "CUSTOMER"
    STORE_STAFF = "STORE_STAFF"
    STORE_MANAGER = "STORE_MANAGER"
    ADMIN = "ADMIN"


class OrderStatus(str, Enum):
    """Order lifecycle states (see ``shared/order_lifecycle.py`` for legal transitions)."""

    CREATED = "CREATED"
    PLACED = "PLACED"
    ACCEPTED = "ACCEPTED"
    PREPARING = "PREPARING"
    READY_FOR_PICKUP = "READY_FOR_PICKUP"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class OrderType(str, Enum):
    """Fulfilment type. Only PICKUP exists in this product."""

    PICKUP = "PICKUP"


class StoreOperatingStatus(str, Enum):
    """Whether a dark store currently accepts new orders."""

    OPEN = "OPEN"
    PAUSED = "PAUSED"
    CLOSED = "CLOSED"


class VerificationMethod(str, Enum):
    """How a pickup credential was presented."""

    QR = "QR"
    OTP = "OTP"
