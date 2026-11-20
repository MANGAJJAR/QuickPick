"""Discount engine interface + the configurable mock implementation.

Checkout depends ONLY on the ``DiscountEngine`` protocol, so a Gemini-powered
dynamic pricing model can replace ``ConfigDiscountEngine`` without touching
checkout code (implement ``quote`` and change the factory in ``discounts/deps.py``).

Formula (all Decimal, documented assumptions in docs/ORDER_LIFECYCLE.md):

    pickup_discount      = min(round_to_rupee(rider_cost_saved * ratio), MAX_DISCOUNT, subtotal)
    quickpick_fee        = configured fixed fee (default 4.00), billed to the platform, not the customer
    platform_net_saving  = rider_cost_saved - pickup_discount - quickpick_fee
"""

from __future__ import annotations

from decimal import Decimal
from typing import Protocol

from pydantic import BaseModel

from app.core.config import Settings
from app.shared.money import Money, round_to_rupee, to_money


class DiscountQuote(BaseModel):
    """Result of pricing a pickup order."""

    rider_cost_saved: Money
    pickup_discount: Money
    quickpick_fee: Money
    platform_net_saving: Decimal  # may be negative if the discount cap exceeds the saving


class DiscountEngine(Protocol):
    """Contract every pricing strategy (mock or AI) must satisfy."""

    async def quote(
        self, *, store_id: str, subtotal: Decimal, surge_multiplier: Decimal = Decimal("1"), walkable: bool = False
    ) -> DiscountQuote:
        """Return the pickup discount quote for an order of ``subtotal`` at ``store_id``.

        ``surge_multiplier`` (> 1 while riders are scarce) scales the platform's delivery cost, and
        ``walkable`` says the customer is close enough to collect on foot. Only walkable customers get the
        higher "riders are busy" discount.
        """
        ...


class ConfigDiscountEngine:
    """Deterministic engine driven by environment configuration."""

    def __init__(self, settings: Settings) -> None:
        self._rider_cost = to_money(settings.rider_cost_saved)
        self._ratio = settings.pickup_discount_ratio
        self._max_discount = to_money(settings.max_pickup_discount)
        self._max_surge_discount = to_money(settings.max_surge_pickup_discount)
        self._surge_threshold = settings.surge_threshold
        self._fee = to_money(settings.quickpick_fee)

    async def quote(
        self, *, store_id: str, subtotal: Decimal, surge_multiplier: Decimal = Decimal("1"), walkable: bool = False
    ) -> DiscountQuote:
        """Compute the quote; the discount can never exceed the order subtotal.

        While riders are scarce (multiplier at or above the threshold) a walkable customer is priced against the
        platform's higher delivery cost and gets the higher cap; everyone else keeps the normal rule.
        """
        surge = walkable and surge_multiplier >= self._surge_threshold
        rider_cost = to_money(self._rider_cost * surge_multiplier) if surge else self._rider_cost
        cap = self._max_surge_discount if surge else self._max_discount
        raw = round_to_rupee(rider_cost * self._ratio)
        discount = min(raw, cap, to_money(subtotal))
        return DiscountQuote(
            rider_cost_saved=rider_cost,
            pickup_discount=discount,
            quickpick_fee=self._fee,
            platform_net_saving=to_money(rider_cost - discount - self._fee),
        )
