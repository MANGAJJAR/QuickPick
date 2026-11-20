"""Dark-store order routes. OWNER: Developer 2.

GET /api/v1/store/orders, GET /store/orders/{id}, POST /store/orders/{id}/accept|reject|start-preparation|ready
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import require_store_staff
from app.core.security import AuthUser
from app.modules.orders.deps import get_store_order_service
from app.modules.orders.schemas import RejectRequest
from app.modules.orders.store_service import StoreOrderService
from app.shared.enums import OrderStatus
from app.shared.pagination import PageParams, page_params
from app.shared.schemas import ok

router = APIRouter(prefix="/store/orders", tags=["store: orders"])


@router.get("")
async def list_orders(
    status: OrderStatus | None = Query(None),
    page: PageParams = Depends(page_params),
    user: AuthUser = Depends(require_store_staff),
    service: StoreOrderService = Depends(get_store_order_service),
) -> dict:
    """The store's orders (optionally by status)."""
    orders, pagination = await service.list_orders(user.store_id, page, status)  # type: ignore[arg-type]
    return ok(orders, pagination)


@router.get("/{order_id}")
async def get_order(
    order_id: str,
    user: AuthUser = Depends(require_store_staff),
    service: StoreOrderService = Depends(get_store_order_service),
) -> dict:
    """One order of this store."""
    return ok(await service.get_order(user.store_id, order_id))  # type: ignore[arg-type]


@router.post("/{order_id}/accept")
async def accept_order(
    order_id: str,
    user: AuthUser = Depends(require_store_staff),
    service: StoreOrderService = Depends(get_store_order_service),
) -> dict:
    """PLACED -> ACCEPTED."""
    return ok(await service.accept(user.store_id, user.uid, order_id))  # type: ignore[arg-type]


@router.post("/{order_id}/reject")
async def reject_order(
    order_id: str,
    body: RejectRequest | None = None,
    user: AuthUser = Depends(require_store_staff),
    service: StoreOrderService = Depends(get_store_order_service),
) -> dict:
    """PLACED -> CANCELLED and release stock."""
    return ok(await service.reject(user.store_id, user.uid, order_id, body.reason if body else None))  # type: ignore[arg-type]


@router.post("/{order_id}/start-preparation")
async def start_preparation(
    order_id: str,
    user: AuthUser = Depends(require_store_staff),
    service: StoreOrderService = Depends(get_store_order_service),
) -> dict:
    """ACCEPTED -> PREPARING."""
    return ok(await service.start_preparation(user.store_id, user.uid, order_id))  # type: ignore[arg-type]


@router.post("/{order_id}/ready")
async def mark_ready(
    order_id: str,
    user: AuthUser = Depends(require_store_staff),
    service: StoreOrderService = Depends(get_store_order_service),
) -> dict:
    """PREPARING -> READY_FOR_PICKUP."""
    return ok(await service.mark_ready(user.store_id, user.uid, order_id))  # type: ignore[arg-type]


@router.post("/{order_id}/dispatch")
async def dispatch_order(
    order_id: str,
    user: AuthUser = Depends(require_store_staff),
    service: StoreOrderService = Depends(get_store_order_service),
) -> dict:
    """Delivery orders: packed -> OUT_FOR_DELIVERY (a rider has the bag)."""
    return ok(await service.dispatch(user.store_id, user.uid, order_id))  # type: ignore[arg-type]


@router.post("/{order_id}/deliver")
async def deliver_order(
    order_id: str,
    user: AuthUser = Depends(require_store_staff),
    service: StoreOrderService = Depends(get_store_order_service),
) -> dict:
    """Delivery orders: OUT_FOR_DELIVERY -> DELIVERED (stock deducted)."""
    return ok(await service.deliver(user.store_id, user.uid, order_id))  # type: ignore[arg-type]
