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
    READY_FOR_PICKUP = "READY_FOR_PICKUP"  # for DELIVERY orders this means "packed, waiting for a rider"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY"  # DELIVERY orders only
    DELIVERED = "DELIVERED"  # DELIVERY orders only (the equivalent of COMPLETED)
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class OrderType(str, Enum):
    """How the customer gets the order: collect it (PICKUP) or have it brought (DELIVERY)."""

    PICKUP = "PICKUP"
    DELIVERY = "DELIVERY"


class StoreOperatingStatus(str, Enum):
    """Whether a dark store currently accepts new orders."""

    OPEN = "OPEN"
    PAUSED = "PAUSED"
    CLOSED = "CLOSED"


class VerificationMethod(str, Enum):
    """How a pickup credential was presented."""

    QR = "QR"
    OTP = "OTP"


class ArrivalStatus(str, Enum):
    """Customer's self-reported progress towards the store (no location is ever shared)."""

    ON_THE_WAY = "ON_THE_WAY"
    ARRIVED = "ARRIVED"


class NotificationKind(str, Enum):
    """What a notification is about (lets clients pick an icon/route)."""

    ORDER_PLACED = "ORDER_PLACED"
    ORDER_ACCEPTED = "ORDER_ACCEPTED"
    ORDER_READY = "ORDER_READY"
    ORDER_CANCELLED = "ORDER_CANCELLED"
    ORDER_EXPIRED = "ORDER_EXPIRED"
    ORDER_OUT_FOR_DELIVERY = "ORDER_OUT_FOR_DELIVERY"
    ORDER_DELIVERED = "ORDER_DELIVERED"
    CUSTOMER_ARRIVING = "CUSTOMER_ARRIVING"
    CUSTOMER_ARRIVED = "CUSTOMER_ARRIVED"


class RiderSupply(str, Enum):
    """How many delivery riders are available around a store (a feed from the platform; simulated here)."""

    NORMAL = "NORMAL"
    LOW = "LOW"
    VERY_LOW = "VERY_LOW"


class Weather(str, Enum):
    """Weather as it affects riders."""

    CLEAR = "CLEAR"
    RAIN = "RAIN"
    STORM = "STORM"
