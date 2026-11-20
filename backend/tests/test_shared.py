"""Shared-foundation tests: startup, auth, roles, lifecycle, money, discounts, schemas."""

from __future__ import annotations

from decimal import Decimal
from itertools import product

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.exceptions import InvalidTransitionError
from app.core.security import AuthUser
from app.main import create_app
from app.modules.discounts.engine import ConfigDiscountEngine
from app.modules.discounts.pricing import build_pricing
from app.modules.orders.lifecycle import OrderLifecycleService, OrderScope
from app.shared.enums import OrderStatus, Role
from app.shared.models import GeoLocation, Inventory, Store, utc_now
from app.shared.money import round_to_rupee, sum_money, to_money
from app.shared.order_lifecycle import ALLOWED_TRANSITIONS, TERMINAL_STATES, assert_transition, can_transition
from app.shared.geo import haversine_km
from tests.conftest import FakeVerifier, auth, place_order


# --------------------------------------------------------------------- startup / health
async def test_health_endpoints(client):
    for path in ("/health", "/api/v1/health", "/ready"):
        r = await client.get(path)
        assert r.status_code == 200, path
        body = r.json()
        assert body["success"] is True and body["error"] is None


async def test_ready_fails_when_database_down(settings):
    class BrokenDb:
        def collection(self, name):
            raise RuntimeError("firestore down")

    app = create_app(settings=settings, db=BrokenDb(), token_verifier=FakeVerifier())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get("/ready")
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "service_unavailable"


def test_settings_require_secret_in_production():
    with pytest.raises(ValidationError):
        Settings(environment="production", pickup_token_secret=None)


async def test_unknown_route_envelope(client):
    r = await client.get("/api/v1/nope")
    assert r.status_code == 404
    assert r.json()["success"] is False and r.json()["error"]["code"] == "http_404"


# --------------------------------------------------------------------- authentication
async def test_missing_token_is_401(client):
    r = await client.get("/api/v1/customers/me")
    assert r.status_code == 401
    assert r.json() == {"success": False, "data": None, "error": {"code": "unauthorized", "message": "Missing bearer token"}}


async def test_invalid_token_is_401(client):
    r = await client.get("/api/v1/customers/me", headers=auth("garbage"))
    assert r.status_code == 401


async def test_role_comes_from_token_not_body(client):
    r = await client.patch("/api/v1/customers/me", headers=auth("customer1"), json={"name": "New Name", "role": "ADMIN", "uid": "other"})
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["name"] == "New Name" and data["role"] == "CUSTOMER" and data["uid"] == "cust-1"


def test_unknown_role_degrades_to_customer_and_customer_never_gets_store():
    user = AuthUser.from_claims({"uid": "u", "role": "SUPERUSER", "store_id": "store-a"})
    assert user.role is Role.CUSTOMER and user.store_id is None
    staff = AuthUser.from_claims({"uid": "s", "role": "STORE_STAFF", "store_id": "store-a"})
    assert staff.store_id == "store-a"


# --------------------------------------------------------------------- role / store authorization
async def test_role_authorization(client):
    assert (await client.get("/api/v1/store/orders", headers=auth("customer1"))).status_code == 403
    assert (await client.get("/api/v1/customer/orders", headers=auth("staff-a"))).status_code == 403
    assert (await client.get("/api/v1/store/orders", headers=auth("admin"))).status_code == 403
    assert (await client.get("/api/v1/store/me", headers=auth("spoof"))).status_code == 403


async def test_store_claim_required_for_store_endpoints(client):
    r = await client.get("/api/v1/store/orders", headers=auth("staff-nostore"))
    assert r.status_code == 403 and r.json()["error"]["code"] == "store_claim_missing"


async def test_manager_only_operations(client):
    assert (await client.patch("/api/v1/store/me", headers=auth("staff-a"), json={"name": "X"})).status_code == 403
    r = await client.patch("/api/v1/store/me", headers=auth("manager-a"), json={"name": "Renamed Store"})
    assert r.status_code == 200 and r.json()["data"]["name"] == "Renamed Store"


# --------------------------------------------------------------------- order lifecycle
def test_transition_table_is_exactly_the_documented_lifecycle():
    S = OrderStatus
    expected_happy_path = [S.CREATED, S.PLACED, S.ACCEPTED, S.PREPARING, S.READY_FOR_PICKUP, S.COMPLETED]
    for a, b in zip(expected_happy_path, expected_happy_path[1:]):
        assert can_transition(a, b)
    for a, b in product(S, S):  # every other happy-path "jump" is illegal
        if a in expected_happy_path and b in expected_happy_path:
            idx_a, idx_b = expected_happy_path.index(a), expected_happy_path.index(b)
            assert can_transition(a, b) == (idx_b == idx_a + 1)


def test_terminal_states_have_no_exits():
    for state in TERMINAL_STATES:
        assert ALLOWED_TRANSITIONS[state] == frozenset()
        for target in OrderStatus:
            assert not can_transition(state, target)


def test_assert_transition_rejects_jumps():
    with pytest.raises(InvalidTransitionError):
        assert_transition(OrderStatus.PLACED, OrderStatus.READY_FOR_PICKUP)
    with pytest.raises(InvalidTransitionError):
        assert_transition(OrderStatus.COMPLETED, OrderStatus.CANCELLED)


async def test_completed_is_unreachable_through_lifecycle_service(client, db):
    order_id = (await place_order(client)).json()["data"]["id"]
    with pytest.raises(InvalidTransitionError):
        await OrderLifecycleService(db).transition(
            order_id, OrderStatus.COMPLETED, actor_uid="x", scope=OrderScope(store_id="store-a")
        )


# --------------------------------------------------------------------- money
def test_money_rejects_float_and_rounds_half_up():
    with pytest.raises(TypeError):
        to_money(1.1)
    assert to_money("2.005") == Decimal("2.01")
    assert to_money(3) == Decimal("3.00")
    assert round_to_rupee(Decimal("24.50")) == Decimal("25.00")
    assert sum_money([Decimal("0.10"), Decimal("0.20")]) == Decimal("0.30")  # no float drift


# --------------------------------------------------------------------- discount engine
async def test_discount_engine_default_numbers(settings):
    q = await ConfigDiscountEngine(settings).quote(store_id="store-a", subtotal=Decimal("100"))
    assert q.rider_cost_saved == Decimal("35.00")
    assert q.pickup_discount == Decimal("25.00")  # round(35 * 0.70 = 24.50) -> 25, cap 25
    assert q.quickpick_fee == Decimal("4.00")
    assert q.platform_net_saving == Decimal("6.00")  # 35 - 25 - 4


async def test_discount_never_exceeds_subtotal_or_cap(settings):
    engine = ConfigDiscountEngine(settings)
    assert (await engine.quote(store_id="s", subtotal=Decimal("10"))).pickup_discount == Decimal("10.00")
    capped = ConfigDiscountEngine(settings.model_copy(update={"max_pickup_discount": Decimal("20")}))
    assert (await capped.quote(store_id="s", subtotal=Decimal("500"))).pickup_discount == Decimal("20.00")


async def test_pricing_breakdown(settings):
    quote = await ConfigDiscountEngine(settings).quote(store_id="s", subtotal=Decimal("60"))
    p = build_pricing(Decimal("60"), quote)
    assert (p.subtotal, p.pickup_discount, p.total_amount, p.delivery_fee) == (
        Decimal("60.00"), Decimal("25.00"), Decimal("35.00"), Decimal("0.00"))
    assert p.pickup_fee == Decimal("4.00") and p.you_save == Decimal("25.00")


# --------------------------------------------------------------------- shared schema validation
def test_inventory_schema_rejects_negative_and_exposes_pickable():
    with pytest.raises(ValidationError):
        Inventory(store_id="s", product_id="p", available_quantity=-1, updated_at=utc_now())
    inv = Inventory(store_id="s", product_id="p", available_quantity=10, reserved_quantity=3, updated_at=utc_now())
    assert inv.pickable_quantity == 7


def test_geolocation_bounds_and_distance():
    with pytest.raises(ValidationError):
        GeoLocation(lat=91, lng=0)
    a, b = GeoLocation(lat=23.0258, lng=72.5873), GeoLocation(lat=23.0300, lng=72.4700)
    assert 11 < haversine_km(a, b) < 13
    assert haversine_km(a, a) == 0


def test_store_requires_valid_capacity():
    with pytest.raises(ValidationError):
        Store(id="s", name="n", address="a", location=GeoLocation(lat=0, lng=0), preparation_capacity=0,
              created_at=utc_now(), updated_at=utc_now())


async def test_monetary_values_are_json_strings_not_floats(client):
    r = await client.post("/api/v1/customer/checkout/preview", headers=auth("customer1"),
                          json={"store_id": "store-a", "items": [{"product_id": "milk", "quantity": 2}]})
    pricing = r.json()["data"]["pricing"]
    assert pricing["total_amount"] == "35.00" and isinstance(pricing["total_amount"], str)


async def test_validation_errors_use_envelope(client):
    r = await client.post("/api/v1/customer/checkout/preview", headers=auth("customer1"), json={"store_id": "x", "items": []})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
