"""Dark-store self-management. OWNER: Developer 2.

Every method receives the caller's ``store_id`` from the verified token claim, never from
the request, so a staff member can only ever read or change their own store.
"""

from __future__ import annotations

from typing import Any

from app.core.exceptions import NotFoundError
from app.modules.stores.repository import StoreRepository
from app.shared.enums import StoreOperatingStatus
from app.shared.models import Store, utc_now


class StoreService:
    """Store profile, status and pickup settings."""

    def __init__(self, db: Any) -> None:
        self._stores = StoreRepository(db)

    async def get_me(self, store_id: str) -> Store:
        """The caller's own store."""
        return await self._stores.get_or_raise(store_id, "Store not found")

    async def update_me(self, store_id: str, fields: dict[str, Any]) -> Store:
        """Update profile fields (name, address, location)."""
        return await self._patch(store_id, fields)

    async def set_status(self, store_id: str, status: StoreOperatingStatus) -> Store:
        """Open, pause or close the store."""
        return await self._patch(store_id, {"operating_status": status})

    async def set_pickup_settings(self, store_id: str, fields: dict[str, Any]) -> Store:
        """Update pickup_enabled / preparation_capacity."""
        return await self._patch(store_id, fields)

    async def _patch(self, store_id: str, fields: dict[str, Any]) -> Store:
        if await self._stores.get(store_id) is None:
            raise NotFoundError("Store not found")
        if fields:
            await self._stores.update(store_id, {**fields, "updated_at": utc_now()})
        return await self._stores.get_or_raise(store_id)
