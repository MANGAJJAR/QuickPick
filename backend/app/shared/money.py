"""Decimal money helpers. Floats are never used for monetary values."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from pydantic import Field

TWO_PLACES = Decimal("0.01")
ONE_RUPEE = Decimal("1")

#: Pydantic type for monetary amounts (serialised to JSON as a string like "24.00").
Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]


def to_money(value: Decimal | int | str) -> Decimal:
    """Convert to a 2-dp Decimal using round-half-up. Rejects ``float`` outright."""
    if isinstance(value, float):
        raise TypeError("floats are not allowed for money; use Decimal, int or str")
    return Decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def round_to_rupee(value: Decimal) -> Decimal:
    """Round half-up to a whole rupee, keeping 2-dp representation."""
    return to_money(value.quantize(ONE_RUPEE, rounding=ROUND_HALF_UP))


def sum_money(values: list[Decimal]) -> Decimal:
    """Sum amounts as Decimal, returning a 2-dp result."""
    return to_money(sum(values, Decimal("0")))
