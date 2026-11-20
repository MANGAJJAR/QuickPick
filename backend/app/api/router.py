"""Route registration. Each module exposes routers; this file is foundation-owned and already
includes every module, so developers add routes inside their own module files only."""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.analytics.store_routes import router as analytics_store
from app.modules.customers.routes import router as customers_profile
from app.modules.inventory.store_routes import router as inventory_store
from app.modules.notifications.routes import customer_router as notifications_customer
from app.modules.notifications.routes import store_router as notifications_store
from app.modules.orders.expiry import router as jobs_internal
from app.modules.orders.customer_routes import router as orders_customer
from app.modules.orders.store_routes import router as orders_store
from app.modules.pickup.customer_routes import router as pickup_customer
from app.modules.signals.routes import customer_router as offers_customer
from app.modules.signals.routes import store_router as signals_store
from app.modules.pickup.store_routes import router as pickup_store
from app.modules.products.routes import router as products_customer
from app.modules.stores.customer_routes import router as stores_customer
from app.modules.stores.store_routes import router as stores_store
from app.shared.schemas import ok

api_router = APIRouter(prefix="/api/v1")


@api_router.get("/health", tags=["system"])
async def api_health() -> dict:
    """Versioned liveness check."""
    return ok({"status": "ok"})


# Developer 1 (customer module)
for _r in (customers_profile, stores_customer, products_customer, orders_customer, pickup_customer, notifications_customer, offers_customer):
    api_router.include_router(_r)

# Developer 2 (dark-store module)
for _r in (stores_store, inventory_store, orders_store, pickup_store, analytics_store, notifications_store, signals_store):
    api_router.include_router(_r)

# Scheduler-triggered jobs (protected by a shared secret, disabled unless JOB_SECRET is set)
api_router.include_router(jobs_internal)
