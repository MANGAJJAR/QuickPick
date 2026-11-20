"""Notifications: what is said, who hears it, and the read/list operations.

Notifications are written INSIDE the same Firestore transaction as the order change that caused
them (see ``orders/lifecycle.py``), so a customer can never see "order ready" for an order that
did not actually become ready. Push delivery (FCM) happens after commit, best effort.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from app.core.exceptions import NotFoundError
from app.shared.enums import NotificationKind, OrderStatus, OrderType
from app.shared.models import Notification, Order
from app.shared.pagination import PageParams, Pagination
from app.shared.repository import BaseRepository, FieldFilter


def short_id(order_id: str) -> str:
    """Human-friendly order reference shown in titles (matches the apps' ``#ABCD1234``)."""
    return order_id[:8].upper()


def _new(**kw: Any) -> Notification:
    return Notification(id=uuid.uuid4().hex, read=False, **kw)


def new_order_notification(order: Order, now: datetime) -> Notification:
    """Store hears about a freshly placed order."""
    count = sum(i.quantity for i in order.items)
    kind = "delivery" if order.order_type == OrderType.DELIVERY else "pickup"
    return _new(
        store_id=order.store_id, kind=NotificationKind.ORDER_PLACED, order_id=order.id, created_at=now,
        title=f"New {kind} order #{short_id(order.id)}",
        body=f"{count} item{'s' if count != 1 else ''}. Accept it to start preparing.",
    )


def transition_notifications(
    order: Order, target: OrderStatus, now: datetime, *, actor_uid: str | None, reason: str | None,
    ready_expiry_minutes: int | None = None,
) -> list[Notification]:
    """Notifications caused by moving ``order`` (already updated) to ``target``."""
    ref = short_id(order.id)
    out: list[Notification] = []
    if target == OrderStatus.ACCEPTED:
        out.append(_new(
            user_id=order.customer_id, kind=NotificationKind.ORDER_ACCEPTED, order_id=order.id, created_at=now,
            title="Order accepted", body=f"The store is getting order #{ref} ready.",
        ))
    elif target == OrderStatus.READY_FOR_PICKUP and order.order_type == OrderType.DELIVERY:
        out.append(_new(
            user_id=order.customer_id, kind=NotificationKind.ORDER_READY, order_id=order.id, created_at=now,
            title="Your order is packed", body=f"Order #{ref} is waiting for a rider and will be on its way shortly.",
        ))
    elif target == OrderStatus.OUT_FOR_DELIVERY:
        out.append(_new(
            user_id=order.customer_id, kind=NotificationKind.ORDER_OUT_FOR_DELIVERY, order_id=order.id, created_at=now,
            title="Your order is on the way", body=f"A rider has order #{ref}.",
        ))
    elif target == OrderStatus.DELIVERED:
        out.append(_new(
            user_id=order.customer_id, kind=NotificationKind.ORDER_DELIVERED, order_id=order.id, created_at=now,
            title="Delivered", body=f"Order #{ref} has arrived. Enjoy.",
        ))
    elif target == OrderStatus.READY_FOR_PICKUP:
        hold = f" It is held for {ready_expiry_minutes} minutes." if ready_expiry_minutes else ""
        out.append(_new(
            user_id=order.customer_id, kind=NotificationKind.ORDER_READY, order_id=order.id, created_at=now,
            title="Your order is ready for pickup",
            body=f"Show your QR code or OTP for order #{ref} at the counter.{hold}",
        ))
    elif target == OrderStatus.CANCELLED:
        by_customer = actor_uid is not None and actor_uid == order.customer_id
        if by_customer:
            out.append(_new(
                store_id=order.store_id, kind=NotificationKind.ORDER_CANCELLED, order_id=order.id, created_at=now,
                title=f"Order #{ref} cancelled by the customer", body="Its items were released back to stock.",
            ))
        else:
            out.append(_new(
                user_id=order.customer_id, kind=NotificationKind.ORDER_CANCELLED, order_id=order.id, created_at=now,
                title="Your order was cancelled", body=reason or "The store could not fulfil this order.",
            ))
    elif target == OrderStatus.EXPIRED:
        placed = order.accepted_at is None and order.ready_at is None
        out.append(_new(
            user_id=order.customer_id, kind=NotificationKind.ORDER_EXPIRED, order_id=order.id, created_at=now,
            title="Your order expired",
            body=(f"The store did not accept order #{ref} in time, so it was released. You were not charged."
                  if placed else
                  f"Order #{ref} was not collected in time, so it was released. Place a new order any time."),
        ))
        out.append(_new(
            store_id=order.store_id, kind=NotificationKind.ORDER_EXPIRED, order_id=order.id, created_at=now,
            title=f"Order #{ref} expired",
            body="Not accepted in time." if placed else "Not collected in time. Its stock is back on the shelf.",
        ))
    return out


class NotificationRepository(BaseRepository[Notification]):
    """``notifications/{id}``."""

    collection_name = "notifications"
    model = Notification

    async def for_user(self, user_id: str, page: PageParams) -> tuple[list[Notification], Pagination]:
        query = self.collection.where(filter=FieldFilter("user_id", "==", user_id))
        return await self.page(query, "created_at", page, descending=True)

    async def for_store(self, store_id: str, page: PageParams) -> tuple[list[Notification], Pagination]:
        query = self.collection.where(filter=FieldFilter("store_id", "==", store_id))
        return await self.page(query, "created_at", page, descending=True)


class NotificationService:
    """List and mark-read, always scoped to the caller (a customer id or a store id)."""

    def __init__(self, db: Any) -> None:
        self._repo = NotificationRepository(db)

    async def list_for_customer(self, customer_id: str, page: PageParams) -> tuple[list[Notification], Pagination]:
        return await self._repo.for_user(customer_id, page)

    async def list_for_store(self, store_id: str, page: PageParams) -> tuple[list[Notification], Pagination]:
        return await self._repo.for_store(store_id, page)

    async def mark_read(self, notification_id: str, *, user_id: str | None = None, store_id: str | None = None) -> Notification:
        """Mark one notification read. Someone else's notification looks like a 404."""
        found = await self._repo.get(notification_id)
        owned = found is not None and (
            (user_id is not None and found.user_id == user_id) or (store_id is not None and found.store_id == store_id)
        )
        if not owned or found is None:
            raise NotFoundError("Notification not found")
        if not found.read:
            await self._repo.update(notification_id, {"read": True})
        return found.model_copy(update={"read": True})
