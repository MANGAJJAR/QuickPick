"""Operator scripts: seed data and role provisioning."""

from __future__ import annotations

import pytest

from app.shared.enums import Role
from scripts.seed_dev_data import populate
from scripts.set_role import build_claims
from tests.fakes.firestore import FakeFirestore


async def test_seed_is_idempotent_and_storable():
    db = FakeFirestore()
    first = await populate(db)
    second = await populate(db)
    assert first == second == {"stores": 2, "products": 3, "inventory": 4}
    assert set(db.docs("inventory")) == {"store-a__milk", "store-a__bread", "store-a__eggs", "store-b__milk"}


def test_build_claims_validates_store_requirement():
    assert build_claims(Role.STORE_STAFF, "store-a") == {"role": "STORE_STAFF", "store_id": "store-a"}
    assert build_claims(Role.CUSTOMER, None) == {"role": "CUSTOMER"}
    with pytest.raises(ValueError):
        build_claims(Role.STORE_MANAGER, None)
    with pytest.raises(ValueError):
        build_claims(Role.ADMIN, "store-a")


async def test_full_demo_seed_has_17_stores_each_with_its_own_25_plus_products():
    from scripts.demo_catalogue import STORE_ROWS

    db = FakeFirestore()
    counts = await populate(db, full=True)
    assert counts["stores"] == 17 and len(STORE_ROWS) == 17
    assert counts["products"] >= 80
    per_store: dict[str, set[str]] = {}
    for doc in db.docs("inventory").values():
        if doc["available_quantity"] > 0:
            per_store.setdefault(doc["store_id"], set()).add(doc["product_id"])
    assert set(per_store) == set(db.docs("stores"))
    assert min(len(v) for v in per_store.values()) >= 25, {k: len(v) for k, v in per_store.items()}
    # stores must really differ: no two stores share more than 75% of their range
    ids = list(per_store)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            overlap = len(per_store[a] & per_store[b]) / len(per_store[a] | per_store[b])
            assert overlap < 0.75, (a, b, overlap)
    # still idempotent
    assert await populate(db, full=True) == counts


async def test_every_demo_store_has_the_basics_in_real_stock():
    from scripts.demo_catalogue import BASICS

    db = FakeFirestore()
    await populate(db, full=True)
    inv = db.docs("inventory")
    for store_id in db.docs("stores"):
        for basic in BASICS:
            assert inv[f"{store_id}__{basic}"]["available_quantity"] >= 12, (store_id, basic)
