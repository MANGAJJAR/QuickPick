"""Repository for ``orders/{id}``."""

from __future__ import annotations

from app.shared.enums import OrderStatus
from app.shared.models import Order
from app.shared.order_lifecycle import ACTIVE_STATES
from app.shared.pagination import PageParams, Pagination
from app.shared.repository import BaseRepository, FieldFilter

_ACTIVE_VALUES = [s.value for s in ACTIVE_STATES]


class OrderRepository(BaseRepository[Order]):
    """Firestore access for orders. State changes go through ``OrderLifecycleService``."""

    collection_name = "orders"
    model = Order

    async def list_for_customer(
        self, customer_id: str, page: PageParams
    ) -> tuple[list[Order], Pagination]:
        """A customer's orders, newest first."""
        query = self.collection.where(filter=FieldFilter("customer_id", "==", customer_id))
        return await self.page(query, "created_at", page, descending=True)

    async def list_for_store(
        self, store_id: str, page: PageParams, status: OrderStatus | None = None
    ) -> tuple[list[Order], Pagination]:
        """A store's orders, newest first, optionally filtered by status."""
        query = self.collection.where(filter=FieldFilter("store_id", "==", store_id))
        if status:
            query = query.where(filter=FieldFilter("order_status", "==", status.value))
        return await self.page(query, "created_at", page, descending=True)

    async def active_queue(self, store_id: str, limit: int = 100) -> list[Order]:
        """Open orders of a store (PLACED..READY_FOR_PICKUP), oldest first."""
        snaps = await (
            self.collection.where(filter=FieldFilter("store_id", "==", store_id))
            .where(filter=FieldFilter("order_status", "in", _ACTIVE_VALUES))
            .order_by("created_at")
            .limit(limit)
            .get()
        )
        return [self.decode(s.to_dict()) for s in snaps]

    async def is_at_capacity(self, store_id: str, capacity: int) -> bool:
        """Soft capacity check (not transactional): True if open orders >= ``capacity``."""
        snaps = await (
            self.collection.where(filter=FieldFilter("store_id", "==", store_id))
            .where(filter=FieldFilter("order_status", "in", _ACTIVE_VALUES))
            .limit(capacity)
            .get()
        )
        return len(snaps) >= capacity

    async def completed_for_store(self, store_id: str, limit: int = 1000) -> list[Order]:
        """Up to ``limit`` completed orders of a store (analytics input)."""
        snaps = await (
            self.collection.where(filter=FieldFilter("store_id", "==", store_id))
            .where(filter=FieldFilter("order_status", "==", OrderStatus.COMPLETED.value))
            .limit(limit)
            .get()
        )
        return [self.decode(s.to_dict()) for s in snaps]
