"""Order request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.modules.discounts.pricing import Pricing
from app.shared.models import OrderItem


class CartLine(BaseModel):
    """One requested product line."""

    product_id: str = Field(min_length=1, max_length=100)
    quantity: int = Field(ge=1, le=50)


class CheckoutRequest(BaseModel):
    """Items from a single store. Prices are never accepted from the client."""

    store_id: str = Field(min_length=1, max_length=100)
    items: list[CartLine] = Field(min_length=1, max_length=50)


class CheckoutPreview(BaseModel):
    """Server-computed price breakdown shown before placing an order."""

    store_id: str
    items: list[OrderItem]
    pricing: Pricing
    message: str


class RejectRequest(BaseModel):
    """Optional reason when a store rejects an order."""

    reason: str | None = Field(default=None, max_length=200)


class CancelRequest(BaseModel):
    """Optional reason when a customer cancels."""

    reason: str | None = Field(default=None, max_length=200)
