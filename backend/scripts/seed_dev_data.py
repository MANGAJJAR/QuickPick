"""Seed simulated stores, products and inventory (simulated data only, no real partners).

Usage (against the Firestore emulator or a DEV project, never production):

    set FIRESTORE_EMULATOR_HOST=localhost:8081
    python -m scripts.seed_dev_data
"""

from __future__ import annotations

import asyncio
from decimal import Decimal
from typing import Any

from app.core.config import get_settings
from app.core.firebase import create_firestore_client
from app.shared.enums import StoreOperatingStatus
from app.shared.models import GeoLocation, Inventory, Product, Store, inventory_doc_id, utc_now
from app.shared.repository import serialize


def build_seed_documents() -> dict[str, dict[str, Any]]:
    """Return ``{collection: {doc_id: model}}`` for the simulated demo dataset."""
    now = utc_now()
    stores = [
        Store(id="store-a", name="Satellite Dark Store (simulated)", address="Satellite, Ahmedabad",
              location=GeoLocation(lat=23.0258, lng=72.5873), operating_status=StoreOperatingStatus.OPEN,
              pickup_enabled=True, preparation_capacity=10, created_at=now, updated_at=now),
        Store(id="store-b", name="Bopal Dark Store (simulated)", address="Bopal, Ahmedabad",
              location=GeoLocation(lat=23.0300, lng=72.4700), operating_status=StoreOperatingStatus.OPEN,
              pickup_enabled=True, preparation_capacity=10, created_at=now, updated_at=now),
    ]
    products = [
        Product(id="milk", name="Milk 500ml", category="dairy", price=Decimal("30.00"), unit="pack"),
        Product(id="bread", name="Brown Bread", category="bakery", price=Decimal("45.00"), unit="loaf"),
        Product(id="eggs", name="Eggs (6)", category="dairy", price=Decimal("60.00"), unit="tray"),
    ]
    stock = [
        ("store-a", "milk", 10), ("store-a", "bread", 5), ("store-a", "eggs", 20), ("store-b", "milk", 10),
    ]
    inventory = [
        Inventory(store_id=s, product_id=p, available_quantity=q, reserved_quantity=0, updated_at=now)
        for s, p, q in stock
    ]
    return {
        "stores": {s.id: s for s in stores},
        "products": {p.id: p for p in products},
        "inventory": {inventory_doc_id(i.store_id, i.product_id): i for i in inventory},
    }


async def populate(db: Any) -> dict[str, int]:
    """Write the seed documents (idempotent: documents are overwritten) and return counts."""
    docs = build_seed_documents()
    for collection, items in docs.items():
        for doc_id, model in items.items():
            await db.collection(collection).document(doc_id).set(serialize(model))
    return {c: len(items) for c, items in docs.items()}


async def _main() -> None:
    counts = await populate(create_firestore_client(get_settings()))
    print(f"Seeded: {counts}")


if __name__ == "__main__":
    asyncio.run(_main())
