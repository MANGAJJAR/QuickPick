"""Dark-store inventory management. OWNER: Developer 2.

Respects the reserved boundary: staff set physical stock (``available_quantity``) but can
never push it below ``reserved_quantity`` and can never delete a row that has reservations.
Reservations themselves are only changed through ``InventoryLedger``.
"""

from __future__ import annotations

from typing import Any

from app.core.exceptions import ConflictError, NotFoundError
from app.core.firebase import run_in_transaction
from app.modules.inventory.repository import InventoryRepository
from app.modules.inventory.schemas import InventoryOut
from app.modules.products.repository import ProductRepository
from app.shared.models import Inventory, inventory_doc_id, utc_now
from app.shared.pagination import PageParams, Pagination
from app.shared.repository import serialize


class StoreInventoryService:
    """CRUD over one store's stock, scoped by the caller's ``store_id``."""

    def __init__(self, db: Any, low_stock_threshold: int = 5) -> None:
        self._db = db
        self._inventory = InventoryRepository(db)
        self._products = ProductRepository(db)
        self._low_stock_threshold = low_stock_threshold

    async def list_stock(self, store_id: str, page: PageParams) -> tuple[list[InventoryOut], Pagination]:
        """Paginated stock list."""
        rows, pagination = await self._inventory.list_for_store(store_id, page)
        return [InventoryOut.from_model(r) for r in rows], pagination

    async def low_stock(self, store_id: str, threshold: int | None = None) -> list[InventoryOut]:
        """Rows whose pickable stock is at or below the threshold, lowest first."""
        limit = self._low_stock_threshold if threshold is None else threshold
        rows = await self._inventory.list_all_for_store(store_id)
        low = sorted((r for r in rows if r.pickable_quantity <= limit), key=lambda r: r.pickable_quantity)
        return [InventoryOut.from_model(r) for r in low]

    async def add_product(self, store_id: str, product_id: str, quantity: int) -> InventoryOut:
        """Start stocking a catalogue product; conflicts if the row already exists."""
        if await self._products.get(product_id) is None:
            raise NotFoundError("Product not found in catalogue")
        inv = Inventory(
            store_id=store_id,
            product_id=product_id,
            available_quantity=quantity,
            reserved_quantity=0,
            updated_at=utc_now(),
        )
        await self._inventory.create(inventory_doc_id(store_id, product_id), inv)
        return InventoryOut.from_model(inv)

    async def set_quantity(self, store_id: str, product_id: str, quantity: int) -> InventoryOut:
        """Set on-hand quantity atomically; rejects values below the reserved quantity."""
        ref = self._inventory.ref(inventory_doc_id(store_id, product_id))

        async def _run(tx: Any) -> Inventory:
            snap = await ref.get(transaction=tx)
            if not snap.exists:
                raise NotFoundError("Inventory record not found")
            inv = Inventory.model_validate(snap.to_dict())
            if quantity < inv.reserved_quantity:
                raise ConflictError(
                    f"Cannot set stock to {quantity}: {inv.reserved_quantity} units are reserved for open orders",
                    code="below_reserved_quantity",
                )
            now = utc_now()
            tx.update(ref, serialize({"available_quantity": quantity, "updated_at": now}))
            return inv.model_copy(update={"available_quantity": quantity, "updated_at": now})

        return InventoryOut.from_model(await run_in_transaction(self._db, _run))

    async def remove_product(self, store_id: str, product_id: str) -> None:
        """Delete a stock row, only if nothing is reserved against it."""
        ref = self._inventory.ref(inventory_doc_id(store_id, product_id))

        async def _run(tx: Any) -> None:
            snap = await ref.get(transaction=tx)
            if not snap.exists:
                raise NotFoundError("Inventory record not found")
            if Inventory.model_validate(snap.to_dict()).reserved_quantity > 0:
                raise ConflictError("Stock is reserved by open orders", code="stock_reserved")
            tx.delete(ref)

        await run_in_transaction(self._db, _run)
