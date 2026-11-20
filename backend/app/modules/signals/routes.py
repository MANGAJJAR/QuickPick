"""Signals and offer routes.

Customer: GET /customer/stores/{store_id}/offer?lat=&lng=   (is it worth walking right now?)
Store:    GET /store/signals, PUT /store/signals            (manager: simulate the rider feed / force weather)
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from app.api.dependencies import get_db, get_settings, require_customer, require_store_manager, require_store_staff
from app.core.config import Settings
from app.core.exceptions import NotFoundError
from app.core.security import AuthUser
from app.modules.discounts.deps import get_discount_engine
from app.modules.discounts.engine import DiscountEngine
from app.modules.signals.offer import build_offer, is_walkable, walk_distance
from app.modules.signals.service import OpenMeteoWeather, NoWeather, SignalService, WeatherProvider
from app.modules.stores.repository import StoreRepository
from app.shared.enums import RiderSupply, Weather
from app.shared.models import GeoLocation
from app.shared.schemas import ok

customer_router = APIRouter(prefix="/customer/stores", tags=["customer: offers"])
store_router = APIRouter(prefix="/store/signals", tags=["store: signals"])


def get_weather_provider(request: Request, settings: Settings = Depends(get_settings)) -> WeatherProvider:
    """One provider per process so its cache is shared (tests may pre-set ``app.state.weather_provider``)."""
    provider = getattr(request.app.state, "weather_provider", None)
    if provider is None:
        provider = OpenMeteoWeather(settings.weather_cache_seconds) if settings.weather_enabled else NoWeather()
        request.app.state.weather_provider = provider
    return provider


def get_signal_service(
    db: Any = Depends(get_db), settings: Settings = Depends(get_settings), weather: WeatherProvider = Depends(get_weather_provider)
) -> SignalService:
    return SignalService(db, settings, weather)


class SignalControls(BaseModel):
    """Manager's demo/override controls. ``weather`` null = use the live weather."""

    rider_supply: RiderSupply
    weather: Weather | None = None


@customer_router.get("/{store_id}/offer")
async def store_offer(
    store_id: str,
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    _: AuthUser = Depends(require_customer),
    db: Any = Depends(get_db),
    settings: Settings = Depends(get_settings),
    signals_service: SignalService = Depends(get_signal_service),
    engine: DiscountEngine = Depends(get_discount_engine),
) -> dict:
    """Should this customer walk to the store right now? Includes the live delivery ETA and the reasons."""
    store = await StoreRepository(db).get(store_id)
    if store is None or not store.pickup_enabled:
        raise NotFoundError("Store not found")
    location = GeoLocation(lat=lat, lng=lng) if lat is not None and lng is not None else None
    signals = await signals_service.snapshot(store)
    distance_m, _minutes = walk_distance(settings, store, location)
    # Quote for an order large enough that the discount is not limited by its value.
    quote = await engine.quote(
        store_id=store_id, subtotal=Decimal("1000"), surge_multiplier=signals.multiplier, walkable=is_walkable(settings, distance_m)
    )
    return ok(build_offer(settings, store, location, signals, quote.pickup_discount))


@store_router.get("")
async def get_signals(
    user: AuthUser = Depends(require_store_staff), db: Any = Depends(get_db), service: SignalService = Depends(get_signal_service)
) -> dict:
    """The current rider/weather picture for the caller's store."""
    store = await StoreRepository(db).get_or_raise(user.store_id or "", "Store not found")
    return ok(await service.snapshot(store))


@store_router.put("")
async def put_signals(
    body: SignalControls,
    user: AuthUser = Depends(require_store_manager),
    db: Any = Depends(get_db),
    service: SignalService = Depends(get_signal_service),
) -> dict:
    """Manager: set the (simulated) rider supply and optionally force the weather."""
    store = await StoreRepository(db).get_or_raise(user.store_id or "", "Store not found")
    return ok(await service.set_controls(store, rider_supply=body.rider_supply, weather_override=body.weather, actor_uid=user.uid))
