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


async def test_full_demo_seed_has_17_stores_with_at_least_25_items_each():
    from scripts.demo_catalogue import STORE_ROWS

    db = FakeFirestore()
    counts = await populate(db, full=True)
    assert counts["stores"] == 17 and len(STORE_ROWS) == 17
    per_store: dict[str, int] = {}
    for doc in db.docs("inventory").values():
        if doc["available_quantity"] > 0:
            per_store[doc["store_id"]] = per_store.get(doc["store_id"], 0) + 1
    assert set(per_store) == set(db.docs("stores"))
    assert min(per_store.values()) >= 25, per_store
    # still idempotent
    assert await populate(db, full=True) == counts
