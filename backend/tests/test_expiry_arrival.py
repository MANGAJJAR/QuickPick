"""Auto-expiry of uncollected orders, notifications, "I'm arriving" and push delivery."""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.core.config import Settings
from app.modules.orders.expiry import ExpiryService
from app.shared.models import utc_now
from tests.conftest import advance_to_ready, auth, place_order

API = "/api/v1"


def _stock(db, store="store-a", product="milk"):
    d = db.docs("inventory")[f"{store}__{product}"]
    return d["available_quantity"], d["reserved_quantity"]


def _sweeper(db, settings: Settings, minutes_from_now: int, push=None) -> ExpiryService:
    return ExpiryService(db, settings, clock=lambda: utc_now() + timedelta(minutes=minutes_from_now), push=push)


async def _order(client, key="key-0001", token="customer1"):
    r = await place_order(client, token=token, key=key)
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


async def _accept(client, order_id, staff="staff-a"):
    r = await client.post(f"{API}/store/orders/{order_id}/accept", headers=auth(staff))
    assert r.status_code == 200, r.text


def _notes(db, **match):
    return [n for n in db.docs("notifications").values() if all(n.get(k) == v for k, v in match.items())]


# --------------------------------------------------------------------------- expiry deadlines
async def test_deadlines_follow_the_order_through_its_lifecycle(client, settings):
    oid = await _order(client)
    placed = (await client.get(f"{API}/customer/orders/{oid}", headers=auth("customer1"))).json()["data"]
    assert placed["expires_at"] is not None  # the store must accept before this

    await _accept(client, oid)
    accepted = (await client.get(f"{API}/customer/orders/{oid}", headers=auth("customer1"))).json()["data"]
    assert accepted["expires_at"] is None  # being worked on: no auto-expiry

    for step in ("start-preparation", "ready"):
        await client.post(f"{API}/store/orders/{oid}/{step}", headers=auth("staff-a"))
    ready = (await client.get(f"{API}/customer/orders/{oid}", headers=auth("customer1"))).json()["data"]
    assert ready["expires_at"] is not None  # the customer must collect before this


# --------------------------------------------------------------------------- the sweep
async def test_unaccepted_order_expires_releases_stock_and_notifies_both_sides(client, db, settings):
    oid = await _order(client)
    assert _stock(db) == (10, 2)

    assert (await _sweeper(db, settings, settings.placed_expiry_minutes - 1).sweep()).expired == []  # too early
    result = await _sweeper(db, settings, settings.placed_expiry_minutes + 1).sweep()
    assert result.expired == [oid]

    order = (await client.get(f"{API}/customer/orders/{oid}", headers=auth("customer1"))).json()["data"]
    assert order["order_status"] == "EXPIRED" and order["expires_at"] is None
    assert _stock(db) == (10, 0)  # reservation released
    mine = _notes(db, user_id="cust-1", kind="ORDER_EXPIRED")
    assert len(mine) == 1 and "did not accept" in mine[0]["body"]
    assert len(_notes(db, store_id="store-a", kind="ORDER_EXPIRED")) == 1


async def test_ready_order_expires_after_the_collection_window_and_its_code_stops_working(client, db, settings):
    oid = await _order(client)
    await _accept(client, oid)
    await advance_to_ready_from_accepted(client, oid)
    cred = (await client.get(f"{API}/customer/orders/{oid}/pickup-credential", headers=auth("customer1"))).json()["data"]

    assert (await _sweeper(db, settings, settings.ready_expiry_minutes - 1).sweep()).expired == []
    assert (await _sweeper(db, settings, settings.ready_expiry_minutes + 1).sweep()).expired == [oid]
    assert _stock(db) == (10, 0)
    assert "not collected" in _notes(db, user_id="cust-1", kind="ORDER_EXPIRED")[0]["body"]

    r = await client.post(f"{API}/store/pickup/verify-otp", headers=auth("staff-a"), json={"order_id": oid, "otp": cred["otp"]})
    assert r.status_code >= 400  # an expired order can never be handed over


async def advance_to_ready_from_accepted(client, oid):
    for step in ("start-preparation", "ready"):
        r = await client.post(f"{API}/store/orders/{oid}/{step}", headers=auth("staff-a"))
        assert r.status_code == 200, r.text


async def test_orders_being_prepared_are_never_auto_expired_and_sweeps_are_idempotent(client, db, settings):
    accepted = await _order(client, key="key-acc1")
    await _accept(client, accepted)
    preparing = await _order(client, key="key-prep")
    await _accept(client, preparing)
    await client.post(f"{API}/store/orders/{preparing}/start-preparation", headers=auth("staff-a"))
    stale = await _order(client, key="key-old1")

    far = _sweeper(db, settings, 24 * 60)
    assert (await far.sweep()).expired == [stale]
    assert (await far.sweep()).expired == []  # nothing left to do
    statuses = {o: (await client.get(f"{API}/customer/orders/{o}", headers=auth("customer1"))).json()["data"]["order_status"]
                for o in (accepted, preparing, stale)}
    assert statuses == {accepted: "ACCEPTED", preparing: "PREPARING", stale: "EXPIRED"}


async def test_setting_a_window_to_zero_disables_that_rule(client, db, settings):
    await _order(client)
    off = settings.model_copy(update={"placed_expiry_minutes": 0})
    assert (await _sweeper(db, off, 24 * 60).sweep()).expired == []


# --------------------------------------------------------------------------- scheduler endpoint
async def test_job_endpoint_needs_the_secret(client, db, settings):
    oid = await _order(client)
    # make it overdue by back-dating the order
    doc = db.docs("orders")[oid]
    db.put("orders", oid, {**doc, "created_at": utc_now() - timedelta(minutes=settings.placed_expiry_minutes + 5)})

    url = f"{API}/internal/jobs/expire-orders"
    assert (await client.post(url)).status_code == 403
    assert (await client.post(url, headers={"X-Job-Secret": "wrong"})).status_code == 403
    assert (await client.post(url, headers=auth("admin"))).status_code == 403  # a normal login is not enough
    r = await client.post(url, headers={"X-Job-Secret": "job-secret"})
    assert r.status_code == 200 and r.json()["data"]["expired"] == [oid]


async def test_job_endpoint_is_disabled_when_no_secret_is_configured(db):
    import httpx

    from app.main import create_app
    from tests.conftest import FakeVerifier

    app = create_app(settings=Settings(environment="test", expiry_sweep_interval_seconds=0), db=db, token_verifier=FakeVerifier())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post(f"{API}/internal/jobs/expire-orders", headers={"X-Job-Secret": ""})
        assert r.status_code == 403 and r.json()["error"]["code"] == "jobs_disabled"


# --------------------------------------------------------------------------- notifications
async def test_customer_and_store_notification_inboxes(client, db):
    oid = await _order(client)
    store_inbox = (await client.get(f"{API}/store/notifications", headers=auth("staff-a"))).json()["data"]
    assert [n["kind"] for n in store_inbox] == ["ORDER_PLACED"] and store_inbox[0]["order_id"] == oid
    assert (await client.get(f"{API}/store/notifications", headers=auth("staff-b"))).json()["data"] == []  # other store

    await _accept(client, oid)
    await advance_to_ready_from_accepted(client, oid)
    inbox = (await client.get(f"{API}/customer/notifications", headers=auth("customer1"))).json()["data"]
    assert [n["kind"] for n in inbox] == ["ORDER_READY", "ORDER_ACCEPTED"]  # newest first
    assert inbox[0]["read"] is False and "ready" in inbox[0]["title"].lower()
    assert (await client.get(f"{API}/customer/notifications", headers=auth("customer2"))).json()["data"] == []

    nid = inbox[0]["id"]
    assert (await client.patch(f"{API}/customer/notifications/{nid}/read", headers=auth("customer2"))).status_code == 404
    assert (await client.patch(f"{API}/customer/notifications/{nid}/read", headers=auth("customer1"))).json()["data"]["read"] is True
    assert db.docs("notifications")[nid]["read"] is True


async def test_customer_cancel_tells_the_store_but_a_store_reject_tells_the_customer(client, db):
    a = await _order(client, key="key-canc")
    await client.post(f"{API}/customer/orders/{a}/cancel", headers=auth("customer1"))
    assert len(_notes(db, store_id="store-a", kind="ORDER_CANCELLED")) == 1
    assert _notes(db, user_id="cust-1", kind="ORDER_CANCELLED") == []

    b = await _order(client, key="key-rejt")
    await client.post(f"{API}/store/orders/{b}/reject", headers=auth("staff-a"), json={"reason": "Out of ice"})
    assert _notes(db, user_id="cust-1", kind="ORDER_CANCELLED")[0]["body"] == "Out of ice"


# --------------------------------------------------------------------------- "I'm arriving"
async def _arrival(client, oid, body, token="customer1"):
    return await client.post(f"{API}/customer/orders/{oid}/arrival", headers=auth(token), json=body)


async def test_customer_shares_arrival_and_the_store_sees_it_everywhere(client, db):
    oid = await _order(client)
    assert (await _arrival(client, oid, {"status": "ON_THE_WAY", "eta_minutes": 5})).status_code == 409  # not accepted yet
    await _accept(client, oid)

    r = await _arrival(client, oid, {"status": "ON_THE_WAY", "eta_minutes": 5})
    assert r.status_code == 200
    data = r.json()["data"]
    assert (data["arrival_status"], data["arrival_eta_minutes"]) == ("ON_THE_WAY", 5)

    note = _notes(db, store_id="store-a", kind="CUSTOMER_ARRIVING")
    assert len(note) == 1 and "5 min away" in note[0]["title"]
    queue = (await client.get(f"{API}/store/pickup/queue", headers=auth("staff-a"))).json()["data"]
    assert (queue[0]["arrival_status"], queue[0]["arrival_eta_minutes"]) == ("ON_THE_WAY", 5)
    board = (await client.get(f"{API}/store/orders/{oid}", headers=auth("staff-a"))).json()["data"]
    assert board["arrival_status"] == "ON_THE_WAY"

    # repeating the same signal is a no-op: no duplicate notification
    await _arrival(client, oid, {"status": "ON_THE_WAY", "eta_minutes": 5})
    assert len(_notes(db, store_id="store-a", kind="CUSTOMER_ARRIVING")) == 1
    # a changed ETA is news
    await _arrival(client, oid, {"status": "ON_THE_WAY", "eta_minutes": 2})
    assert len(_notes(db, store_id="store-a", kind="CUSTOMER_ARRIVING")) == 2

    r = await _arrival(client, oid, {"status": "ARRIVED"})
    assert r.json()["data"]["arrival_eta_minutes"] is None
    assert len(_notes(db, store_id="store-a", kind="CUSTOMER_ARRIVED")) == 1


async def test_arrival_validation_ownership_and_clearing(client, db):
    oid = await _order(client)
    await _accept(client, oid)
    assert (await _arrival(client, oid, {"status": "ON_THE_WAY"})).status_code == 422  # eta required
    assert (await _arrival(client, oid, {"status": "ON_THE_WAY", "eta_minutes": 0})).status_code == 422
    assert (await _arrival(client, oid, {"status": "ON_THE_WAY", "eta_minutes": 500})).status_code == 422
    assert (await _arrival(client, oid, {"status": "TELEPORTED"})).status_code == 422
    assert (await _arrival(client, oid, {"status": "ARRIVED"}, token="customer2")).status_code == 404  # not their order
    assert (await _arrival(client, oid, {"status": "ARRIVED"}, token="staff-a")).status_code == 403  # customers only

    await _arrival(client, oid, {"status": "ON_THE_WAY", "eta_minutes": 7})
    r = await client.delete(f"{API}/customer/orders/{oid}/arrival", headers=auth("customer1"))
    assert r.status_code == 200 and r.json()["data"]["arrival_status"] is None


async def test_arrival_is_cleared_once_the_order_is_collected(client, db):
    oid = await _order(client)
    await _accept(client, oid)
    await advance_to_ready_from_accepted(client, oid)
    await _arrival(client, oid, {"status": "ARRIVED"})
    cred = (await client.get(f"{API}/customer/orders/{oid}/pickup-credential", headers=auth("customer1"))).json()["data"]
    r = await client.post(f"{API}/store/pickup/verify-otp", headers=auth("staff-a"), json={"order_id": oid, "otp": cred["otp"]})
    assert r.status_code == 200, r.text
    done = (await client.get(f"{API}/customer/orders/{oid}", headers=auth("customer1"))).json()["data"]
    assert done["order_status"] == "COMPLETED" and done["arrival_status"] is None and done["expires_at"] is None
    assert (await _arrival(client, oid, {"status": "ARRIVED"})).status_code == 409  # too late to announce


# --------------------------------------------------------------------------- push
class Recorder:
    def __init__(self, fail: bool = False) -> None:
        self.sent: list[tuple[list[str], str, dict]] = []
        self.fail = fail

    async def send(self, tokens, title, body, data):
        if self.fail:
            raise RuntimeError("fcm down")
        self.sent.append((tokens, title, data))


TOKEN = "t" * 40


async def test_order_ready_reaches_the_customers_registered_phone(app, client):
    rec = app.state.push_sender = Recorder()
    r = await client.post(f"{API}/customer/devices", headers=auth("customer1"), json={"token": TOKEN})
    assert r.status_code == 201
    await client.post(f"{API}/store/devices", headers=auth("staff-a"), json={"token": "s" * 40})

    oid = await _order(client)
    assert [t for tokens, t, _ in rec.sent] == ["New pickup order #" + oid[:8].upper()]  # the store's phone, not the customer's
    assert rec.sent[0][0] == ["s" * 40]

    await _accept(client, oid)
    await advance_to_ready_from_accepted(client, oid)
    to_customer = [(tokens, title) for tokens, title, _ in rec.sent if tokens == [TOKEN]]
    assert [t for _, t in to_customer] == ["Order accepted", "Your order is ready for pickup"]

    await _arrival(client, oid, {"status": "ARRIVED"})
    assert rec.sent[-1][0] == ["s" * 40] and rec.sent[-1][2]["kind"] == "CUSTOMER_ARRIVED"


async def test_a_push_failure_never_breaks_the_order_flow(app, client):
    app.state.push_sender = Recorder(fail=True)
    await client.post(f"{API}/customer/devices", headers=auth("customer1"), json={"token": TOKEN})
    oid = await _order(client)
    await _accept(client, oid)
    order = (await client.get(f"{API}/customer/orders/{oid}", headers=auth("customer1"))).json()["data"]
    assert order["order_status"] == "ACCEPTED"


async def test_device_registration_validates_and_requires_the_right_role(client):
    assert (await client.post(f"{API}/customer/devices", headers=auth("customer1"), json={"token": "short"})).status_code == 422
    assert (await client.post(f"{API}/customer/devices", headers=auth("staff-a"), json={"token": TOKEN})).status_code == 403
    assert (await client.post(f"{API}/store/devices", headers=auth("customer1"), json={"token": TOKEN})).status_code == 403
