"""Store inventory schemas. OWNER: Developer 2."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.shared.models import Inventory


class InventoryCreate(BaseModel):
    """Start stocking a product at the caller's store."""

    product_id: str = Field(min_length=1, max_length=100)
    available_quantity: int = Field(ge=0, le=1_000_000)


class InventoryUpdate(BaseModel):
    """Set the physical on-hand quantity (cannot go below what is reserved)."""

    available_quantity: int = Field(ge=0, le=1_000_000)


class InventoryOut(BaseModel):
    """Inventory row as returned to store staff, with the derived pickable figure."""

    store_id: str
    product_id: str
    available_quantity: int
    reserved_quantity: int
    pickable_quantity: int
    updated_at: datetime

    @classmethod
    def from_model(cls, inv: Inventory) -> "InventoryOut":
        """Build from the stored model."""
        return cls(
            store_id=inv.store_id,
            product_id=inv.product_id,
            available_quantity=inv.available_quantity,
            reserved_quantity=inv.reserved_quantity,
            pickable_quantity=inv.pickable_quantity,
            updated_at=inv.updated_at,
        )
