"""Customer checkout and order management. OWNER: Developer 1.

Order creation is ONE Firestore transaction that (a) returns the existing order when the
idempotency key was already used, (b) reserves inventory through ``InventoryLedger`` and
(c) creates the order. Prices are always recomputed server-side from the catalogue.
"""

from __future__ import annotations

import hashlib
from typing import Any

from app.core.exceptions import ConflictError, NotFoundError
from app.core.firebase import run_in_transaction
from app.core.security import AuthUser
from app.modules.discounts.engine import DiscountEngine
from app.modules.discounts.pricing import Pricing, build_pricing
from app.modules.inventory.ledger import InventoryLedger, StockLine, merge_lines
from app.modules.orders.lifecycle import OrderLifecycleService, OrderScope
from app.modules.orders.repository import OrderRepository
from app.modules.orders.schemas import CartLine, CheckoutPreview
from app.modules.products.repository import ProductRepository
from app.modules.stores.repository import StoreRepository
from app.shared.enums import OrderStatus, OrderType, StoreOperatingStatus
from app.shared.models import Order, OrderItem, StatusEvent, Store, utc_now
from app.shared.money import sum_money, to_money
from app.shared.pagination import PageParams, Pagination
from app.shared.repository import serialize


def order_id_for(customer_id: str, idempotency_key: str) -> str:
    """Deterministic order id: the same customer + key always maps to the same document."""
    return hashlib.sha256(f"{customer_id}:{idempotency_key}".encode()).hexdigest()[:32]


class CustomerOrderService:
    """Checkout preview, order placement, tracking and cancellation for customers."""

    def __init__(self, db: Any, engine: DiscountEngine) -> None:
        self._db = db
        self._engine = engine
        self._orders = OrderRepository(db)
        self._stores = StoreRepository(db)
        self._products = ProductRepository(db)
        self._ledger = InventoryLedger(db)
        self._lifecycle = OrderLifecycleService(db)

    async def preview(self, store_id: str, lines: list[CartLine]) -> CheckoutPreview:
        """Price a cart without reserving anything."""
        await self._open_store(store_id)
        items, pricing = await self._price(store_id, lines)
        return CheckoutPreview(
            store_id=store_id,
            items=items,
            pricing=pricing,
            message=f"You save ₹{pricing.you_save:.0f} vs delivery",
        )

    async def create_order(
        self, customer: AuthUser, store_id: str, lines: list[CartLine], idempotency_key: str
    ) -> tuple[Order, bool]:
        """Place an order. Returns ``(order, created)``; ``created`` is False on idempotent replay."""
        order_id = order_id_for(customer.uid, idempotency_key)
        existing = await self._orders.get(order_id)
        if existing is not None:
            return existing, False  # fast path; the transaction below re-checks atomically

        store = await self._open_store(store_id)
        if await self._orders.is_at_capacity(store_id, store.preparation_capacity):
            raise ConflictError("Store is at preparation capacity, try again shortly", code="store_at_capacity")
        items, pricing = await self._price(store_id, lines)
        stock_lines = merge_lines(StockLine(i.product_id, i.quantity) for i in items)
        order_ref = self._orders.ref(order_id)

        async def _run(tx: Any) -> tuple[Order, bool]:
            snap = await order_ref.get(transaction=tx)
            if snap.exists:
                return Order.model_validate(snap.to_dict()), False
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
                pickup_discount=pricing.pickup_discount,
                pickup_fee=pricing.pickup_fee,
                total_amount=pricing.total_amount,
                order_type=OrderType.PICKUP,
                order_status=OrderStatus.PLACED,
                idempotency_key=idempotency_key,
                status_history=[
                    StatusEvent(status=OrderStatus.CREATED, at=now, actor_uid=customer.uid),
                    StatusEvent(status=OrderStatus.PLACED, at=now, actor_uid=customer.uid),
                ],
                created_at=now,
                updated_at=now,
            )
            tx.create(order_ref, serialize(order))
            return order, True

        return await run_in_transaction(self._db, _run)

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

    # ------------------------------------------------------------------ helpers
    async def _open_store(self, store_id: str) -> Store:
        store = await self._stores.get(store_id)
        if store is None or not store.pickup_enabled:
            raise NotFoundError("Store not found")
        if store.operating_status != StoreOperatingStatus.OPEN:
            raise ConflictError("Store is not accepting orders right now", code="store_not_accepting_orders")
        return store

    async def _price(self, store_id: str, lines: list[CartLine]) -> tuple[list[OrderItem], Pricing]:
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
        subtotal = sum_money([i.line_total for i in items])
        quote = await self._engine.quote(store_id=store_id, subtotal=subtotal)
        return items, build_pricing(subtotal, quote)
