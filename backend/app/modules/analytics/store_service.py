"""Store analytics overview. OWNER: Developer 2.

Computed on demand from completed orders (``store_analytics`` pre-aggregation is documented
but not populated yet). Rider-cost figures are ILLUSTRATIVE estimates, labelled as such.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from pydantic import BaseModel

from app.modules.orders.repository import OrderRepository
from app.shared.models import Order
from app.shared.money import Money, sum_money, to_money


class AnalyticsOverview(BaseModel):
    """Headline numbers for a store."""

    total_pickups: int
    avg_preparation_seconds: float | None
    total_revenue: Money
    estimated_rider_cost_saved: Money
    estimate_note: str = (
        "Illustrative estimate: completed pickups x configured rider cost per delivery. "
        "Not measured data."
    )


def compute_overview(orders: list[Order], rider_cost_saved: Decimal) -> AnalyticsOverview:
    """Pure calculation over completed orders (easy to unit test)."""
    durations = [
        (o.ready_at - o.preparing_at).total_seconds()
        for o in orders
        if o.ready_at is not None and o.preparing_at is not None
    ]
    avg = round(sum(durations) / len(durations), 1) if durations else None
    return AnalyticsOverview(
        total_pickups=len(orders),
        avg_preparation_seconds=avg,
        total_revenue=sum_money([o.total_amount for o in orders]),
        estimated_rider_cost_saved=to_money(rider_cost_saved * len(orders)),
    )


class StoreAnalyticsService:
    """Builds analytics for one store."""

    def __init__(self, db: Any, rider_cost_saved: Decimal) -> None:
        self._orders = OrderRepository(db)
        self._rider_cost_saved = rider_cost_saved

    async def overview(self, store_id: str) -> AnalyticsOverview:
        """Analytics overview for ``store_id``."""
        return compute_overview(await self._orders.completed_for_store(store_id), self._rider_cost_saved)
