"""Dark-store inventory routes. OWNER: Developer 2.

GET/POST /api/v1/store/inventory, GET /inventory/low-stock,
PATCH/DELETE /inventory/{product_id}
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_db, get_settings, require_store_manager, require_store_staff
from app.core.config import Settings
from app.core.security import AuthUser
from app.modules.inventory.schemas import InventoryCreate, InventoryUpdate
from app.modules.inventory.store_service import StoreInventoryService
from app.shared.pagination import PageParams, page_params
from app.shared.schemas import ok

router = APIRouter(prefix="/store/inventory", tags=["store: inventory"])


def get_inventory_service(
    db: Any = Depends(get_db), settings: Settings = Depends(get_settings)
) -> StoreInventoryService:
    """Build the inventory service for this request."""
    return StoreInventoryService(db, settings.low_stock_threshold)


@router.get("")
async def list_inventory(
    page: PageParams = Depends(page_params),
    user: AuthUser = Depends(require_store_staff),
    service: StoreInventoryService = Depends(get_inventory_service),
) -> dict:
    """The store's stock."""
    rows, pagination = await service.list_stock(user.store_id, page)  # type: ignore[arg-type]
    return ok(rows, pagination)


@router.get("/low-stock")
async def low_stock(
    threshold: int | None = Query(None, ge=0, le=10_000),
    user: AuthUser = Depends(require_store_staff),
    service: StoreInventoryService = Depends(get_inventory_service),
) -> dict:
    """Products at or below the low-stock threshold."""
    return ok(await service.low_stock(user.store_id, threshold))  # type: ignore[arg-type]


@router.post("", status_code=201)
async def add_inventory(
    body: InventoryCreate,
    user: AuthUser = Depends(require_store_staff),
    service: StoreInventoryService = Depends(get_inventory_service),
) -> dict:
    """Start stocking a catalogue product."""
    return ok(await service.add_product(user.store_id, body.product_id, body.available_quantity))  # type: ignore[arg-type]


@router.patch("/{product_id}")
async def update_inventory(
    product_id: str,
    body: InventoryUpdate,
    user: AuthUser = Depends(require_store_staff),
    service: StoreInventoryService = Depends(get_inventory_service),
) -> dict:
    """Set on-hand quantity (never below reserved)."""
    return ok(await service.set_quantity(user.store_id, product_id, body.available_quantity))  # type: ignore[arg-type]


@router.delete("/{product_id}")
async def delete_inventory(
    product_id: str,
    user: AuthUser = Depends(require_store_manager),
    service: StoreInventoryService = Depends(get_inventory_service),
) -> dict:
    """Stop stocking a product (manager only; blocked while reserved)."""
    await service.remove_product(user.store_id, product_id)  # type: ignore[arg-type]
    return ok({"deleted": product_id})
