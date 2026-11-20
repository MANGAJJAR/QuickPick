"""The "riders are busy, walk and save" offer: surge pricing in reverse.

Normal pickup discount = round(rider_cost * 0.70) capped at ₹25. While riders are scarce the platform's real
delivery cost goes up (``rider_cost * multiplier``), so the SAME rule gives a bigger discount, capped higher (₹40),
but only for customers within walking distance of the store: they are the ones who can take the pressure off riders.
Everyone else keeps the normal discount. The saving never exceeds what delivery would have cost the platform.
"""

from __future__ import annotations

import math
from decimal import Decimal

from pydantic import BaseModel

from app.core.config import Settings
from app.modules.signals.service import Signals
from app.shared.geo import haversine_km
from app.shared.models import GeoLocation, Store
from app.shared.money import Money


class WalkOffer(BaseModel):
    """What the customer is told about walking to the store."""

    surge_active: bool
    eligible: bool  # surge is on AND the customer is within walking distance
    walk_minutes: int | None
    distance_m: int | None
    pickup_discount: Money  # what pickup would save right now for an order big enough to use it
    headline: str | None
    reasons: list[str]
    delivery_eta_minutes: int
    sources: dict[str, str]


def walk_distance(settings: Settings, store: Store, location: GeoLocation | None) -> tuple[int | None, int | None]:
    """``(distance in metres, walking minutes)`` from the customer to the store, or ``(None, None)`` without a location."""
    if location is None:
        return None, None
    km = haversine_km(location, store.location)
    return int(round(km * 1000)), max(1, math.ceil(km / settings.walking_speed_kmh * 60))


def is_walkable(settings: Settings, distance_m: int | None) -> bool:
    return distance_m is not None and distance_m <= settings.walk_radius_km * 1000


def build_offer(
    settings: Settings, store: Store, location: GeoLocation | None, signals: Signals, discount: Decimal
) -> WalkOffer:
    """Assemble the offer. ``discount`` is the pickup discount the engine quoted for this customer right now."""
    distance_m, minutes = walk_distance(settings, store, location)
    eligible = signals.surge_active and is_walkable(settings, distance_m)
    headline = f"Riders are busy. Walk {minutes} min and save ₹{discount:.0f}" if eligible and minutes is not None else None
    return WalkOffer(
        surge_active=signals.surge_active, eligible=eligible, walk_minutes=minutes, distance_m=distance_m,
        pickup_discount=discount, headline=headline, reasons=signals.reasons,
        delivery_eta_minutes=signals.delivery_eta_minutes, sources=signals.sources,
    )
