"""Repository for ``inventory/{store_id}__{product_id}`` (non-transactional reads)."""

from __future__ import annotations

import asyncio

from app.shared.models import Inventory, inventory_doc_id
from app.shared.pagination import PageParams, Pagination
from app.shared.repository import BaseRepository, FieldFilter


class InventoryRepository(BaseRepository[Inventory]):
    """Firestore reads for per-store stock. Stock *movements* go through ``InventoryLedger``."""

    collection_name = "inventory"
    model = Inventory

    async def get_stock(self, store_id: str, product_id: str) -> Inventory | None:
        """Fetch one store/product stock record."""
        return await self.get(inventory_doc_id(store_id, product_id))

    async def get_many(self, store_id: str, product_ids: list[str]) -> dict[str, Inventory]:
        """Fetch stock for several products of one store."""
        results = await asyncio.gather(*(self.get_stock(store_id, pid) for pid in product_ids))
        return {pid: inv for pid, inv in zip(product_ids, results) if inv is not None}

    async def list_for_store(
        self, store_id: str, page: PageParams
    ) -> tuple[list[Inventory], Pagination]:
        """Paginated stock list for a store, ordered by product id."""
        query = self.collection.where(filter=FieldFilter("store_id", "==", store_id))
        return await self.page(query, "product_id", page)

    async def list_all_for_store(self, store_id: str, limit: int = 500) -> list[Inventory]:
        """Up to ``limit`` stock records of a store (used for low-stock filtering)."""
        snaps = await (
            self.collection.where(filter=FieldFilter("store_id", "==", store_id)).limit(limit).get()
        )
        return [self.decode(s.to_dict()) for s in snaps]
