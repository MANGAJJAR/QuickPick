"""Customer checkout/order routes. OWNER: Developer 1.

POST /api/v1/customer/checkout/preview, POST/GET /customer/orders,
GET /customer/orders/{id}, POST /customer/orders/{id}/cancel
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Response

from app.api.dependencies import require_customer
from app.core.security import AuthUser
from app.modules.orders.customer_service import CustomerOrderService
from app.modules.orders.deps import get_customer_order_service
from app.modules.orders.schemas import ArrivalRequest, CancelRequest, CheckoutRequest
from app.shared.pagination import PageParams, page_params
from app.shared.schemas import ok

router = APIRouter(prefix="/customer", tags=["customer: orders"])


@router.post("/checkout/preview")
async def checkout_preview(
    body: CheckoutRequest,
    _: AuthUser = Depends(require_customer),
    service: CustomerOrderService = Depends(get_customer_order_service),
) -> dict:
    """Server-priced preview including the pickup discount."""
    return ok(await service.preview(body.store_id, body.items, body.location))


@router.post("/orders", status_code=201)
async def create_order(
    body: CheckoutRequest,
    response: Response,
    idempotency_key: str = Header(min_length=8, max_length=128, alias="Idempotency-Key"),
    user: AuthUser = Depends(require_customer),
    service: CustomerOrderService = Depends(get_customer_order_service),
) -> dict:
    """Place a pickup order (reserves stock atomically). Replays with the same key return 200."""
    order, created = await service.create_order(
        user, body.store_id, body.items, idempotency_key, body.fulfilment, body.delivery_address, body.location
    )
    if not created:
        response.status_code = 200
    return ok(order)


@router.get("/orders")
async def list_orders(
    page: PageParams = Depends(page_params),
    user: AuthUser = Depends(require_customer),
    service: CustomerOrderService = Depends(get_customer_order_service),
) -> dict:
    """The caller's orders."""
    orders, pagination = await service.list_orders(user, page)
    return ok(orders, pagination)


@router.get("/orders/{order_id}")
async def get_order(
    order_id: str,
    user: AuthUser = Depends(require_customer),
    service: CustomerOrderService = Depends(get_customer_order_service),
) -> dict:
    """One of the caller's orders."""
    return ok(await service.get_order(user, order_id))


@router.post("/orders/{order_id}/cancel")
async def cancel_order(
    order_id: str,
    body: CancelRequest | None = None,
    user: AuthUser = Depends(require_customer),
    service: CustomerOrderService = Depends(get_customer_order_service),
) -> dict:
    """Cancel an order that has not started preparation."""
    return ok(await service.cancel_order(user, order_id, body.reason if body else None))


@router.post("/orders/{order_id}/arrival")
async def share_arrival(
    order_id: str,
    body: ArrivalRequest,
    user: AuthUser = Depends(require_customer),
    service: CustomerOrderService = Depends(get_customer_order_service),
) -> dict:
    """Tell the store you are ``ON_THE_WAY`` (with an ETA in minutes) or have ``ARRIVED``."""
    return ok(await service.set_arrival(user, order_id, body.status, body.eta_minutes))


@router.delete("/orders/{order_id}/arrival")
async def clear_arrival(
    order_id: str,
    user: AuthUser = Depends(require_customer),
    service: CustomerOrderService = Depends(get_customer_order_service),
) -> dict:
    """Withdraw a previously shared arrival signal."""
    return ok(await service.set_arrival(user, order_id, None, None))
