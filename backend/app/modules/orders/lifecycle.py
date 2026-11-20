"""Order lifecycle service: THE shared state-machine executor (core-foundation owned).

Customer cancellation (Dev 1) and store actions accept/reject/prepare/ready (Dev 2)
both call ``OrderLifecycleService.transition``. It enforces, atomically in one
Firestore transaction: ownership scope, legal transition, and inventory release on
cancel/expire. COMPLETED is intentionally NOT reachable here: only verified pickup
(``pickup/service.py``) may complete an order.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.core.exceptions import InvalidTransitionError, NotFoundError
from app.core.firebase import run_in_transaction
from app.modules.inventory.ledger import InventoryLedger, StockLine
from app.shared.enums import OrderStatus as S
from app.shared.models import Order, StatusEvent, utc_now
from app.shared.order_lifecycle import (
    INVENTORY_RESERVED_STATES,
    STATUS_TIMESTAMP_FIELD,
    assert_transition,
)
from app.shared.repository import serialize

#: Targets reachable through ``transition`` (COMPLETED/PLACED/CREATED are not).
TRANSITIONABLE_TARGETS = frozenset({S.ACCEPTED, S.PREPARING, S.READY_FOR_PICKUP, S.CANCELLED, S.EXPIRED})


@dataclass(frozen=True)
class OrderScope:
    """Who is allowed to touch the order. The matching field must equal the order's owner."""

    customer_id: str | None = None
    store_id: str | None = None

    def allows(self, order: Order) -> bool:
        """True if the scope matches the order (a scope with neither field allows nothing)."""
        if self.customer_id is not None:
            return order.customer_id == self.customer_id
        if self.store_id is not None:
            return order.store_id == self.store_id
        return False


def transition_fields(
    order: Order, target: S, actor_uid: str | None, now: datetime, reason: str | None = None
) -> dict[str, Any]:
    """Python-typed field updates that move ``order`` to ``target`` (validates the transition)."""
    assert_transition(order.order_status, target)
    fields: dict[str, Any] = {
        "order_status": target,
        "status_history": [
            *order.status_history,
            StatusEvent(status=target, at=now, actor_uid=actor_uid, note=reason),
        ],
        "updated_at": now,
    }
    timestamp_field = STATUS_TIMESTAMP_FIELD.get(target)
    if timestamp_field:
        fields[timestamp_field] = now
    if reason and target in (S.CANCELLED, S.EXPIRED):
        fields["cancel_reason"] = reason
    return fields


def order_stock_lines(order: Order) -> list[StockLine]:
    """Stock lines (product, quantity) of an order."""
    return [StockLine(item.product_id, item.quantity) for item in order.items]


class OrderLifecycleService:
    """Atomic, authorised order status transitions."""

    def __init__(self, db: Any) -> None:
        self._db = db
        self._ledger = InventoryLedger(db)

    async def transition(
        self,
        order_id: str,
        target: S,
        *,
        actor_uid: str,
        scope: OrderScope,
        reason: str | None = None,
        only_from: frozenset[S] | None = None,
    ) -> Order:
        """Move an order to ``target`` if ``scope`` owns it and the lifecycle allows it.

        Orders outside the scope raise ``NotFoundError`` (never reveal that they exist).
        ``only_from`` narrows the legal source states for one operation (e.g. a store
        "reject" is only valid from PLACED) and is checked inside the transaction.
        Cancelling/expiring an order with reserved stock releases it in the same transaction.
        """
        if target not in TRANSITIONABLE_TARGETS:
            raise InvalidTransitionError(f"{target.value} cannot be set through this operation")
        order_ref = self._db.collection("orders").document(order_id)

        async def _run(tx: Any) -> Order:
            snap = await order_ref.get(transaction=tx)
            if not snap.exists:
                raise NotFoundError("Order not found")
            order = Order.model_validate(snap.to_dict())
            if not scope.allows(order):
                raise NotFoundError("Order not found")
            if only_from is not None and order.order_status not in only_from:
                raise InvalidTransitionError(
                    f"This action is not allowed while the order is {order.order_status.value}"
                )
            fields = transition_fields(order, target, actor_uid, utc_now(), reason)
            if target in (S.CANCELLED, S.EXPIRED) and order.order_status in INVENTORY_RESERVED_STATES:
                read_set = await self._ledger.read(tx, order.store_id, order_stock_lines(order))
                self._ledger.release(tx, read_set)
            tx.update(order_ref, serialize(fields))
            return order.model_copy(update=fields)

        return await run_in_transaction(self._db, _run)
