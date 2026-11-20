"""Rider-supply and weather signals, and the "riders are busy" pricing multiplier.

When delivery riders are scarce (rain, festivals, the 8 PM rush) delivery gets slow and costly for the
platform. QuickPick turns that stress into ONE number, ``multiplier`` (1.0 = normal), from three inputs:

* weather    : LIVE from Open-Meteo (free, no key), cached; a store may override it (for demos/tests)
* rush hour  : a configurable local-time schedule (``RUSH_HOURS``)
* rider supply: a feed from the platform's rider system. There is no such feed in this repo, so it is
                SIMULATED: a store manager sets NORMAL / LOW / VERY_LOW (``PUT /store/signals``).
                Swap ``SignalService._supply`` for the platform's real feed when one exists.

``multiplier`` raises the delivery ETA, and raises the pickup discount for customers within walking distance
(see ``offer.py``). The response says which inputs are live, scheduled or simulated, so nothing is passed off as measured.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Callable, Protocol

from pydantic import BaseModel

from app.core.config import Settings
from app.shared.enums import RiderSupply, Weather
from app.shared.models import Store, utc_now
from app.shared.repository import serialize

logger = logging.getLogger("quickpick.signals")

# How much each condition adds to the multiplier. Illustrative, tuned for the demo.
SUPPLY_ADD = {RiderSupply.NORMAL: Decimal("0"), RiderSupply.LOW: Decimal("0.30"), RiderSupply.VERY_LOW: Decimal("0.60")}
WEATHER_ADD = {Weather.CLEAR: Decimal("0"), Weather.RAIN: Decimal("0.30"), Weather.STORM: Decimal("0.50")}
RUSH_ADD = Decimal("0.25")


class Signals(BaseModel):
    """The current delivery-stress picture around one store."""

    rider_supply: RiderSupply
    weather: Weather
    rush_hour: bool
    multiplier: Decimal
    surge_active: bool
    delivery_eta_minutes: int
    reasons: list[str]
    #: Where each input comes from, so the UI/pitch never overstates it.
    sources: dict[str, str]


class WeatherProvider(Protocol):
    async def current(self, lat: float, lng: float) -> Weather: ...


class NoWeather:
    """Weather disabled: always clear."""

    async def current(self, lat: float, lng: float) -> Weather:
        return Weather.CLEAR


class OpenMeteoWeather:
    """Current conditions from Open-Meteo (https://open-meteo.com, free, no API key). Cached; any failure means CLEAR."""

    URL = "https://api.open-meteo.com/v1/forecast"

    def __init__(self, ttl_seconds: int = 600, timeout: float = 2.5) -> None:
        self._ttl = ttl_seconds
        self._timeout = timeout
        self._cache: dict[tuple[float, float], tuple[float, Weather]] = {}

    async def current(self, lat: float, lng: float) -> Weather:
        key = (round(lat, 1), round(lng, 1))  # one reading covers a whole neighbourhood
        hit = self._cache.get(key)
        if hit and time.monotonic() - hit[0] < self._ttl:
            return hit[1]
        weather = Weather.CLEAR
        try:
            import httpx

            async with httpx.AsyncClient(timeout=self._timeout) as client:
                r = await client.get(self.URL, params={"latitude": key[0], "longitude": key[1], "current": "precipitation,weather_code"})
                r.raise_for_status()
                cur = r.json().get("current", {})
                weather = classify_weather(float(cur.get("precipitation") or 0), int(cur.get("weather_code") or 0))
        except Exception:  # noqa: BLE001 - weather must never break checkout
            logger.warning("weather_unavailable", exc_info=True)
        self._cache[key] = (time.monotonic(), weather)
        return weather


def classify_weather(precipitation_mm: float, weather_code: int) -> Weather:
    """WMO weather codes: 95-99 thunderstorm; 51-67 drizzle/rain and 80-82 showers; or measurable rain right now."""
    if weather_code >= 95:
        return Weather.STORM
    if 51 <= weather_code <= 67 or 80 <= weather_code <= 82 or precipitation_mm >= 0.5:
        return Weather.RAIN
    return Weather.CLEAR


def in_window(spec: str, offset_minutes: int, now_utc: datetime) -> bool:
    """True if the local time falls inside any window of ``spec`` ("12:30-14:00,19:30-21:30"). A window may cross midnight."""
    local = now_utc + timedelta(minutes=offset_minutes)
    minutes = local.hour * 60 + local.minute
    for window in (w.strip() for w in spec.split(",") if w.strip()):
        try:
            start, end = window.split("-")
            sh, sm = (int(x) for x in start.split(":"))
            eh, em = (int(x) for x in end.split(":"))
        except ValueError:
            continue
        lo, hi = sh * 60 + sm, eh * 60 + em
        if (lo <= minutes < hi) if lo <= hi else (minutes >= lo or minutes < hi):
            return True
    return False


def in_rush_hour(settings: Settings, now_utc: datetime) -> bool:
    """True if local time falls inside any ``RUSH_HOURS`` window."""
    return in_window(settings.rush_hours, settings.local_utc_offset_minutes, now_utc)


def is_night(settings: Settings, now_utc: datetime) -> bool:
    """True during the late-night window (``NIGHT_HOURS``), when delivery carries a night fee."""
    return in_window(settings.night_hours, settings.local_utc_offset_minutes, now_utc)


def compute(settings: Settings, supply: RiderSupply, weather: Weather, rush: bool) -> tuple[Decimal, list[str]]:
    """Multiplier (capped) and the plain-language reasons behind it."""
    reasons: list[str] = []
    total = Decimal("1")
    if supply != RiderSupply.NORMAL:
        reasons.append("Few riders are available" if supply == RiderSupply.LOW else "Almost no riders are available")
        total += SUPPLY_ADD[supply]
    if weather != Weather.CLEAR:
        reasons.append("Rain is slowing riders" if weather == Weather.RAIN else "Storms are slowing riders")
        total += WEATHER_ADD[weather]
    if rush:
        reasons.append("It is the evening rush")
        total += RUSH_ADD
    return min(total, settings.max_surge_multiplier), reasons


class SignalService:
    """Builds the signal snapshot for a store and stores the demo/override controls."""

    def __init__(
        self, db: Any, settings: Settings, weather: WeatherProvider | None = None,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self._db = db
        self._settings = settings
        self._weather = weather or (OpenMeteoWeather(settings.weather_cache_seconds) if settings.weather_enabled else NoWeather())
        self._clock = clock

    def _ref(self, store_id: str) -> Any:
        return self._db.collection("store_signals").document(store_id)

    async def _override(self, store_id: str) -> dict[str, Any]:
        snap = await self._ref(store_id).get()
        return snap.to_dict() or {} if snap.exists else {}

    async def snapshot(self, store: Store) -> Signals:
        now = self._clock()
        override = await self._override(store.id)
        supply = RiderSupply(override.get("rider_supply") or RiderSupply.NORMAL.value)
        sources = {"rider_supply": "simulated (set by the store; no live rider feed yet)", "rush_hour": "schedule"}
        forced = override.get("weather_override")
        if forced:
            weather, sources["weather"] = Weather(forced), "override"
        else:
            weather = await self._weather.current(store.location.lat, store.location.lng)
            sources["weather"] = "open-meteo (live)" if self._settings.weather_enabled else "off"
        rush = in_rush_hour(self._settings, now)
        multiplier, reasons = compute(self._settings, supply, weather, rush)
        eta = self._settings.delivery_base_eta_minutes + int(round((multiplier - 1) * 30))
        return Signals(
            rider_supply=supply, weather=weather, rush_hour=rush, multiplier=multiplier,
            surge_active=multiplier >= self._settings.surge_threshold, delivery_eta_minutes=eta,
            reasons=reasons, sources=sources,
        )

    async def set_controls(self, store: Store, *, rider_supply: RiderSupply, weather_override: Weather | None, actor_uid: str) -> Signals:
        await self._ref(store.id).set(serialize({
            "rider_supply": rider_supply, "weather_override": weather_override, "updated_at": self._clock(), "updated_by": actor_uid,
        }))
        return await self.snapshot(store)
