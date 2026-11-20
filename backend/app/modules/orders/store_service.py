"""Dark-store order handling. OWNER: Developer 2.

All operations are scoped to the caller's ``store_id`` (from the verified token), so an order
of another store behaves exactly like a missing order.
"""

from __future__ import annotations

from typing import Any

from app.core.exceptions import NotFoundError
from app.modules.orders.lifecycle import OrderLifecycleService, OrderScope
from app.modules.orders.repository import OrderRepository
from app.shared.enums import OrderStatus
from app.shared.models import Order
from app.shared.pagination import PageParams, Pagination


class StoreOrderService:
    """List/inspect orders and drive them through accept -> prepare -> ready."""

    def __init__(self, db: Any) -> None:
        self._orders = OrderRepository(db)
        self._lifecycle = OrderLifecycleService(db)

    async def list_orders(
        self, store_id: str, page: PageParams, status: OrderStatus | None
    ) -> tuple[list[Order], Pagination]:
        """The store's orders, newest first."""
        return await self._orders.list_for_store(store_id, page, status)

    async def get_order(self, store_id: str, order_id: str) -> Order:
        """One order of this store, else 404."""
        order = await self._orders.get(order_id)
        if order is None or order.store_id != store_id:
            raise NotFoundError("Order not found")
        return order

    async def accept(self, store_id: str, actor_uid: str, order_id: str) -> Order:
        """PLACED -> ACCEPTED."""
        return await self._move(store_id, actor_uid, order_id, OrderStatus.ACCEPTED)

    async def reject(self, store_id: str, actor_uid: str, order_id: str, reason: str | None) -> Order:
        """PLACED -> CANCELLED (stock released)."""
        return await self._move(
            store_id, actor_uid, order_id, OrderStatus.CANCELLED, reason or "Rejected by store",
            only_from=frozenset({OrderStatus.PLACED}),
        )

    async def start_preparation(self, store_id: str, actor_uid: str, order_id: str) -> Order:
        """ACCEPTED -> PREPARING."""
        return await self._move(store_id, actor_uid, order_id, OrderStatus.PREPARING)

    async def mark_ready(self, store_id: str, actor_uid: str, order_id: str) -> Order:
        """PREPARING -> READY_FOR_PICKUP."""
        return await self._move(store_id, actor_uid, order_id, OrderStatus.READY_FOR_PICKUP)

    async def _move(
        self,
        store_id: str,
        actor_uid: str,
        order_id: str,
        target: OrderStatus,
        reason: str | None = None,
        only_from: frozenset[OrderStatus] | None = None,
    ) -> Order:
        return await self._lifecycle.transition(
            order_id, target, actor_uid=actor_uid, scope=OrderScope(store_id=store_id),
            reason=reason, only_from=only_from,
        )
