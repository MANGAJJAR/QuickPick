"""Customer product browsing with optional per-store availability. OWNER: Developer 1."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.core.exceptions import NotFoundError
from app.modules.inventory.repository import InventoryRepository
from app.modules.products.repository import ProductRepository
from app.shared.models import Product
from app.shared.pagination import PageParams, Pagination


class ProductView(BaseModel):
    """A product, with ``pickable_quantity`` filled in when a store was specified."""

    product: Product
    store_id: str | None = None
    pickable_quantity: int | None = None
    in_stock: bool | None = None


class ProductBrowseService:
    """Catalogue reads joined (in code, Firestore has no joins) with store stock."""

    def __init__(self, db: Any) -> None:
        self._products = ProductRepository(db)
        self._inventory = InventoryRepository(db)

    async def list_products(
        self, page: PageParams, category: str | None, store_id: str | None
    ) -> tuple[list[ProductView], Pagination]:
        """Active products; with ``store_id`` each carries that store's pickable stock."""
        products, pagination = await self._products.list_active(page, category)
        stock = await self._inventory.get_many(store_id, [p.id for p in products]) if store_id else {}
        return [self._view(p, store_id, stock) for p in products], pagination

    async def get_product(self, product_id: str, store_id: str | None) -> ProductView:
        """One active product (optionally with store availability)."""
        product = await self._products.get(product_id)
        if product is None or not product.is_active:
            raise NotFoundError("Product not found")
        stock = await self._inventory.get_many(store_id, [product_id]) if store_id else {}
        return self._view(product, store_id, stock)

    @staticmethod
    def _view(product: Product, store_id: str | None, stock: dict) -> ProductView:
        if store_id is None:
            return ProductView(product=product)
        inv = stock.get(product.id)
        pickable = inv.pickable_quantity if inv else 0
        return ProductView(product=product, store_id=store_id, pickable_quantity=pickable, in_stock=pickable > 0)
