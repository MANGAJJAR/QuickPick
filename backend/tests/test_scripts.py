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
