"""Live pickup queue for store staff. OWNER: Developer 2."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

from app.modules.orders.repository import OrderRepository
from app.modules.pickup.schemas import QueueEntry
from app.shared.enums import OrderStatus, OrderType
from app.shared.models import Order, utc_now


def build_queue_entry(order: Order, now: datetime) -> QueueEntry:
    """Timers: preparation runs from acceptance until ready; ready orders accrue waiting time."""
    prep_elapsed: int | None = None
    start = order.preparing_at or order.accepted_at
    if start is not None:
        end = order.ready_at or now
        prep_elapsed = max(0, int((end - start).total_seconds()))
    waiting: int | None = None
    if order.order_status == OrderStatus.READY_FOR_PICKUP and order.ready_at is not None:
        waiting = max(0, int((now - order.ready_at).total_seconds()))
    return QueueEntry(
        order_id=order.id,
        order_status=order.order_status.value,
        item_count=sum(i.quantity for i in order.items),
        total_amount=str(order.total_amount),
        placed_at=order.created_at,
        preparation_elapsed_seconds=prep_elapsed,
        ready_waiting_seconds=waiting,
        arrival_status=order.arrival_status.value if order.arrival_status else None,
        arrival_eta_minutes=order.arrival_eta_minutes,
        arrival_updated_at=order.arrival_updated_at,
        expires_at=order.expires_at,
    )


class PickupQueueService:
    """Reads the open orders of one store as a queue."""

    def __init__(self, db: Any, clock: Callable[[], datetime] = utc_now) -> None:
        self._orders = OrderRepository(db)
        self._clock = clock

    async def queue(self, store_id: str) -> list[QueueEntry]:
        """Open orders of ``store_id``, oldest first, with timers."""
        now = self._clock()
        # The counter queue is for people collecting in person; delivery orders are handled by dispatch.
        return [build_queue_entry(o, now) for o in await self._orders.active_queue(store_id) if o.order_type == OrderType.PICKUP]
