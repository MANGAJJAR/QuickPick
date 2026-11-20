"""Dark-store self-management routes. OWNER: Developer 2.

GET/PATCH /api/v1/store/me, PATCH /store/me/status, PATCH /store/me/pickup-settings
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import require_store_manager, require_store_staff
from app.core.security import AuthUser
from app.modules.stores.deps import get_store_service
from app.modules.stores.schemas import PickupSettingsUpdate, StoreStatusUpdate, StoreUpdate
from app.modules.stores.store_service import StoreService
from app.shared.schemas import ok

router = APIRouter(prefix="/store/me", tags=["store: profile"])


@router.get("")
async def get_my_store(
    user: AuthUser = Depends(require_store_staff), service: StoreService = Depends(get_store_service)
) -> dict:
    """The caller's store."""
    return ok(await service.get_me(user.store_id))  # type: ignore[arg-type]


@router.patch("")
async def update_my_store(
    body: StoreUpdate,
    user: AuthUser = Depends(require_store_manager),
    service: StoreService = Depends(get_store_service),
) -> dict:
    """Update store profile (manager only)."""
    return ok(await service.update_me(user.store_id, body.model_dump(exclude_none=True)))  # type: ignore[arg-type]


@router.patch("/status")
async def set_status(
    body: StoreStatusUpdate,
    user: AuthUser = Depends(require_store_staff),
    service: StoreService = Depends(get_store_service),
) -> dict:
    """Open/pause/close the store."""
    return ok(await service.set_status(user.store_id, body.operating_status))  # type: ignore[arg-type]


@router.patch("/pickup-settings")
async def set_pickup_settings(
    body: PickupSettingsUpdate,
    user: AuthUser = Depends(require_store_manager),
    service: StoreService = Depends(get_store_service),
) -> dict:
    """Change pickup toggle / capacity (manager only)."""
    return ok(await service.set_pickup_settings(user.store_id, body.model_dump(exclude_none=True)))  # type: ignore[arg-type]
