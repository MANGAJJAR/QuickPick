"""Repository for ``stores/{id}``."""

from __future__ import annotations

from app.shared.models import Store
from app.shared.pagination import PageParams, Pagination
from app.shared.repository import BaseRepository, FieldFilter


class StoreRepository(BaseRepository[Store]):
    """Firestore access for dark stores."""

    collection_name = "stores"
    model = Store

    async def list_pickup_enabled(self, page: PageParams) -> tuple[list[Store], Pagination]:
        """Stores currently offering pickup, paginated by name."""
        query = self.collection.where(filter=FieldFilter("pickup_enabled", "==", True))
        return await self.page(query, "name", page)

    async def all_pickup_enabled(self, limit: int = 200) -> list[Store]:
        """Up to ``limit`` pickup-enabled stores (used for in-memory nearby search)."""
        snaps = await (
            self.collection.where(filter=FieldFilter("pickup_enabled", "==", True))
            .limit(limit)
            .get()
        )
        return [self.decode(s.to_dict()) for s in snaps]
