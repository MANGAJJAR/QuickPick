"""Dark-store analytics routes. OWNER: Developer 2.

GET /api/v1/store/analytics/overview  (daily/performance are not implemented yet)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.api.dependencies import get_db, get_settings, require_store_staff
from app.core.config import Settings
from app.core.security import AuthUser
from app.modules.analytics.store_service import StoreAnalyticsService
from app.shared.schemas import ok

router = APIRouter(prefix="/store/analytics", tags=["store: analytics"])


def get_analytics_service(
    db: Any = Depends(get_db), settings: Settings = Depends(get_settings)
) -> StoreAnalyticsService:
    """Build the analytics service for this request."""
    return StoreAnalyticsService(db, settings.rider_cost_saved)


@router.get("/overview")
async def overview(
    user: AuthUser = Depends(require_store_staff),
    service: StoreAnalyticsService = Depends(get_analytics_service),
) -> dict:
    """Total pickups, avg preparation time, estimated rider cost saved (illustrative)."""
    return ok(await service.overview(user.store_id))  # type: ignore[arg-type]
