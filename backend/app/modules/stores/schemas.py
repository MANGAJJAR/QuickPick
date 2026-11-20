"""Store schemas (customer discovery = Developer 1, store management = Developer 2)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.shared.enums import StoreOperatingStatus
from app.shared.models import GeoLocation, Store


class StoreWithDistance(BaseModel):
    """A store plus its distance from the customer (nearby search)."""

    store: Store
    distance_km: float


class StoreUpdate(BaseModel):
    """Manager-editable store profile fields."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    address: str | None = Field(default=None, min_length=1, max_length=300)
    location: GeoLocation | None = None


class StoreStatusUpdate(BaseModel):
    """Open/pause/close the store."""

    operating_status: StoreOperatingStatus


class PickupSettingsUpdate(BaseModel):
    """Pickup toggles."""

    pickup_enabled: bool | None = None
    preparation_capacity: int | None = Field(default=None, ge=1, le=500)
