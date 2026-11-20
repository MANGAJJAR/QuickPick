"""Customer-facing store discovery. OWNER: Developer 1."""

from __future__ import annotations

from typing import Any

from app.core.exceptions import NotFoundError
from app.modules.stores.repository import StoreRepository
from app.modules.stores.schemas import StoreWithDistance
from app.shared.geo import haversine_km
from app.shared.models import GeoLocation, Store
from app.shared.pagination import PageParams, Pagination


class StoreDiscoveryService:
    """Lists pickup-enabled stores for customers."""

    def __init__(self, db: Any) -> None:
        self._stores = StoreRepository(db)

    async def list_stores(self, page: PageParams) -> tuple[list[Store], Pagination]:
        """Paginated pickup-enabled stores."""
        return await self._stores.list_pickup_enabled(page)

    async def nearby(
        self, origin: GeoLocation, radius_km: float, limit: int
    ) -> list[StoreWithDistance]:
        """Pickup-enabled stores within ``radius_km`` of ``origin``, nearest first.

        Distance is computed in memory over at most 200 stores, which is fine for the
        buildathon; switch to geohash range queries before scaling past a city.
        """
        stores = await self._stores.all_pickup_enabled()
        scored = [StoreWithDistance(store=s, distance_km=round(haversine_km(origin, s.location), 3)) for s in stores]
        within = [s for s in scored if s.distance_km <= radius_km]
        return sorted(within, key=lambda s: s.distance_km)[:limit]

    async def get_store(self, store_id: str) -> Store:
        """One pickup-enabled store, else 404."""
        store = await self._stores.get(store_id)
        if store is None or not store.pickup_enabled:
            raise NotFoundError("Store not found")
        return store
