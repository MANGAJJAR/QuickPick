"""Delivery option, rider-supply/weather signals and the "riders are busy, walk and save" discount."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from decimal import Decimal

from app.core.config import Settings
from app.modules.orders.expiry import ExpiryService
from app.modules.signals.service import OpenMeteoWeather, classify_weather, compute, in_rush_hour
from app.shared.enums import RiderSupply, Weather
from app.shared.models import utc_now
from tests.conftest import auth

API = "/api/v1"
NEAR = {"lat": 23.0270, "lng": 72.5880}  # about 150 m from store-a (23.0258, 72.5873)
FAR = {"lat": 23.1000, "lng": 72.7000}  # many km away
ADDRESS = {"line": "12 Green Park Society, Satellite, Ahmedabad", "instructions": "Ring the bell"}
ITEMS = [{"product_id": "milk", "quantity": 2}]  # Rs 60


async def set_signals(client, supply="NORMAL", weather=None, token="manager-a"):
    return await client.put(f"{API}/store/signals", headers=auth(token), json={"rider_supply": supply, "weather": weather})


async def preview(client, location=None, items=ITEMS):
    body = {"store_id": "store-a", "items": items}
    if location:
        body["location"] = location
    r = await client.post(f"{API}/customer/checkout/preview", headers=auth("customer1"), json=body)
    assert r.status_code == 200, r.text
    return r.json()["data"]


async def order(client, key, fulfilment="PICKUP", location=None, address=None, token="customer1", items=ITEMS):
    body = {"store_id": "store-a", "items": items, "fulfilment": fulfilment}
    if location:
        body["location"] = location
    if address:
        body["delivery_address"] = address
    return await client.post(f"{API}/customer/orders", headers={**auth(token), "Idempotency-Key": key}, json=body)


def stock(db, product="milk"):
    d = db.docs("inventory")[f"store-a__{product}"]
    return d["available_quantity"], d["reserved_quantity"]


# --------------------------------------------------------------------------- signals
def test_weather_codes_are_classified():
    assert classify_weather(0, 0) == Weather.CLEAR
    assert classify_weather(0, 61) == Weather.RAIN  # rain
    assert classify_weather(0, 81) == Weather.RAIN  # showers
    assert classify_weather(1.2, 3) == Weather.RAIN  # measurable rain right now
    assert classify_weather(0, 96) == Weather.STORM


def test_multiplier_adds_up_is_explained_and_capped():
    s = Settings(environment="test", weather_enabled=False)
    assert compute(s, RiderSupply.NORMAL, Weather.CLEAR, False) == (Decimal('1'), [])
    mult, reasons = compute(s, RiderSupply.LOW, Weather.RAIN, False)
    assert mult == Decimal('1.60') and len(reasons) == 2
    capped, _ = compute(s, RiderSupply.VERY_LOW, Weather.STORM, True)
    assert capped == s.max_surge_multiplier  # 1 + .6 + .5 + .25 = 2.35, capped at 1.8


def test_rush_hour_follows_the_local_clock():
    s = Settings(environment="test", rush_hours="19:30-21:30", local_utc_offset_minutes=330)
    at = lambda h, m: datetime(2026, 11, 20, h, m, tzinfo=timezone.utc)  # noqa: E731
    assert in_rush_hour(s, at(14, 30))  # 20:00 IST
    assert not in_rush_hour(s, at(12, 0))  # 17:30 IST
    assert not in_rush_hour(Settings(environment="test", rush_hours=""), at(14, 30))


async def test_a_weather_outage_never_breaks_pricing():
    provider = OpenMeteoWeather(timeout=0.2)
    provider.URL = "http://127.0.0.1:9/nothing"  # nothing listens here
    assert await provider.current(23.0, 72.5) == Weather.CLEAR


async def test_manager_controls_rider_supply_and_staff_cannot(client):
    assert (await set_signals(client, "LOW", token="staff-a")).status_code == 403
    r = await set_signals(client, "LOW")
    d = r.json()["data"]
    assert d["rider_supply"] == "LOW" and d["surge_active"] is True
    assert d["delivery_eta_minutes"] > 18  # slower when riders are scarce
    assert "simulated" in d["sources"]["rider_supply"]  # honest about where the number comes from
    mine = (await client.get(f"{API}/store/signals", headers=auth("staff-a"))).json()["data"]
    assert mine["rider_supply"] == "LOW"
    assert (await client.get(f"{API}/store/signals", headers=auth("staff-b"))).json()["data"]["rider_supply"] == "NORMAL"  # other store


# --------------------------------------------------------------------------- the walk offer
async def offer(client, location=None, store="store-a"):
    params = location or {}
    r = await client.get(f"{API}/customer/stores/{store}/offer", headers=auth("customer1"), params=params)
    assert r.status_code == 200, r.text
    return r.json()["data"]


async def test_no_surge_means_the_normal_discount_for_everyone(client):
    near = await offer(client, NEAR)
    assert near["surge_active"] is False and near["eligible"] is False and near["headline"] is None
    assert float(near["pickup_discount"]) == 25.0


async def test_riders_busy_and_near_means_walk_and_save_more(client):
    await set_signals(client, "VERY_LOW", "RAIN")
    near = await offer(client, NEAR)
    assert near["surge_active"] and near["eligible"]
    assert float(near["pickup_discount"]) == 40.0  # raised, up to the surge cap
    assert near["headline"] == f"Riders are busy. Walk {near['walk_minutes']} min and save ₹40"
    assert near["walk_minutes"] == 2 and near["distance_m"] < 300
    assert "Rain is slowing riders" in near["reasons"]


async def test_far_customers_and_unknown_locations_keep_the_normal_discount(client):
    await set_signals(client, "VERY_LOW", "RAIN")
    far = await offer(client, FAR)
    assert far["surge_active"] and far["eligible"] is False and far["headline"] is None
    assert float(far["pickup_discount"]) == 25.0
    nowhere = await offer(client)
    assert nowhere["eligible"] is False and nowhere["distance_m"] is None


async def test_the_discount_scales_with_how_busy_riders_are(client):
    await set_signals(client, "LOW")  # multiplier 1.3
    low = float((await offer(client, NEAR))["pickup_discount"])
    await set_signals(client, "VERY_LOW", "RAIN")
    high = float((await offer(client, NEAR))["pickup_discount"])
    assert 25 < low < high <= 40


async def test_offer_for_unknown_store_is_404(client):
    r = await client.get(f"{API}/customer/stores/nope/offer", headers=auth("customer1"))
    assert r.status_code == 404


# --------------------------------------------------------------------------- preview and checkout agree
async def test_preview_prices_both_ways(client):
    p = await preview(client)
    assert float(p["pricing"]["total_amount"]) == 35.0  # Rs 60 - Rs 25 pickup discount, no fees
    d = p["delivery"]
    assert (float(d["delivery_fee"]), float(d["handling_fee"]), float(d["night_fee"])) == (35.0, 9.0, 0.0)
    assert float(d["total_amount"]) == 104.0  # 60 + 35 delivery + 9 handling
    assert p["delivery_eta_minutes"] == 18
    big = await preview(client, items=[{"product_id": "milk", "quantity": 8}])  # Rs 240: delivery is never free by default
    assert float(big["delivery"]["delivery_fee"]) == 35.0


async def test_the_price_in_the_preview_is_the_price_on_the_order(client, db):
    await set_signals(client, "VERY_LOW", "RAIN")
    p = await preview(client, NEAR)
    assert float(p["pricing"]["pickup_discount"]) == 40.0 and p["offer"]["eligible"] is True
    r = await order(client, "key-walk01", location=NEAR)
    assert r.status_code == 201, r.text
    o = r.json()["data"]
    assert o["pickup_discount"] == p["pricing"]["pickup_discount"] and o["total_amount"] == p["pricing"]["total_amount"]
    assert o["surge_multiplier"] is not None and o["walk_distance_m"] is not None  # audit trail of why it was cheaper


async def test_an_order_from_far_away_gets_the_normal_discount_even_during_a_surge(client):
    await set_signals(client, "VERY_LOW", "RAIN")
    o = (await order(client, "key-far001", location=FAR)).json()["data"]
    assert float(o["pickup_discount"]) == 25.0 and o["surge_multiplier"] is None and o["walk_distance_m"] is None
    o2 = (await order(client, "key-noloc1")).json()["data"]  # no location at all
    assert float(o2["pickup_discount"]) == 25.0


async def test_the_surge_discount_never_exceeds_the_order_value(client):
    await set_signals(client, "VERY_LOW", "RAIN")
    o = (await order(client, "key-tiny01", location=NEAR, items=[{"product_id": "milk", "quantity": 1}])).json()["data"]  # Rs 30
    assert float(o["pickup_discount"]) == 30.0 and float(o["total_amount"]) == 0.0


# --------------------------------------------------------------------------- delivery orders
async def test_delivery_needs_an_address(client):
    r = await order(client, "key-noadr1", fulfilment="DELIVERY")
    assert r.status_code == 422
    short = await order(client, "key-short1", fulfilment="DELIVERY", address={"line": "x"})
    assert short.status_code == 422


async def test_a_delivery_order_is_priced_with_the_fee_and_an_eta_and_reserves_stock(client, db):
    r = await order(client, "key-deliv1", fulfilment="DELIVERY", address=ADDRESS)
    assert r.status_code == 201, r.text
    o = r.json()["data"]
    assert o["order_type"] == "DELIVERY" and o["delivery_address"]["line"].startswith("12 Green Park")
    assert (float(o["delivery_fee"]), float(o["handling_fee"]), float(o["night_fee"])) == (35.0, 9.0, 0.0)
    assert float(o["pickup_discount"]) == 0.0 and float(o["total_amount"]) == 104.0
    assert o["delivery_eta_minutes"] == 18 and o["surge_multiplier"] is None
    assert stock(db) == (10, 2)
    store_inbox = (await client.get(f"{API}/store/notifications", headers=auth("staff-a"))).json()["data"]
    assert "delivery order" in store_inbox[0]["title"]


async def test_delivery_eta_climbs_when_riders_are_scarce(client):
    await set_signals(client, "VERY_LOW", "STORM")
    o = (await order(client, "key-slow01", fulfilment="DELIVERY", address=ADDRESS)).json()["data"]
    assert o["delivery_eta_minutes"] >= 40


async def test_delivery_can_be_switched_off_per_store(client, db):
    store = db.docs("stores")["store-a"]
    db.put("stores", "store-a", {**store, "delivery_enabled": False})
    r = await order(client, "key-nodel1", fulfilment="DELIVERY", address=ADDRESS)
    assert r.status_code == 409 and r.json()["error"]["code"] == "delivery_unavailable"
    assert (await order(client, "key-stillp", fulfilment="PICKUP")).status_code == 201  # pickup unaffected


async def _delivery_to_ready(client, key="key-flow01"):
    oid = (await order(client, key, fulfilment="DELIVERY", address=ADDRESS)).json()["data"]["id"]
    for step in ("accept", "start-preparation", "ready"):
        assert (await client.post(f"{API}/store/orders/{oid}/{step}", headers=auth("staff-a"))).status_code == 200
    return oid


async def test_delivery_lifecycle_dispatch_then_deliver_deducts_stock_and_tells_the_customer(client, db):
    oid = await _delivery_to_ready(client)
    ready = (await client.get(f"{API}/customer/orders/{oid}", headers=auth("customer1"))).json()["data"]
    assert ready["expires_at"] is None  # a packed delivery waits for a rider, not for the customer

    assert (await client.post(f"{API}/store/orders/{oid}/deliver", headers=auth("staff-a"))).status_code == 409  # not dispatched yet
    r = await client.post(f"{API}/store/orders/{oid}/dispatch", headers=auth("staff-a"))
    assert r.status_code == 200 and r.json()["data"]["order_status"] == "OUT_FOR_DELIVERY" and r.json()["data"]["dispatched_at"]
    assert stock(db) == (10, 2)  # still reserved while on the road

    r = await client.post(f"{API}/store/orders/{oid}/deliver", headers=auth("staff-a"))
    assert r.status_code == 200 and r.json()["data"]["order_status"] == "DELIVERED" and r.json()["data"]["delivered_at"]
    assert stock(db) == (8, 0)  # units leave the shelf

    kinds = [n["kind"] for n in (await client.get(f"{API}/customer/notifications", headers=auth("customer1"))).json()["data"]]
    assert kinds[:3] == ["ORDER_DELIVERED", "ORDER_OUT_FOR_DELIVERY", "ORDER_READY"]
    assert (await client.post(f"{API}/store/orders/{oid}/deliver", headers=auth("staff-a"))).status_code == 409  # only once


async def test_dispatch_and_deliver_are_for_delivery_orders_of_your_own_store(client):
    pickup = (await order(client, "key-pick01")).json()["data"]["id"]
    for step in ("accept", "start-preparation", "ready"):
        await client.post(f"{API}/store/orders/{pickup}/{step}", headers=auth("staff-a"))
    assert (await client.post(f"{API}/store/orders/{pickup}/dispatch", headers=auth("staff-a"))).status_code == 409  # pickup order

    oid = await _delivery_to_ready(client, "key-flow02")
    assert (await client.post(f"{API}/store/orders/{oid}/dispatch", headers=auth("staff-b"))).status_code == 404  # other store
    assert (await client.post(f"{API}/store/orders/{oid}/dispatch", headers=auth("customer1"))).status_code == 403
    await client.post(f"{API}/store/orders/{oid}/dispatch", headers=auth("staff-a"))
    assert (await client.post(f"{API}/store/orders/{pickup}/deliver", headers=auth("staff-a"))).status_code == 409  # pickups finish at the counter


async def test_delivery_orders_have_no_pickup_code_arrival_or_counter_queue_entry(client):
    oid = await _delivery_to_ready(client, "key-flow03")
    r = await client.get(f"{API}/customer/orders/{oid}/pickup-credential", headers=auth("customer1"))
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_a_pickup_order"
    r = await client.post(f"{API}/customer/orders/{oid}/arrival", headers=auth("customer1"), json={"status": "ARRIVED"})
    assert r.status_code == 409
    queue = (await client.get(f"{API}/store/pickup/queue", headers=auth("staff-a"))).json()["data"]
    assert oid not in [e["order_id"] for e in queue]
    r = await client.post(f"{API}/store/pickup/verify-otp", headers=auth("staff-a"), json={"order_id": oid, "otp": "123456"})
    assert r.status_code >= 400


async def test_expiry_releases_unaccepted_deliveries_but_never_a_packed_one(client, db, settings):
    stale = (await order(client, "key-stale1", fulfilment="DELIVERY", address=ADDRESS)).json()["data"]["id"]
    packed = await _delivery_to_ready(client, "key-packd1")
    far = ExpiryService(db, settings, clock=lambda: utc_now() + timedelta(days=2))
    result = await far.sweep()
    assert result.expired == [stale]  # the store never accepted it
    status = (await client.get(f"{API}/customer/orders/{packed}", headers=auth("customer1"))).json()["data"]["order_status"]
    assert status == "READY_FOR_PICKUP"


async def test_a_customer_can_still_cancel_an_accepted_delivery(client, db):
    oid = (await order(client, "key-cancl1", fulfilment="DELIVERY", address=ADDRESS)).json()["data"]["id"]
    await client.post(f"{API}/store/orders/{oid}/accept", headers=auth("staff-a"))
    r = await client.post(f"{API}/customer/orders/{oid}/cancel", headers=auth("customer1"))
    assert r.status_code == 200 and stock(db) == (10, 0)
