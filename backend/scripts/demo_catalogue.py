"""Demo dataset for local/dev use: 17 simulated dark stores across Ahmedabad, 35 products, ~30 stocked per store.

Everything here is SIMULATED (no real partners, addresses are neighbourhood centres). The test suite keeps
using the tiny dataset in ``seed_dev_data.build_seed_documents``; this one is for demos (``python -m scripts.seed_dev_data``).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.shared.enums import StoreOperatingStatus
from app.shared.models import GeoLocation, Inventory, Product, Store, inventory_doc_id, utc_now

# (id, name, area, lat, lng)
STORE_ROWS: list[tuple[str, str, str, float, float]] = [
    ("store-a", "Satellite", "Satellite", 23.0258, 72.5873),
    ("store-b", "Bopal", "Bopal", 23.0300, 72.4700),
    ("store-d", "Navrangpura", "Navrangpura", 23.0365, 72.5611),
    ("store-e", "Maninagar", "Maninagar", 22.9965, 72.6006),
    ("store-f", "Prahlad Nagar", "Prahlad Nagar", 23.0120, 72.5108),
    ("store-g", "SG Highway", "SG Highway", 23.0700, 72.5170),
    ("store-h", "Thaltej", "Thaltej", 23.0510, 72.5070),
    ("store-i", "Bodakdev", "Bodakdev", 23.0390, 72.5120),
    ("store-j", "Naranpura", "Naranpura", 23.0620, 72.5560),
    ("store-k", "Chandkheda", "Chandkheda", 23.1080, 72.5850),
    ("store-l", "Gota", "Gota", 23.1030, 72.5450),
    ("store-m", "Ghatlodia", "Ghatlodia", 23.0780, 72.5400),
    ("store-n", "Paldi", "Paldi", 23.0140, 72.5620),
    ("store-o", "Ellisbridge", "Ellisbridge", 23.0225, 72.5714),
    ("store-p", "Ambawadi", "Ambawadi", 23.0210, 72.5530),
    ("store-q", "Shahibaug", "Shahibaug", 23.0500, 72.5900),
    ("store-r", "Nikol", "Nikol", 23.0430, 72.6700),
]

# (id, name, category, price, unit)
PRODUCT_ROWS: list[tuple[str, str, str, str, str]] = [
    ("milk", "Toned Milk", "Dairy", "30.00", "500 ml"),
    ("curd", "Fresh Curd", "Dairy", "40.00", "400 g"),
    ("eggs", "Farm Eggs", "Dairy", "60.00", "6 pcs"),
    ("butter", "Salted Butter", "Dairy", "58.00", "100 g"),
    ("paneer", "Fresh Paneer", "Dairy", "90.00", "200 g"),
    ("cheese", "Cheese Slices", "Dairy", "135.00", "200 g"),
    ("bread", "Brown Bread", "Bakery", "45.00", "400 g"),
    ("pav", "Pav Buns", "Bakery", "35.00", "6 pcs"),
    ("rusk", "Tea Rusk", "Bakery", "40.00", "200 g"),
    ("cake", "Plum Cake", "Bakery", "60.00", "200 g"),
    ("banana", "Bananas", "Fruits & Veg", "48.00", "6 pcs"),
    ("tomato", "Tomatoes", "Fruits & Veg", "32.00", "500 g"),
    ("onion", "Onions", "Fruits & Veg", "38.00", "1 kg"),
    ("potato", "Potatoes", "Fruits & Veg", "34.00", "1 kg"),
    ("apple", "Apples", "Fruits & Veg", "140.00", "4 pcs"),
    ("coriander", "Fresh Coriander", "Fruits & Veg", "15.00", "100 g"),
    ("cucumber", "Cucumber", "Fruits & Veg", "28.00", "500 g"),
    ("lemon", "Lemons", "Fruits & Veg", "25.00", "6 pcs"),
    ("chips", "Salted Chips", "Snacks", "20.00", "52 g"),
    ("biscuit", "Marie Biscuits", "Snacks", "25.00", "250 g"),
    ("namkeen", "Bhujia Sev", "Snacks", "55.00", "200 g"),
    ("popcorn", "Ready Popcorn", "Snacks", "45.00", "100 g"),
    ("chocolate", "Milk Chocolate", "Snacks", "50.00", "45 g"),
    ("cola", "Cola", "Beverages", "40.00", "750 ml"),
    ("juice", "Orange Juice", "Beverages", "99.00", "1 L"),
    ("water", "Packaged Water", "Beverages", "20.00", "1 L"),
    ("tea", "Tea Powder", "Beverages", "125.00", "250 g"),
    ("coffee", "Instant Coffee", "Beverages", "160.00", "100 g"),
    ("rice", "Basmati Rice", "Staples", "165.00", "1 kg"),
    ("atta", "Wheat Atta", "Staples", "55.00", "1 kg"),
    ("dal", "Toor Dal", "Staples", "160.00", "1 kg"),
    ("oil", "Sunflower Oil", "Staples", "150.00", "1 L"),
    ("sugar", "Sugar", "Staples", "48.00", "1 kg"),
    ("salt", "Iodised Salt", "Staples", "25.00", "1 kg"),
    ("soap", "Bathing Soap", "Household", "38.00", "100 g"),
]


def stock_quantity(store_index: int, product_index: int) -> int | None:
    """Deterministic demo stock. ``None`` = this store does not carry the product (about 1 in 12).

    A few items are low (1-5) or sold out (0) so the low-stock and sold-out UI has something to show.
    """
    if (store_index + product_index) % 12 == 0:
        return None
    v = (store_index * 31 + product_index * 17) % 29
    if v == 0:
        return 0
    if v < 5:
        return v
    return 6 + v


def build_demo_documents() -> dict[str, dict[str, Any]]:
    now = utc_now()
    stores: list[Store] = []
    for i, (sid, name, area, lat, lng) in enumerate(STORE_ROWS):
        stores.append(Store(
            id=sid, name=f"{name} Dark Store (simulated)", address=f"{area}, Ahmedabad",
            location=GeoLocation(lat=lat, lng=lng),
            operating_status=StoreOperatingStatus.OPEN, pickup_enabled=True,
            preparation_capacity=8 + (i % 5) * 2, created_at=now, updated_at=now,
        ))
    products = [
        Product(id=pid, name=name, category=cat, price=Decimal(price), unit=unit)
        for pid, name, cat, price, unit in PRODUCT_ROWS
    ]
    inventory: list[Inventory] = []
    for si, (sid, *_rest) in enumerate(STORE_ROWS):
        for pi, (pid, *_p) in enumerate(PRODUCT_ROWS):
            qty = stock_quantity(si, pi)
            if qty is None:
                continue
            inventory.append(Inventory(store_id=sid, product_id=pid, available_quantity=qty, reserved_quantity=0, updated_at=now))
    return {
        "stores": {s.id: s for s in stores},
        "products": {p.id: p for p in products},
        "inventory": {inventory_doc_id(i.store_id, i.product_id): i for i in inventory},
    }
