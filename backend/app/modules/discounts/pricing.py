"""Order pricing built from a subtotal and a discount quote."""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel

from app.modules.discounts.engine import DiscountQuote
from app.shared.money import Money, sum_money, to_money


class Pricing(BaseModel):
    """Monetary breakdown stored on the order and shown in checkout preview.

    ``pickup_fee`` is QuickPick's per-order fee billed to the dark-store platform;
    it is recorded for analytics but NOT added to the customer's ``total_amount``.
    """

    subtotal: Money
    delivery_fee: Money
    pickup_discount: Money
    pickup_fee: Money
    total_amount: Money
    you_save: Money  # headline "You save vs delivery" figure (= pickup_discount)
    rider_cost_saved: Money
    platform_net_saving: Decimal


def build_pricing(subtotal: Decimal, quote: DiscountQuote) -> Pricing:
    """Combine a subtotal and quote into the final price breakdown."""
    subtotal = to_money(subtotal)
    delivery_fee = to_money(0)  # pickup orders have no delivery
    total = sum_money([subtotal, delivery_fee, -quote.pickup_discount])
    return Pricing(
        subtotal=subtotal,
        delivery_fee=delivery_fee,
        pickup_discount=quote.pickup_discount,
        pickup_fee=quote.quickpick_fee,
        total_amount=total,
        you_save=quote.pickup_discount,
        rider_cost_saved=quote.rider_cost_saved,
        platform_net_saving=quote.platform_net_saving,
    )


def build_delivery_pricing(subtotal: Decimal, fee: Decimal, free_above: Decimal, rider_cost: Decimal) -> Pricing:
    """Price of the same cart delivered: a flat fee, free from ``free_above``; no pickup discount, no QuickPick fee."""
    subtotal = to_money(subtotal)
    delivery_fee = to_money(0) if subtotal >= free_above else to_money(fee)
    return Pricing(
        subtotal=subtotal,
        delivery_fee=delivery_fee,
        pickup_discount=to_money(0),
        pickup_fee=to_money(0),
        total_amount=sum_money([subtotal, delivery_fee]),
        you_save=to_money(0),
        rider_cost_saved=to_money(rider_cost),
        platform_net_saving=to_money(0),
    )
