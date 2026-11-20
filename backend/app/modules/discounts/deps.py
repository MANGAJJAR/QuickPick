"""Factory for the discount engine. Swap the return value to plug in an AI pricing model."""

from __future__ import annotations

from fastapi import Depends

from app.api.dependencies import get_settings
from app.core.config import Settings
from app.modules.discounts.engine import ConfigDiscountEngine, DiscountEngine


def get_discount_engine(settings: Settings = Depends(get_settings)) -> DiscountEngine:
    """Return the active discount engine (config-driven mock for the buildathon)."""
    return ConfigDiscountEngine(settings)
