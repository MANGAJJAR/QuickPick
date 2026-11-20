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

    async def quote(self, *, store_id: str, subtotal: Decimal) -> DiscountQuote:
        """Return the pickup discount quote for an order of ``subtotal`` at ``store_id``."""
        ...


class ConfigDiscountEngine:
    """Deterministic engine driven by environment configuration."""

    def __init__(self, settings: Settings) -> None:
        self._rider_cost = to_money(settings.rider_cost_saved)
        self._ratio = settings.pickup_discount_ratio
        self._max_discount = to_money(settings.max_pickup_discount)
        self._fee = to_money(settings.quickpick_fee)

    async def quote(self, *, store_id: str, subtotal: Decimal) -> DiscountQuote:
        """Compute the quote; the discount can never exceed the order subtotal."""
        raw = round_to_rupee(self._rider_cost * self._ratio)
        discount = min(raw, self._max_discount, to_money(subtotal))
        return DiscountQuote(
            rider_cost_saved=self._rider_cost,
            pickup_discount=discount,
            quickpick_fee=self._fee,
            platform_net_saving=to_money(self._rider_cost - discount - self._fee),
        )
