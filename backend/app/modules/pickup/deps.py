"""Service factories for the pickup module."""

from __future__ import annotations

from typing import Any

from fastapi import Depends

from app.api.dependencies import get_db, get_settings
from app.core.config import Settings
from app.modules.pickup.queue import PickupQueueService
from app.modules.pickup.service import PickupService


def get_pickup_service(
    db: Any = Depends(get_db), settings: Settings = Depends(get_settings)
) -> PickupService:
    """Pickup credential service."""
    return PickupService(db, settings)


def get_queue_service(db: Any = Depends(get_db)) -> PickupQueueService:
    """Live queue service."""
    return PickupQueueService(db)
