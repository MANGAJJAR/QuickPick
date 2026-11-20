"""Service factories for the orders module."""

from __future__ import annotations

from typing import Any

from fastapi import Depends

from app.api.dependencies import get_db
from app.modules.discounts.deps import get_discount_engine
from app.modules.discounts.engine import DiscountEngine
from app.modules.orders.customer_service import CustomerOrderService
from app.modules.orders.store_service import StoreOrderService


def get_customer_order_service(
    db: Any = Depends(get_db), engine: DiscountEngine = Depends(get_discount_engine)
) -> CustomerOrderService:
    """Customer order service (checkout, create, cancel)."""
    return CustomerOrderService(db, engine)


def get_store_order_service(db: Any = Depends(get_db)) -> StoreOrderService:
    """Dark-store order service."""
    return StoreOrderService(db)
