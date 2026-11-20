"""Order pricing built from a subtotal and a discount quote."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.core.config import Settings
from app.modules.discounts.engine import DiscountQuote
from app.modules.signals.service import is_night
from app.shared.money import Money, sum_money, to_money


class Fees(BaseModel):
    """What a DELIVERY order of this cart pays on top of the items (and what a pickup order is spared)."""

    delivery: Money
    handling: Money
    night: Money


def compute_fees(settings: Settings, subtotal: Decimal, now_utc: datetime) -> Fees:
    """Delivery fee (waived above ``FREE_DELIVERY_ABOVE`` if that is set), handling fee, and the night fee in the night window."""
    free = settings.free_delivery_above > 0 and subtotal >= settings.free_delivery_above
    return Fees(
        delivery=to_money(0) if free else to_money(settings.delivery_fee),
        handling=to_money(settings.handling_fee),
        night=to_money(settings.night_fee) if is_night(settings, now_utc) else to_money(0),
    )


class Pricing(BaseModel):
    """Monetary breakdown stored on the order and shown in checkout preview.

    ``pickup_fee`` is QuickPick's per-order fee billed to the dark-store platform;
    it is recorded for analytics but NOT added to the customer's ``total_amount``.
    """

    subtotal: Money
    delivery_fee: Money  # what THIS order pays (0 for pickup)
    pickup_discount: Money
    pickup_fee: Money
    total_amount: Money
    #: Headline "You save vs delivery": the pickup discount plus every delivery charge a pickup order is spared.
    you_save: Money
    handling_fee: Money = Decimal("0.00")
    night_fee: Money = Decimal("0.00")
    #: Charges a delivery of this cart would have paid, shown struck through on a pickup bill.
    waived_delivery_fee: Money = Decimal("0.00")
    waived_handling_fee: Money = Decimal("0.00")
    waived_night_fee: Money = Decimal("0.00")
    rider_cost_saved: Money
    platform_net_saving: Decimal


def build_pricing(subtotal: Decimal, quote: DiscountQuote, waived: Fees | None = None) -> Pricing:
    """Pickup price: no fees are charged; the delivery charges it spares the customer count as savings."""
    subtotal = to_money(subtotal)
    delivery_fee = to_money(0)  # pickup orders have no delivery
    total = sum_money([subtotal, delivery_fee, -quote.pickup_discount])
    spared = [waived.delivery, waived.handling, waived.night] if waived else []
    return Pricing(
        subtotal=subtotal,
        delivery_fee=delivery_fee,
        pickup_discount=quote.pickup_discount,
        pickup_fee=quote.quickpick_fee,
        total_amount=total,
        you_save=sum_money([quote.pickup_discount, *spared]),
        waived_delivery_fee=waived.delivery if waived else to_money(0),
        waived_handling_fee=waived.handling if waived else to_money(0),
        waived_night_fee=waived.night if waived else to_money(0),
        rider_cost_saved=quote.rider_cost_saved,
        platform_net_saving=quote.platform_net_saving,
    )


def build_delivery_pricing(subtotal: Decimal, fees: Fees, rider_cost: Decimal) -> Pricing:
    """Price of the same cart delivered: delivery + handling (+ night) fees, no pickup discount, no QuickPick fee."""
    subtotal = to_money(subtotal)
    return Pricing(
        subtotal=subtotal,
        delivery_fee=fees.delivery,
        handling_fee=fees.handling,
        night_fee=fees.night,
        pickup_discount=to_money(0),
        pickup_fee=to_money(0),
        total_amount=sum_money([subtotal, fees.delivery, fees.handling, fees.night]),
        you_save=to_money(0),
        rider_cost_saved=to_money(rider_cost),
        platform_net_saving=to_money(0),
    )
