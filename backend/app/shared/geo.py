"""Geo helpers."""

from __future__ import annotations

import math

from app.shared.models import GeoLocation

EARTH_RADIUS_KM = 6371.0088


def haversine_km(a: GeoLocation, b: GeoLocation) -> float:
    """Great-circle distance between two points in kilometres."""
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    d_lat = lat2 - lat1
    d_lng = math.radians(b.lng - a.lng)
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lng / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))
