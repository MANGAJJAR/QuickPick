"""Service factories for the stores module."""

from __future__ import annotations

from typing import Any

from fastapi import Depends

from app.api.dependencies import get_db
from app.modules.stores.customer_service import StoreDiscoveryService
from app.modules.stores.store_service import StoreService


def get_discovery_service(db: Any = Depends(get_db)) -> StoreDiscoveryService:
    """Customer store discovery service."""
    return StoreDiscoveryService(db)


def get_store_service(db: Any = Depends(get_db)) -> StoreService:
    """Dark-store management service."""
    return StoreService(db)
