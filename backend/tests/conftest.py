"""Shared fixtures: in-memory Firestore, fake token verifier, seeded dataset, HTTP client."""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.core.exceptions import UnauthorizedError
from app.main import create_app
from scripts.seed_dev_data import populate
from tests.fakes.firestore import FakeFirestore

# token -> verified claims (what Firebase would have returned)
TOKENS: dict[str, dict[str, Any]] = {
    "customer1": {"uid": "cust-1", "email": "c1@example.com", "name": "Cust One", "role": "CUSTOMER"},
    "customer2": {"uid": "cust-2", "email": "c2@example.com", "role": "CUSTOMER"},
    "staff-a": {"uid": "staff-a", "role": "STORE_STAFF", "store_id": "store-a"},
    "manager-a": {"uid": "mgr-a", "role": "STORE_MANAGER", "store_id": "store-a"},
    "staff-b": {"uid": "staff-b", "role": "STORE_STAFF", "store_id": "store-b"},
    "staff-nostore": {"uid": "staff-x", "role": "STORE_STAFF"},
    "admin": {"uid": "admin-1", "role": "ADMIN"},
    "spoof": {"uid": "cust-spoof", "role": "CUSTOMER", "store_id": "store-a"},  # store claim ignored for customers
}


class FakeVerifier:
    """Accepts the tokens in ``TOKENS``; everything else is rejected like an invalid JWT."""

    async def verify(self, token: str) -> dict[str, Any]:
        if token not in TOKENS:
            raise UnauthorizedError("Invalid or expired token")
        return dict(TOKENS[token])


@pytest.fixture
def settings() -> Settings:
    return Settings(
        environment="test",
        pickup_token_secret=SecretStr("unit-test-secret"),
        pickup_token_ttl_seconds=600,
        pickup_max_verify_attempts=3,
        expiry_sweep_interval_seconds=0,  # tests run sweeps explicitly
        weather_enabled=False,  # tests must be offline and deterministic
        rush_hours="",  # no time-of-day surprises
        job_secret=SecretStr("job-secret"),
    )


@pytest.fixture
async def db() -> FakeFirestore:
    fake = FakeFirestore()
    await populate(fake)
    return fake


@pytest.fixture
def app(settings: Settings, db: FakeFirestore):
    return create_app(settings=settings, db=db, token_verifier=FakeVerifier())


@pytest.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def auth(token: str) -> dict[str, str]:
    """Authorization header for a fake token."""
    return {"Authorization": f"Bearer {token}"}


async def place_order(client, token: str = "customer1", key: str = "key-0001", items=None, store_id: str = "store-a"):
    """Helper: place an order and return the raw response."""
    return await client.post(
        "/api/v1/customer/orders",
        headers={**auth(token), "Idempotency-Key": key},
        json={"store_id": store_id, "items": items or [{"product_id": "milk", "quantity": 2}]},
    )


async def advance_to_ready(client, order_id: str, staff: str = "staff-a") -> None:
    """Helper: drive an order PLACED -> READY_FOR_PICKUP through the store API."""
    for step in ("accept", "start-preparation", "ready"):
        r = await client.post(f"/api/v1/store/orders/{order_id}/{step}", headers=auth(staff))
        assert r.status_code == 200, r.text
