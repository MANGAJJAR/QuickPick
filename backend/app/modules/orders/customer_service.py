"""Customer checkout and order management. OWNER: Developer 1.

Order creation is ONE Firestore transaction that (a) returns the existing order when the
idempotency key was already used, (b) reserves inventory through ``InventoryLedger`` and
(c) creates the order. Prices are always recomputed server-side from the catalogue.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

from app.core.config import Settings
from app.core.exceptions import ConflictError, NotFoundError
from app.core.firebase import run_in_transaction
from app.core.security import AuthUser
from app.modules.discounts.engine import DiscountEngine
from app.modules.discounts.pricing import Pricing, build_delivery_pricing, build_pricing, compute_fees
from app.modules.inventory.ledger import InventoryLedger, StockLine, merge_lines
from app.modules.notifications.push import PushDispatcher
from app.modules.notifications.service import new_order_notification, short_id
from app.modules.orders.lifecycle import OrderLifecycleService, OrderScope
from app.modules.orders.repository import OrderRepository
from app.modules.orders.schemas import CartLine, CheckoutPreview
from app.modules.products.repository import ProductRepository
from app.modules.signals.offer import build_offer, is_walkable, walk_distance
from app.modules.signals.service import SignalService
from app.modules.stores.repository import StoreRepository
from app.shared.enums import ArrivalStatus, NotificationKind, OrderStatus, OrderType, StoreOperatingStatus
from app.shared.models import DeliveryAddress, GeoLocation, Notification, Order, OrderItem, StatusEvent, Store, utc_now
from app.shared.money import sum_money, to_money
from app.shared.pagination import PageParams, Pagination
from app.shared.repository import serialize


#: Arrival can be shared once the store is working on the order, until it is collected.
ARRIVAL_STATES = frozenset({OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP})


def order_id_for(customer_id: str, idempotency_key: str) -> str:
    """Deterministic order id: the same customer + key always maps to the same document."""
    return hashlib.sha256(f"{customer_id}:{idempotency_key}".encode()).hexdigest()[:32]


class CustomerOrderService:
    """Checkout preview, order placement, tracking and cancellation for customers."""

    def __init__(
        self, db: Any, engine: DiscountEngine, *, settings: Settings | None = None, push: PushDispatcher | None = None,
        signals: SignalService | None = None,
    ) -> None:
        self._db = db
        self._engine = engine
        self._settings = settings or Settings(environment="test", expiry_sweep_interval_seconds=0)
        self._signals = signals or SignalService(db, self._settings)
        self._push = push
        self._placed_expiry_minutes = settings.placed_expiry_minutes if settings else None
        self._orders = OrderRepository(db)
        self._stores = StoreRepository(db)
        self._products = ProductRepository(db)
        self._ledger = InventoryLedger(db)
        self._lifecycle = OrderLifecycleService(
            db, ready_expiry_minutes=settings.ready_expiry_minutes if settings else None, push=push
        )

    async def preview(self, store_id: str, lines: list[CartLine], location: GeoLocation | None = None) -> CheckoutPreview:
        """Price a cart both ways (pickup and delivery) without reserving anything."""
        store = await self._open_store(store_id)
        items, subtotal = await self._items(lines)
        pickup, delivery, signals, _distance = await self._price_both(store, subtotal, location)
        offer = build_offer(self._settings, store, location, signals, pickup.pickup_discount)
        return CheckoutPreview(
            store_id=store_id,
            items=items,
            pricing=pickup,
            message=f"You save ₹{pickup.you_save:.0f} vs delivery",
            delivery=delivery,
            delivery_eta_minutes=signals.delivery_eta_minutes,
            offer=offer,
        )

    async def create_order(
        self, customer: AuthUser, store_id: str, lines: list[CartLine], idempotency_key: str,
        fulfilment: OrderType = OrderType.PICKUP, delivery_address: DeliveryAddress | None = None,
        location: GeoLocation | None = None,
    ) -> tuple[Order, bool]:
        """Place an order. Returns ``(order, created)``; ``created`` is False on idempotent replay."""
        order_id = order_id_for(customer.uid, idempotency_key)
        existing = await self._orders.get(order_id)
        if existing is not None:
            return existing, False  # fast path; the transaction below re-checks atomically

        store = await self._open_store(store_id)
        if await self._orders.is_at_capacity(store_id, store.preparation_capacity):
            raise ConflictError("Store is at preparation capacity, try again shortly", code="store_at_capacity")
        if fulfilment == OrderType.DELIVERY:
            if not store.delivery_enabled:
                raise ConflictError("This store is not delivering right now", code="delivery_unavailable")
            if delivery_address is None:
                raise ConflictError("A delivery address is required", code="delivery_address_required")
        items, subtotal = await self._items(lines)
        pickup, delivery, signals, distance_m = await self._price_both(store, subtotal, location)
        pricing = delivery if fulfilment == OrderType.DELIVERY else pickup
        stock_lines = merge_lines(StockLine(i.product_id, i.quantity) for i in items)
        order_ref = self._orders.ref(order_id)

        async def _run(tx: Any) -> tuple[Order, bool, list[Any]]:
            snap = await order_ref.get(transaction=tx)
            if snap.exists:
                return Order.model_validate(snap.to_dict()), False, []
            read_set = await self._ledger.read(tx, store_id, stock_lines)
            self._ledger.reserve(tx, read_set)  # raises InsufficientStockError -> nothing written
            now = utc_now()
            order = Order(
                id=order_id,
                customer_id=customer.uid,
                store_id=store_id,
                items=items,
                subtotal=pricing.subtotal,
                delivery_fee=pricing.delivery_fee,
                handling_fee=pricing.handling_fee,
                night_fee=pricing.night_fee,
                pickup_discount=pricing.pickup_discount,
                pickup_fee=pricing.pickup_fee,
                total_amount=pricing.total_amount,
                order_type=fulfilment,
                delivery_address=delivery_address if fulfilment == OrderType.DELIVERY else None,
                delivery_eta_minutes=signals.delivery_eta_minutes if fulfilment == OrderType.DELIVERY else None,
                # Audit trail for the dynamic discount: recorded only when it actually applied.
                surge_multiplier=signals.multiplier if fulfilment == OrderType.PICKUP and pickup.rider_cost_saved != to_money(self._settings.rider_cost_saved) else None,
                walk_distance_m=distance_m if fulfilment == OrderType.PICKUP and pickup.rider_cost_saved != to_money(self._settings.rider_cost_saved) else None,
                order_status=OrderStatus.PLACED,
                idempotency_key=idempotency_key,
                status_history=[
                    StatusEvent(status=OrderStatus.CREATED, at=now, actor_uid=customer.uid),
                    StatusEvent(status=OrderStatus.PLACED, at=now, actor_uid=customer.uid),
                ],
                expires_at=now + timedelta(minutes=self._placed_expiry_minutes) if self._placed_expiry_minutes else None,
                created_at=now,
                updated_at=now,
            )
            tx.create(order_ref, serialize(order))
            note = new_order_notification(order, now)  # the store hears about it in the same commit
            tx.create(self._db.collection("notifications").document(note.id), serialize(note))
            return order, True, [note]

        order, created, notes = await run_in_transaction(self._db, _run)
        if self._push is not None and notes:
            await self._push.dispatch(notes)
        return order, created

    async def list_orders(self, customer: AuthUser, page: PageParams) -> tuple[list[Order], Pagination]:
        """The caller's orders, newest first."""
        return await self._orders.list_for_customer(customer.uid, page)

    async def get_order(self, customer: AuthUser, order_id: str) -> Order:
        """One of the caller's orders; other customers' orders look like 404."""
        order = await self._orders.get(order_id)
        if order is None or order.customer_id != customer.uid:
            raise NotFoundError("Order not found")
        return order

    async def cancel_order(self, customer: AuthUser, order_id: str, reason: str | None) -> Order:
        """Cancel before preparation starts; reserved stock is released atomically."""
        order = await self.get_order(customer, order_id)
        from app.shared.order_lifecycle import CUSTOMER_CANCELLABLE_STATES

        if order.order_status not in CUSTOMER_CANCELLABLE_STATES:
            raise ConflictError(
                f"Orders in {order.order_status.value} can no longer be cancelled by the customer",
                code="order_not_cancellable",
            )
        return await self._lifecycle.transition(
            order_id,
            OrderStatus.CANCELLED,
            actor_uid=customer.uid,
            scope=OrderScope(customer_id=customer.uid),
            reason=reason or "Cancelled by customer",
        )

    async def set_arrival(
        self, customer: AuthUser, order_id: str, status: ArrivalStatus | None, eta_minutes: int | None
    ) -> Order:
        """Record (or clear, with ``status=None``) the customer's "5 min away" / "I'm here" signal.

        Only meaningful while the store is working on the order (accepted, preparing or ready), and only for
        the order's owner. Tells the store through a notification whenever the signal actually changes.
        """
        order_ref = self._orders.ref(order_id)

        async def _run(tx: Any) -> tuple[Order, list[Notification]]:
            snap = await order_ref.get(transaction=tx)
            order = Order.model_validate(snap.to_dict()) if snap.exists else None
            if order is None or order.customer_id != customer.uid:
                raise NotFoundError("Order not found")
            if order.order_type != OrderType.PICKUP:
                raise ConflictError("Arrival can only be shared for pickup orders", code="arrival_not_allowed")
            if order.order_status not in ARRIVAL_STATES:
                raise ConflictError(
                    "You can share your arrival once the store has accepted your order and until you collect it",
                    code="arrival_not_allowed",
                )
            if order.arrival_status == status and order.arrival_eta_minutes == eta_minutes:
                return order, []  # nothing changed: no write, no duplicate notification
            now = utc_now()
            fields: dict[str, Any] = {
                "arrival_status": status,
                "arrival_eta_minutes": eta_minutes,
                "arrival_updated_at": now if status else None,
                "updated_at": now,
            }
            tx.update(order_ref, serialize(fields))
            notes: list[Notification] = []
            if status is not None:
                ref = short_id(order.id)
                phase = "ready for pickup" if order.order_status == OrderStatus.READY_FOR_PICKUP else order.order_status.value.lower()
                if status == ArrivalStatus.ARRIVED:
                    note = Notification(
                        id=uuid.uuid4().hex, store_id=order.store_id, kind=NotificationKind.CUSTOMER_ARRIVED,
                        order_id=order.id, created_at=now, title=f"Customer is here for order #{ref}",
                        body=f"The order is {phase}.",
                    )
                else:
                    note = Notification(
                        id=uuid.uuid4().hex, store_id=order.store_id, kind=NotificationKind.CUSTOMER_ARRIVING,
                        order_id=order.id, created_at=now, title=f"Customer is {eta_minutes} min away for order #{ref}",
                        body=f"The order is {phase}.",
                    )
                tx.create(self._db.collection("notifications").document(note.id), serialize(note))
                notes.append(note)
            return order.model_copy(update=fields), notes

        order, notes = await run_in_transaction(self._db, _run)
        if self._push is not None and notes:
            await self._push.dispatch(notes)
        return order

    # ------------------------------------------------------------------ helpers
    async def _open_store(self, store_id: str) -> Store:
        store = await self._stores.get(store_id)
        if store is None or not store.pickup_enabled:
            raise NotFoundError("Store not found")
        if store.operating_status != StoreOperatingStatus.OPEN:
            raise ConflictError("Store is not accepting orders right now", code="store_not_accepting_orders")
        return store

    async def _items(self, lines: list[CartLine]) -> tuple[list[OrderItem], Decimal]:
        """Server-side line items from the catalogue (client prices are never used) and their subtotal."""
        merged = merge_lines(StockLine(line.product_id, line.quantity) for line in lines)
        items: list[OrderItem] = []
        for line in merged:
            product = await self._products.get(line.product_id)
            if product is None or not product.is_active:
                raise NotFoundError(f"Product {line.product_id} is not available", code="product_unavailable")
            items.append(
                OrderItem(
                    product_id=product.id,
                    name=product.name,
                    unit_price=product.price,
                    quantity=line.quantity,
                    line_total=to_money(product.price * line.quantity),
                )
            )
        return items, sum_money([i.line_total for i in items])

    async def _price_both(
        self, store: Store, subtotal: Decimal, location: GeoLocation | None
    ) -> tuple[Pricing, Pricing, Any, int | None]:
        """Pickup pricing (with the walk-in discount when it applies) and delivery pricing for one cart.

        The same function prices the preview and the order, so the number shown is the number charged.
        """
        signals = await self._signals.snapshot(store)
        distance_m, _minutes = walk_distance(self._settings, store, location)
        quote = await self._engine.quote(
            store_id=store.id, subtotal=subtotal, surge_multiplier=signals.multiplier,
            walkable=is_walkable(self._settings, distance_m),
        )
        fees = compute_fees(self._settings, subtotal, utc_now())
        pickup = build_pricing(subtotal, quote, waived=fees)
        delivery = build_delivery_pricing(subtotal, fees, quote.rider_cost_saved)
        return pickup, delivery, signals, distance_m
