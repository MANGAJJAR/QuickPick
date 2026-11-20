"""Delivery charges (delivery, handling, late-night) and what a pickup order is spared."""

from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest

from app.core.config import Settings
from app.main import create_app
from app.modules.signals.service import in_window, is_night
from tests.conftest import FakeVerifier, auth

API = "/api/v1"
ITEMS = [{"product_id": "milk", "quantity": 2}]  # Rs 60
ADDRESS = {"line": "12 Green Park Society, Satellite, Ahmedabad"}
NEAR = {"lat": 23.0270, "lng": 72.5880}


@pytest.fixture
def make_client(db, settings):
    """Build a client for an app with some settings overridden (e.g. night hours on)."""

    def factory(**over) -> httpx.AsyncClient:
        app = create_app(settings=settings.model_copy(update=over), db=db, token_verifier=FakeVerifier())
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    return factory


async def preview(c, location=None):
    body = {"store_id": "store-a", "items": ITEMS, **({"location": location} if location else {})}
    r = await c.post(f"{API}/customer/checkout/preview", headers=auth("customer1"), json=body)
    assert r.status_code == 200, r.text
    return r.json()["data"]


async def order(c, key, fulfilment="PICKUP", location=None):
    body = {"store_id": "store-a", "items": ITEMS, "fulfilment": fulfilment}
    if fulfilment == "DELIVERY":
        body["delivery_address"] = ADDRESS
    if location:
        body["location"] = location
    return await c.post(f"{API}/customer/orders", headers={**auth("customer1"), "Idempotency-Key": key}, json=body)


def f(x):
    return float(x)


# --------------------------------------------------------------------------- the clock
def test_night_window_crosses_midnight():
    at = lambda h, m: datetime(2026, 11, 20, h, m, tzinfo=timezone.utc)  # noqa: E731
    # 23:00-06:00 IST (UTC+5:30)
    assert in_window("23:00-06:00", 330, at(17, 30))  # 23:00 IST: starts
    assert in_window("23:00-06:00", 330, at(20, 0))  # 01:30 IST
    assert in_window("23:00-06:00", 330, at(0, 29))  # 05:59 IST
    assert not in_window("23:00-06:00", 330, at(0, 30))  # 06:00 IST: over
    assert not in_window("23:00-06:00", 330, at(10, 0))  # 15:30 IST
    assert not in_window("", 330, at(20, 0))
    assert is_night(Settings(environment="test", night_hours="00:00-24:00"), at(10, 0))


# --------------------------------------------------------------------------- daytime bills
async def test_delivery_pays_delivery_and_handling_fees(client):
    d = (await preview(client))["delivery"]
    assert (f(d["delivery_fee"]), f(d["handling_fee"]), f(d["night_fee"])) == (35.0, 9.0, 0.0)
    assert f(d["total_amount"]) == 60 + 35 + 9


async def test_pickup_pays_none_of_them_and_the_spared_charges_count_as_savings(client):
    p = (await preview(client))["pricing"]
    assert (f(p["delivery_fee"]), f(p["handling_fee"]), f(p["night_fee"])) == (0.0, 0.0, 0.0)
    assert (f(p["waived_delivery_fee"]), f(p["waived_handling_fee"]), f(p["waived_night_fee"])) == (35.0, 9.0, 0.0)
    assert f(p["total_amount"]) == 60 - 25
    assert f(p["you_save"]) == 25 + 35 + 9  # discount + delivery fee + handling fee


async def test_the_message_states_the_whole_saving(client):
    assert (await preview(client))["message"] == "You save ₹69 vs delivery"


# --------------------------------------------------------------------------- late night
async def test_late_night_adds_a_fee_to_delivery_and_pickup_is_spared_it(make_client):
    c = make_client(night_hours="00:00-24:00")
    p = await preview(c)
    d = p["delivery"]
    assert f(d["night_fee"]) == 30.0 and f(d["total_amount"]) == 60 + 35 + 9 + 30
    pk = p["pricing"]
    assert f(pk["night_fee"]) == 0.0 and f(pk["waived_night_fee"]) == 30.0
    assert f(pk["you_save"]) == 25 + 35 + 9 + 30
    assert p["message"] == "You save ₹99 vs delivery"


async def test_a_delivery_order_records_and_charges_every_fee(make_client, db):
    c = make_client(night_hours="00:00-24:00")
    o = (await order(c, "key-fees01", "DELIVERY")).json()["data"]
    assert (f(o["delivery_fee"]), f(o["handling_fee"]), f(o["night_fee"])) == (35.0, 9.0, 30.0)
    assert f(o["total_amount"]) == 60 + 35 + 9 + 30
    stored = db.docs("orders")[o["id"]]
    assert stored["handling_fee"] == "9.00" and stored["night_fee"] == "30.00"


async def test_a_pickup_order_never_pays_a_fee_even_at_night(make_client):
    c = make_client(night_hours="00:00-24:00")
    o = (await order(c, "key-fees02")).json()["data"]
    assert (f(o["delivery_fee"]), f(o["handling_fee"]), f(o["night_fee"])) == (0.0, 0.0, 0.0)
    assert f(o["total_amount"]) == 35.0


async def test_the_preview_total_is_the_order_total_for_both_ways_at_night(make_client):
    c = make_client(night_hours="00:00-24:00")
    p = await preview(c)
    pickup = (await order(c, "key-fees03")).json()["data"]
    delivery = (await order(c, "key-fees04", "DELIVERY")).json()["data"]
    assert pickup["total_amount"] == p["pricing"]["total_amount"]
    assert delivery["total_amount"] == p["delivery"]["total_amount"]


# --------------------------------------------------------------------------- with the walk-in discount and a free-delivery rule
async def test_the_walk_in_discount_and_the_spared_fees_add_up(make_client):
    c = make_client()
    await c.put(f"{API}/store/signals", headers=auth("manager-a"), json={"rider_supply": "VERY_LOW", "weather": "RAIN"})
    p = (await preview(c, NEAR))["pricing"]
    assert f(p["pickup_discount"]) == 40.0
    assert f(p["you_save"]) == 40 + 35 + 9


async def test_an_operator_can_make_delivery_free_above_an_amount(make_client):
    c = make_client(free_delivery_above=50)
    p = await preview(c)
    assert f(p["delivery"]["delivery_fee"]) == 0.0
    assert f(p["pricing"]["waived_delivery_fee"]) == 0.0  # nothing to be spared: it would have been free anyway
    assert f(p["pricing"]["you_save"]) == 25 + 9
