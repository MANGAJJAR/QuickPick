"""Customer product browsing routes. OWNER: Developer 1.

GET /api/v1/customer/products, /products/{product_id}
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_db, require_customer
from app.core.security import AuthUser
from app.modules.products.service import ProductBrowseService
from app.shared.pagination import PageParams, page_params
from app.shared.schemas import ok

router = APIRouter(prefix="/customer/products", tags=["customer: products"])


def get_browse_service(db: Any = Depends(get_db)) -> ProductBrowseService:
    """Build the browse service for this request."""
    return ProductBrowseService(db)


@router.get("")
async def list_products(
    category: str | None = Query(None, max_length=60),
    store_id: str | None = Query(None, max_length=100),
    page: PageParams = Depends(page_params),
    _: AuthUser = Depends(require_customer),
    service: ProductBrowseService = Depends(get_browse_service),
) -> dict:
    """Browse products; pass ``store_id`` to see that store's availability."""
    items, pagination = await service.list_products(page, category, store_id)
    return ok(items, pagination)


@router.get("/{product_id}")
async def get_product(
    product_id: str,
    store_id: str | None = Query(None, max_length=100),
    _: AuthUser = Depends(require_customer),
    service: ProductBrowseService = Depends(get_browse_service),
) -> dict:
    """One product."""
    return ok(await service.get_product(product_id, store_id))
