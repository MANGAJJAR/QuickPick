"""Order lifecycle service: THE shared state-machine executor (core-foundation owned).

Customer cancellation (Dev 1) and store actions accept/reject/prepare/ready (Dev 2)
both call ``OrderLifecycleService.transition``. It enforces, atomically in one
Firestore transaction: ownership scope, legal transition, and inventory release on
cancel/expire. COMPLETED is intentionally NOT reachable here: only verified pickup
(``pickup/service.py``) may complete an order.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from app.core.exceptions import InvalidTransitionError, NotFoundError
from app.core.firebase import run_in_transaction
from app.modules.inventory.ledger import InventoryLedger, StockLine
from app.modules.notifications.push import PushDispatcher
from app.modules.notifications.service import transition_notifications
from app.shared.enums import OrderStatus as S
from app.shared.enums import OrderType
from app.shared.models import Order, StatusEvent, utc_now
from app.shared.order_lifecycle import (
    INVENTORY_RESERVED_STATES,
    STATUS_TIMESTAMP_FIELD,
    TERMINAL_STATES,
    assert_transition,
)
from app.shared.repository import serialize

#: Targets reachable through ``transition`` (COMPLETED/PLACED/CREATED are not).
TRANSITIONABLE_TARGETS = frozenset({S.ACCEPTED, S.PREPARING, S.READY_FOR_PICKUP, S.OUT_FOR_DELIVERY, S.CANCELLED, S.EXPIRED})


@dataclass(frozen=True)
class OrderScope:
    """Who is allowed to touch the order. The matching field must equal the order's owner."""

    customer_id: str | None = None
    store_id: str | None = None
    #: Only the expiry job uses this: it may touch any order (the lifecycle rules still apply).
    system: bool = False

    def allows(self, order: Order) -> bool:
        """True if the scope matches the order (a scope with no owner field allows nothing)."""
        if self.system:
            return True
        if self.customer_id is not None:
            return order.customer_id == self.customer_id
        if self.store_id is not None:
            return order.store_id == self.store_id
        return False


def transition_fields(
    order: Order, target: S, actor_uid: str | None, now: datetime, reason: str | None = None,
    ready_expiry_minutes: int | None = None,
) -> dict[str, Any]:
    """Python-typed field updates that move ``order`` to ``target`` (validates the transition).

    Also maintains ``expires_at`` (a deadline only exists while PLACED or READY_FOR_PICKUP) and clears the
    customer's arrival signal once the order is finished.
    """
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
    if target == S.READY_FOR_PICKUP and ready_expiry_minutes and order.order_type == OrderType.PICKUP:
        fields["expires_at"] = now + timedelta(minutes=ready_expiry_minutes)
    else:
        fields["expires_at"] = None  # accepted/preparing: the "store must accept" deadline no longer applies
    if target in TERMINAL_STATES:
        fields.update(arrival_status=None, arrival_eta_minutes=None, arrival_updated_at=None)
    return fields


def order_stock_lines(order: Order) -> list[StockLine]:
    """Stock lines (product, quantity) of an order."""
    return [StockLine(item.product_id, item.quantity) for item in order.items]


class OrderLifecycleService:
    """Atomic, authorised order status transitions."""

    def __init__(self, db: Any, *, ready_expiry_minutes: int | None = None, push: PushDispatcher | None = None) -> None:
        self._db = db
        self._ledger = InventoryLedger(db)
        self._ready_expiry_minutes = ready_expiry_minutes
        self._push = push

    async def transition(
        self,
        order_id: str,
        target: S,
        *,
        actor_uid: str,
        scope: OrderScope,
        reason: str | None = None,
        only_from: frozenset[S] | None = None,
        only_type: OrderType | None = None,
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

        async def _run(tx: Any) -> tuple[Order, list]:
            snap = await order_ref.get(transaction=tx)
            if not snap.exists:
                raise NotFoundError("Order not found")
            order = Order.model_validate(snap.to_dict())
            if not scope.allows(order):
                raise NotFoundError("Order not found")
            if only_type is not None and order.order_type != only_type:
                raise InvalidTransitionError(f"This action is only for {only_type.value.lower()} orders")
            if only_from is not None and order.order_status not in only_from:
                raise InvalidTransitionError(
                    f"This action is not allowed while the order is {order.order_status.value}"
                )
            now = utc_now()
            fields = transition_fields(order, target, actor_uid, now, reason, self._ready_expiry_minutes)
            if target in (S.CANCELLED, S.EXPIRED) and order.order_status in INVENTORY_RESERVED_STATES:
                read_set = await self._ledger.read(tx, order.store_id, order_stock_lines(order))
                self._ledger.release(tx, read_set)
            tx.update(order_ref, serialize(fields))
            updated = order.model_copy(update=fields)
            # Notifications commit (or roll back) together with the status change.
            notes = transition_notifications(
                updated, target, now, actor_uid=actor_uid, reason=reason, ready_expiry_minutes=self._ready_expiry_minutes
            )
            for n in notes:
                tx.create(self._db.collection("notifications").document(n.id), serialize(n))
            return updated, notes

        updated, notes = await run_in_transaction(self._db, _run)
        if self._push is not None and notes:
            await self._push.dispatch(notes)  # after commit, best effort, never raises
        return updated

    async def complete_delivery(self, order_id: str, *, actor_uid: str, scope: OrderScope) -> Order:
        """OUT_FOR_DELIVERY -> DELIVERED for a DELIVERY order: the stock leaves the shelf (reserved -> deducted).

        The delivery twin of a verified pickup: one transaction changes the status, confirms the inventory and
        writes the customer's notification. Only the store that owns the order can do it.
        """
        order_ref = self._db.collection("orders").document(order_id)

        async def _run(tx: Any) -> tuple[Order, list]:
            snap = await order_ref.get(transaction=tx)
            if not snap.exists:
                raise NotFoundError("Order not found")
            order = Order.model_validate(snap.to_dict())
            if not scope.allows(order):
                raise NotFoundError("Order not found")
            if order.order_type != OrderType.DELIVERY:
                raise InvalidTransitionError("Only delivery orders can be marked delivered; pickup orders are completed at the counter")
            now = utc_now()
            fields = transition_fields(order, S.DELIVERED, actor_uid, now)
            read_set = await self._ledger.read(tx, order.store_id, order_stock_lines(order))
            self._ledger.confirm(tx, read_set)
            tx.update(order_ref, serialize(fields))
            updated = order.model_copy(update=fields)
            notes = transition_notifications(updated, S.DELIVERED, now, actor_uid=actor_uid, reason=None)
            for n in notes:
                tx.create(self._db.collection("notifications").document(n.id), serialize(n))
            return updated, notes

        updated, notes = await run_in_transaction(self._db, _run)
        if self._push is not None and notes:
            await self._push.dispatch(notes)
        return updated
