"""Customer store-discovery routes. OWNER: Developer 1.

GET /api/v1/customer/stores, /stores/nearby, /stores/{store_id}
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import require_customer
from app.core.security import AuthUser
from app.modules.stores.customer_service import StoreDiscoveryService
from app.modules.stores.deps import get_discovery_service
from app.shared.models import GeoLocation
from app.shared.pagination import PageParams, page_params
from app.shared.schemas import ok

router = APIRouter(prefix="/customer/stores", tags=["customer: stores"])


@router.get("")
async def list_stores(
    page: PageParams = Depends(page_params),
    _: AuthUser = Depends(require_customer),
    service: StoreDiscoveryService = Depends(get_discovery_service),
) -> dict:
    """Pickup-enabled stores."""
    stores, pagination = await service.list_stores(page)
    return ok(stores, pagination)


@router.get("/nearby")
async def nearby_stores(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius_km: float = Query(5.0, gt=0, le=50),
    limit: int = Query(20, ge=1, le=50),
    _: AuthUser = Depends(require_customer),
    service: StoreDiscoveryService = Depends(get_discovery_service),
) -> dict:
    """Stores near a coordinate, nearest first."""
    return ok(await service.nearby(GeoLocation(lat=lat, lng=lng), radius_km, limit))


@router.get("/{store_id}")
async def get_store(
    store_id: str,
    _: AuthUser = Depends(require_customer),
    service: StoreDiscoveryService = Depends(get_discovery_service),
) -> dict:
    """One store."""
    return ok(await service.get_store(store_id))
