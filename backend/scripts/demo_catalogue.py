"""Demo dataset for local/dev use: 17 simulated dark stores across Ahmedabad, 90 products, each store carrying its own 25+ item slice.

Everything here is SIMULATED (no real partners, addresses are neighbourhood centres). The test suite keeps
using the tiny dataset in ``seed_dev_data.build_seed_documents``; this one is for demos (``python -m scripts.seed_dev_data``).
"""

from __future__ import annotations

import random
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
    ("buttermilk", "Masala Chaas", "Dairy", "15.00", "200 ml"),
    ("ghee", "Pure Ghee", "Dairy", "350.00", "500 ml"),
    ("lassi", "Sweet Lassi", "Dairy", "30.00", "200 ml"),
    ("yogurt", "Greek Yogurt", "Dairy", "55.00", "100 g"),
    ("bread", "Brown Bread", "Bakery", "45.00", "400 g"),
    ("pav", "Pav Buns", "Bakery", "35.00", "6 pcs"),
    ("rusk", "Tea Rusk", "Bakery", "40.00", "200 g"),
    ("cake", "Plum Cake", "Bakery", "60.00", "200 g"),
    ("khari", "Khari Biscuit", "Bakery", "45.00", "200 g"),
    ("croissant", "Butter Croissant", "Bakery", "65.00", "2 pcs"),
    ("bun", "Burger Buns", "Bakery", "40.00", "4 pcs"),
    ("multigrain", "Multigrain Bread", "Bakery", "55.00", "400 g"),
    ("banana", "Bananas", "Fruits & Veg", "48.00", "6 pcs"),
    ("tomato", "Tomatoes", "Fruits & Veg", "32.00", "500 g"),
    ("onion", "Onions", "Fruits & Veg", "38.00", "1 kg"),
    ("potato", "Potatoes", "Fruits & Veg", "34.00", "1 kg"),
    ("apple", "Apples", "Fruits & Veg", "140.00", "4 pcs"),
    ("coriander", "Fresh Coriander", "Fruits & Veg", "15.00", "100 g"),
    ("cucumber", "Cucumber", "Fruits & Veg", "28.00", "500 g"),
    ("lemon", "Lemons", "Fruits & Veg", "25.00", "6 pcs"),
    ("mango", "Kesar Mango", "Fruits & Veg", "180.00", "1 kg"),
    ("grapes", "Green Grapes", "Fruits & Veg", "90.00", "500 g"),
    ("papaya", "Papaya", "Fruits & Veg", "60.00", "1 pc"),
    ("spinach", "Palak Spinach", "Fruits & Veg", "22.00", "250 g"),
    ("capsicum", "Capsicum", "Fruits & Veg", "45.00", "500 g"),
    ("carrot", "Carrots", "Fruits & Veg", "40.00", "500 g"),
    ("ginger", "Ginger", "Fruits & Veg", "30.00", "200 g"),
    ("garlic", "Garlic", "Fruits & Veg", "40.00", "250 g"),
    ("pomegranate", "Pomegranate", "Fruits & Veg", "130.00", "2 pcs"),
    ("watermelon", "Watermelon", "Fruits & Veg", "70.00", "1 pc"),
    ("chips", "Salted Chips", "Snacks", "20.00", "52 g"),
    ("biscuit", "Marie Biscuits", "Snacks", "25.00", "250 g"),
    ("namkeen", "Bhujia Sev", "Snacks", "55.00", "200 g"),
    ("popcorn", "Ready Popcorn", "Snacks", "45.00", "100 g"),
    ("chocolate", "Milk Chocolate", "Snacks", "50.00", "45 g"),
    ("fafda", "Fafda Gathiya", "Snacks", "70.00", "200 g"),
    ("khakhra", "Methi Khakhra", "Snacks", "60.00", "200 g"),
    ("thepla", "Ready Thepla", "Snacks", "55.00", "5 pcs"),
    ("nachos", "Cheese Nachos", "Snacks", "40.00", "60 g"),
    ("cookies", "Choco Cookies", "Snacks", "50.00", "150 g"),
    ("makhana", "Roasted Makhana", "Snacks", "99.00", "80 g"),
    ("peanuts", "Masala Peanuts", "Snacks", "30.00", "150 g"),
    ("cola", "Cola", "Beverages", "40.00", "750 ml"),
    ("juice", "Orange Juice", "Beverages", "99.00", "1 L"),
    ("water", "Packaged Water", "Beverages", "20.00", "1 L"),
    ("tea", "Tea Powder", "Beverages", "125.00", "250 g"),
    ("coffee", "Instant Coffee", "Beverages", "160.00", "100 g"),
    ("lemonsoda", "Lemon Soda", "Beverages", "35.00", "600 ml"),
    ("coconutwater", "Coconut Water", "Beverages", "45.00", "200 ml"),
    ("energy", "Energy Drink", "Beverages", "110.00", "250 ml"),
    ("greentea", "Green Tea Bags", "Beverages", "150.00", "25 bags"),
    ("mangojuice", "Mango Drink", "Beverages", "25.00", "200 ml"),
    ("icetea", "Peach Iced Tea", "Beverages", "40.00", "500 ml"),
    ("rice", "Basmati Rice", "Staples", "165.00", "1 kg"),
    ("atta", "Wheat Atta", "Staples", "55.00", "1 kg"),
    ("dal", "Toor Dal", "Staples", "160.00", "1 kg"),
    ("oil", "Sunflower Oil", "Staples", "150.00", "1 L"),
    ("sugar", "Sugar", "Staples", "48.00", "1 kg"),
    ("salt", "Iodised Salt", "Staples", "25.00", "1 kg"),
    ("besan", "Besan", "Staples", "75.00", "500 g"),
    ("poha", "Thick Poha", "Staples", "50.00", "500 g"),
    ("moong", "Moong Dal", "Staples", "140.00", "1 kg"),
    ("jaggery", "Jaggery", "Staples", "65.00", "500 g"),
    ("rajma", "Rajma", "Staples", "130.00", "500 g"),
    ("oats", "Rolled Oats", "Staples", "120.00", "500 g"),
    ("pasta", "Penne Pasta", "Staples", "80.00", "500 g"),
    ("noodles", "Instant Noodles", "Staples", "14.00", "70 g"),
    ("turmeric", "Turmeric Powder", "Spices & Sauces", "45.00", "100 g"),
    ("chilli", "Red Chilli Powder", "Spices & Sauces", "60.00", "100 g"),
    ("garammasala", "Garam Masala", "Spices & Sauces", "75.00", "100 g"),
    ("ketchup", "Tomato Ketchup", "Spices & Sauces", "110.00", "500 g"),
    ("jam", "Mixed Fruit Jam", "Spices & Sauces", "95.00", "200 g"),
    ("pickle", "Mango Pickle", "Spices & Sauces", "85.00", "300 g"),
    ("peanutbutter", "Peanut Butter", "Spices & Sauces", "180.00", "340 g"),
    ("mayo", "Eggless Mayo", "Spices & Sauces", "80.00", "250 g"),
    ("soap", "Bathing Soap", "Household & Care", "38.00", "100 g"),
    ("shampoo", "Herbal Shampoo", "Household & Care", "95.00", "180 ml"),
    ("toothpaste", "Toothpaste", "Household & Care", "85.00", "150 g"),
    ("detergent", "Detergent Powder", "Household & Care", "120.00", "1 kg"),
    ("dishwash", "Dishwash Gel", "Household & Care", "99.00", "500 ml"),
    ("tissue", "Tissue Roll", "Household & Care", "45.00", "2 pcs"),
    ("handwash", "Hand Wash", "Household & Care", "79.00", "250 ml"),
    ("garbagebag", "Garbage Bags", "Household & Care", "60.00", "30 pcs"),
    ("peas", "Frozen Green Peas", "Frozen", "85.00", "500 g"),
    ("icecream", "Vanilla Ice Cream", "Frozen", "120.00", "500 ml"),
    ("nuggets", "Veg Nuggets", "Frozen", "160.00", "250 g"),
    ("fries", "French Fries", "Frozen", "110.00", "420 g"),
]


BASICS = {"milk", "bread", "eggs", "water", "atta", "salt"}  # every store carries these


def carries(store_index: int, product_index: int, product_id: str) -> bool:
    """Each store carries its own slice of the catalogue (about 70%), so stores genuinely differ."""
    if product_id in BASICS:
        return True
    return random.Random(f"{store_index}:{product_index}").random() < 0.7  # string seeds are deterministic


def stock_quantity(store_index: int, product_index: int) -> int | None:
    """Deterministic demo stock. ``None`` = this store does not carry the product.

    A few items are low (1-5) or sold out (0) so the low-stock and sold-out UI has something to show.
    """
    if not carries(store_index, product_index, PRODUCT_ROWS[product_index][0]):
        return None
    v = (store_index * 31 + product_index * 17) % 29
    if PRODUCT_ROWS[product_index][0] in BASICS:
        return 12 + v  # the staples are never low or sold out, so every store can always take a basic order
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
