"""Order request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from app.modules.discounts.pricing import Pricing
from app.shared.enums import ArrivalStatus, OrderType
from app.modules.signals.offer import WalkOffer
from app.shared.models import DeliveryAddress, GeoLocation, OrderItem


class CartLine(BaseModel):
    """One requested product line."""

    product_id: str = Field(min_length=1, max_length=100)
    quantity: int = Field(ge=1, le=50)


class CheckoutRequest(BaseModel):
    """Items from a single store. Prices are never accepted from the client.

    ``fulfilment`` picks PICKUP (default) or DELIVERY (needs ``delivery_address``). ``location`` is where the customer
    is right now: it only decides whether the "riders are busy, walk and save" discount applies (see signals/offer.py).
    """

    store_id: str = Field(min_length=1, max_length=100)
    items: list[CartLine] = Field(min_length=1, max_length=50)
    fulfilment: OrderType = OrderType.PICKUP
    delivery_address: DeliveryAddress | None = None
    location: GeoLocation | None = None

    @model_validator(mode="after")
    def _delivery_needs_address(self) -> "CheckoutRequest":
        if self.fulfilment == OrderType.DELIVERY and self.delivery_address is None:
            raise ValueError("delivery_address is required for delivery orders")
        return self


class CheckoutPreview(BaseModel):
    """Server-computed price breakdown shown before placing an order."""

    store_id: str
    items: list[OrderItem]
    pricing: Pricing  # PICKUP pricing for this customer right now (includes any "riders are busy" walk-in discount)
    message: str
    delivery: Pricing  # the same cart delivered
    delivery_eta_minutes: int
    offer: WalkOffer


class RejectRequest(BaseModel):
    """Optional reason when a store rejects an order."""

    reason: str | None = Field(default=None, max_length=200)


class CancelRequest(BaseModel):
    """Optional reason when a customer cancels."""

    reason: str | None = Field(default=None, max_length=200)


class ArrivalRequest(BaseModel):
    """"I'm 5 minutes away" (ON_THE_WAY + eta) or "I'm here" (ARRIVED). No location is ever sent."""

    status: ArrivalStatus
    eta_minutes: int | None = Field(default=None, ge=1, le=120)

    @model_validator(mode="after")
    def _eta_rules(self) -> "ArrivalRequest":
        if self.status == ArrivalStatus.ON_THE_WAY and self.eta_minutes is None:
            raise ValueError("eta_minutes is required when status is ON_THE_WAY")
        if self.status == ArrivalStatus.ARRIVED:
            self.eta_minutes = None
        return self
