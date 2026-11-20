"""Service factories for the orders module."""

from __future__ import annotations

from typing import Any

from fastapi import Depends

from app.api.dependencies import get_db, get_settings
from app.core.config import Settings
from app.modules.notifications.push import PushDispatcher
from app.modules.notifications.routes import get_push_dispatcher
from app.modules.signals.routes import get_signal_service
from app.modules.signals.service import SignalService
from app.modules.discounts.deps import get_discount_engine
from app.modules.discounts.engine import DiscountEngine
from app.modules.orders.customer_service import CustomerOrderService
from app.modules.orders.store_service import StoreOrderService


def get_customer_order_service(
    db: Any = Depends(get_db),
    engine: DiscountEngine = Depends(get_discount_engine),
    settings: Settings = Depends(get_settings),
    push: PushDispatcher = Depends(get_push_dispatcher),
    signals: SignalService = Depends(get_signal_service),
) -> CustomerOrderService:
    """Customer order service (checkout, create, cancel, arrival)."""
    return CustomerOrderService(db, engine, settings=settings, push=push, signals=signals)


def get_store_order_service(
    db: Any = Depends(get_db),
    settings: Settings = Depends(get_settings),
    push: PushDispatcher = Depends(get_push_dispatcher),
) -> StoreOrderService:
    """Dark-store order service."""
    return StoreOrderService(db, settings=settings, push=push)
