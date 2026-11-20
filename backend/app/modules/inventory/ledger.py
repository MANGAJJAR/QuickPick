"""Inventory ledger: THE agreed contract between the customer and dark-store modules.

Customer order code never writes the ``inventory`` collection directly. It joins
its own transaction (which also writes the order) and calls this ledger:

    read_set = await ledger.read(tx, store_id, lines)   # all reads first
    ledger.reserve(tx, read_set)                         # then queued writes

Stock model (per store/product):
    available_quantity  = physical on-hand units
    reserved_quantity   = units promised to open orders
    pickable            = available_quantity - reserved_quantity   (never negative)

    reserve  (order placed)    : reserved += q          (requires pickable >= q)
    release  (cancel / expire) : reserved -= q
    confirm  (pickup complete) : reserved -= q, available -= q
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from app.core.exceptions import ConflictError, InsufficientStockError
from app.shared.models import Inventory, inventory_doc_id, utc_now
from app.shared.repository import serialize


@dataclass(frozen=True)
class StockLine:
    """A quantity of one product."""

    product_id: str
    quantity: int


def merge_lines(lines: Iterable[StockLine]) -> list[StockLine]:
    """Combine duplicate product lines so each product is reserved exactly once."""
    totals: dict[str, int] = {}
    for line in lines:
        totals[line.product_id] = totals.get(line.product_id, 0) + line.quantity
    return [StockLine(pid, qty) for pid, qty in totals.items()]


@dataclass
class InventoryReadSet:
    """Inventory documents read inside a transaction (refs + decoded state)."""

    store_id: str
    lines: list[StockLine]
    refs: dict[str, Any]
    stock: dict[str, Inventory | None]


class InventoryLedger:
    """Transaction-scoped reserve / release / confirm operations."""

    def __init__(self, db: Any) -> None:
        self._db = db

    def _ref(self, store_id: str, product_id: str) -> Any:
        return self._db.collection("inventory").document(inventory_doc_id(store_id, product_id))

    async def read(self, tx: Any, store_id: str, lines: Iterable[StockLine]) -> InventoryReadSet:
        """Read the inventory docs for ``lines`` inside ``tx`` (must precede any write)."""
        merged = merge_lines(lines)
        refs = {line.product_id: self._ref(store_id, line.product_id) for line in merged}
        stock: dict[str, Inventory | None] = {}
        for product_id, ref in refs.items():
            snap = await ref.get(transaction=tx)
            stock[product_id] = Inventory.model_validate(snap.to_dict()) if snap.exists else None
        return InventoryReadSet(store_id=store_id, lines=merged, refs=refs, stock=stock)

    def reserve(self, tx: Any, read_set: InventoryReadSet) -> None:
        """Reserve all lines or raise ``InsufficientStockError`` (nothing is written on failure)."""
        updates: list[tuple[Any, dict[str, Any]]] = []
        for line in read_set.lines:
            inv = read_set.stock[line.product_id]
            if inv is None or inv.pickable_quantity < line.quantity:
                have = inv.pickable_quantity if inv else 0
                raise InsufficientStockError(
                    f"Insufficient stock for product {line.product_id} "
                    f"(requested {line.quantity}, available {have})"
                )
            updates.append((read_set.refs[line.product_id], {"reserved_quantity": inv.reserved_quantity + line.quantity}))
        self._apply(tx, updates)

    def release(self, tx: Any, read_set: InventoryReadSet) -> None:
        """Release previously reserved stock (cancel/expire)."""
        updates = []
        for line in read_set.lines:
            inv = self._require_present(read_set, line)
            if inv.reserved_quantity < line.quantity:
                raise ConflictError(
                    f"Inventory inconsistency for {line.product_id}: cannot release below zero",
                    code="inventory_inconsistent",
                )
            updates.append((read_set.refs[line.product_id], {"reserved_quantity": inv.reserved_quantity - line.quantity}))
        self._apply(tx, updates)

    def confirm(self, tx: Any, read_set: InventoryReadSet) -> None:
        """Convert reserved stock into a permanent deduction (pickup completed)."""
        updates = []
        for line in read_set.lines:
            inv = self._require_present(read_set, line)
            if inv.reserved_quantity < line.quantity or inv.available_quantity < line.quantity:
                raise ConflictError(
                    f"Inventory inconsistency for {line.product_id}: cannot confirm below zero",
                    code="inventory_inconsistent",
                )
            updates.append(
                (
                    read_set.refs[line.product_id],
                    {
                        "reserved_quantity": inv.reserved_quantity - line.quantity,
                        "available_quantity": inv.available_quantity - line.quantity,
                    },
                )
            )
        self._apply(tx, updates)

    @staticmethod
    def _require_present(read_set: InventoryReadSet, line: StockLine) -> Inventory:
        inv = read_set.stock[line.product_id]
        if inv is None:
            raise ConflictError(
                f"Inventory record missing for {line.product_id}", code="inventory_inconsistent"
            )
        return inv

    @staticmethod
    def _apply(tx: Any, updates: list[tuple[Any, dict[str, Any]]]) -> None:
        now = utc_now()
        for ref, fields in updates:
            tx.update(ref, serialize({**fields, "updated_at": now}))
