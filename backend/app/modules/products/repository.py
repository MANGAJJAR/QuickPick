"""Repository for ``products/{id}`` (read-mostly global catalogue)."""

from __future__ import annotations

from app.shared.models import Product
from app.shared.pagination import PageParams, Pagination
from app.shared.repository import BaseRepository, FieldFilter


class ProductRepository(BaseRepository[Product]):
    """Firestore access for the product catalogue."""

    collection_name = "products"
    model = Product

    async def list_active(
        self, page: PageParams, category: str | None = None
    ) -> tuple[list[Product], Pagination]:
        """Active products, optionally filtered by category, ordered by name."""
        query = self.collection.where(filter=FieldFilter("is_active", "==", True))
        if category:
            query = query.where(filter=FieldFilter("category", "==", category))
        return await self.page(query, "name", page)
