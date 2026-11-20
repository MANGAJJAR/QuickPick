"""Developer 2 (dark-store module) tests, including pickup verification security."""

from __future__ import annotations

import asyncio
from datetime import timedelta
from decimal import Decimal

import pytest

from app.core.exceptions import ConflictError, CredentialExpiredError, InvalidCredentialError
from app.core.security import AuthUser
from app.modules.analytics.store_service import compute_overview
from app.modules.pickup.crypto import generate_token, hash_otp, parse_token
from app.modules.pickup.service import PickupService
from app.shared.enums import Role
from app.shared.models import Order, utc_now
from tests.conftest import advance_to_ready, auth, place_order

STAFF_A = AuthUser(uid="staff-a", role=Role.STORE_STAFF, store_id="store-a")
STAFF_B = AuthUser(uid="staff-b", role=Role.STORE_STAFF, store_id="store-b")


def stock(db, store="store-a", product="milk"):
    return db.docs("inventory")[f"{store}__{product}"]


async def ready_order(client, key="key-0001", items=None) -> str:
    order_id = (await place_order(client, key=key, items=items)).json()["data"]["id"]
    await advance_to_ready(client, order_id)
    return order_id


async def credential(client, order_id: str, token: str = "customer1") -> dict:
    r = await client.get(f"/api/v1/customer/orders/{order_id}/pickup-credential", headers=auth(token))
    assert r.status_code == 200, r.text
    return r.json()["data"]


# --------------------------------------------------------------------- store-level authorization
async def test_cross_store_order_access_prevented(client):
    order_id = (await place_order(client)).json()["data"]["id"]
    assert (await client.get(f"/api/v1/store/orders/{order_id}", headers=auth("staff-a"))).status_code == 200
    assert (await client.get(f"/api/v1/store/orders/{order_id}", headers=auth("staff-b"))).status_code == 404
    for step in ("accept", "reject", "start-preparation", "ready"):
        r = await client.post(f"/api/v1/store/orders/{order_id}/{step}", headers=auth("staff-b"))
        assert r.status_code == 404, step
    assert (await client.get("/api/v1/store/orders", headers=auth("staff-b"))).json()["data"] == []


async def test_store_me_is_scoped_to_token_store(client):
    a = await client.get("/api/v1/store/me", headers=auth("staff-a"))
    b = await client.get("/api/v1/store/me", headers=auth("staff-b"))
    assert a.json()["data"]["id"] == "store-a" and b.json()["data"]["id"] == "store-b"


async def test_store_status_and_pickup_settings(client):
    r = await client.patch("/api/v1/store/me/status", headers=auth("staff-a"), json={"operating_status": "PAUSED"})
    assert r.json()["data"]["operating_status"] == "PAUSED"
    blocked = await place_order(client)
    assert blocked.status_code == 409
    bad = await client.patch("/api/v1/store/me/pickup-settings", headers=auth("manager-a"), json={"preparation_capacity": 0})
    assert bad.status_code == 422
    ok = await client.patch("/api/v1/store/me/pickup-settings", headers=auth("manager-a"), json={"preparation_capacity": 25})
    assert ok.json()["data"]["preparation_capacity"] == 25
    assert (await client.patch("/api/v1/store/me/pickup-settings", headers=auth("staff-a"), json={"pickup_enabled": False})).status_code == 403


# --------------------------------------------------------------------- inventory management
async def test_inventory_listing_shows_reserved_and_pickable(client):
    await place_order(client)
    rows = (await client.get("/api/v1/store/inventory", headers=auth("staff-a"))).json()["data"]
    milk = next(r for r in rows if r["product_id"] == "milk")
    assert (milk["available_quantity"], milk["reserved_quantity"], milk["pickable_quantity"]) == (10, 2, 8)
    assert all(r["store_id"] == "store-a" for r in rows)


async def test_inventory_create_and_conflicts(client):
    created = await client.post("/api/v1/store/inventory", headers=auth("staff-b"), json={"product_id": "bread", "available_quantity": 12})
    assert created.status_code == 201 and created.json()["data"]["store_id"] == "store-b"
    dup = await client.post("/api/v1/store/inventory", headers=auth("staff-b"), json={"product_id": "bread", "available_quantity": 1})
    assert dup.status_code == 409
    ghost = await client.post("/api/v1/store/inventory", headers=auth("staff-b"), json={"product_id": "ghost", "available_quantity": 1})
    assert ghost.status_code == 404


async def test_inventory_update_and_negative_prevention(client):
    ok = await client.patch("/api/v1/store/inventory/milk", headers=auth("staff-a"), json={"available_quantity": 25})
    assert ok.json()["data"]["available_quantity"] == 25
    neg = await client.patch("/api/v1/store/inventory/milk", headers=auth("staff-a"), json={"available_quantity": -1})
    assert neg.status_code == 422
    create_neg = await client.post("/api/v1/store/inventory", headers=auth("staff-a"), json={"product_id": "eggs", "available_quantity": -5})
    assert create_neg.status_code == 422
    assert (await client.patch("/api/v1/store/inventory/ghost", headers=auth("staff-a"), json={"available_quantity": 1})).status_code == 404


async def test_cannot_set_stock_below_reserved(client, db):
    await place_order(client, items=[{"product_id": "milk", "quantity": 4}])
    r = await client.patch("/api/v1/store/inventory/milk", headers=auth("staff-a"), json={"available_quantity": 3})
    assert r.status_code == 409 and r.json()["error"]["code"] == "below_reserved_quantity"
    assert stock(db)["available_quantity"] == 10
    assert (await client.patch("/api/v1/store/inventory/milk", headers=auth("staff-a"), json={"available_quantity": 4})).status_code == 200


async def test_staff_cannot_touch_other_stores_inventory(client, db):
    # staff-b updating "milk" edits store-b's own row, never store-a's
    await client.patch("/api/v1/store/inventory/milk", headers=auth("staff-b"), json={"available_quantity": 99})
    assert stock(db, "store-b")["available_quantity"] == 99 and stock(db, "store-a")["available_quantity"] == 10
    # bread does not exist at store-b, so it cannot be updated there even though store-a has it
    assert (await client.patch("/api/v1/store/inventory/bread", headers=auth("staff-b"), json={"available_quantity": 1})).status_code == 404


async def test_inventory_delete_rules(client, db):
    assert (await client.delete("/api/v1/store/inventory/eggs", headers=auth("staff-a"))).status_code == 403  # manager only
    await place_order(client, items=[{"product_id": "milk", "quantity": 1}])
    blocked = await client.delete("/api/v1/store/inventory/milk", headers=auth("manager-a"))
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "stock_reserved"
    assert (await client.delete("/api/v1/store/inventory/eggs", headers=auth("manager-a"))).status_code == 200
    assert "store-a__eggs" not in db.docs("inventory")


async def test_low_stock_uses_pickable_quantity(client):
    r = await client.get("/api/v1/store/inventory/low-stock", headers=auth("staff-a"))
    assert [row["product_id"] for row in r.json()["data"]] == ["bread"]  # 5 <= threshold 5
    await place_order(client, items=[{"product_id": "milk", "quantity": 6}])  # pickable 10-6 = 4
    r2 = await client.get("/api/v1/store/inventory/low-stock", headers=auth("staff-a"))
    assert [row["product_id"] for row in r2.json()["data"]] == ["milk", "bread"]
    r3 = await client.get("/api/v1/store/inventory/low-stock", headers=auth("staff-a"), params={"threshold": 0})
    assert r3.json()["data"] == []


# --------------------------------------------------------------------- order workflow
async def test_full_workflow_with_timestamps(client):
    order_id = (await place_order(client)).json()["data"]["id"]
    r = await client.post(f"/api/v1/store/orders/{order_id}/accept", headers=auth("staff-a"))
    assert r.json()["data"]["order_status"] == "ACCEPTED" and r.json()["data"]["accepted_at"]
    r = await client.post(f"/api/v1/store/orders/{order_id}/start-preparation", headers=auth("staff-a"))
    assert r.json()["data"]["order_status"] == "PREPARING"
    r = await client.post(f"/api/v1/store/orders/{order_id}/ready", headers=auth("staff-a"))
    data = r.json()["data"]
    assert data["order_status"] == "READY_FOR_PICKUP" and data["ready_at"]
    assert [e["status"] for e in data["status_history"]] == ["CREATED", "PLACED", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP"]
    assert data["status_history"][2]["actor_uid"] == "staff-a"


@pytest.mark.parametrize(
    "steps,bad_step",
    [([], "start-preparation"), ([], "ready"), (["accept"], "ready"), (["accept"], "accept"),
     (["accept", "start-preparation"], "accept"), (["accept", "start-preparation"], "reject")],
)
async def test_invalid_transitions_rejected(client, steps, bad_step):
    order_id = (await place_order(client)).json()["data"]["id"]
    for step in steps:
        assert (await client.post(f"/api/v1/store/orders/{order_id}/{step}", headers=auth("staff-a"))).status_code == 200
    r = await client.post(f"/api/v1/store/orders/{order_id}/{bad_step}", headers=auth("staff-a"))
    assert r.status_code == 409 and r.json()["error"]["code"] == "invalid_status_transition"


async def test_reject_releases_stock_and_is_terminal(client, db):
    order_id = (await place_order(client)).json()["data"]["id"]
    r = await client.post(f"/api/v1/store/orders/{order_id}/reject", headers=auth("staff-a"), json={"reason": "out of ice"})
    assert r.json()["data"]["order_status"] == "CANCELLED" and r.json()["data"]["cancel_reason"] == "out of ice"
    assert stock(db)["reserved_quantity"] == 0
    assert (await client.post(f"/api/v1/store/orders/{order_id}/accept", headers=auth("staff-a"))).status_code == 409


async def test_order_listing_status_filter_and_queue(client):
    a = (await place_order(client, key="queue-key-1")).json()["data"]["id"]
    b = (await place_order(client, key="queue-key-2")).json()["data"]["id"]
    await client.post(f"/api/v1/store/orders/{a}/accept", headers=auth("staff-a"))
    placed = await client.get("/api/v1/store/orders", headers=auth("staff-a"), params={"status": "PLACED"})
    assert [o["id"] for o in placed.json()["data"]] == [b]
    queue = (await client.get("/api/v1/store/pickup/queue", headers=auth("staff-a"))).json()["data"]
    assert [q["order_id"] for q in queue] == [a, b]  # oldest first
    assert queue[0]["order_status"] == "ACCEPTED" and queue[0]["preparation_elapsed_seconds"] is not None
    assert queue[1]["preparation_elapsed_seconds"] is None
    assert (await client.get("/api/v1/store/pickup/queue", headers=auth("staff-b"))).json()["data"] == []


# --------------------------------------------------------------------- pickup verification: happy path
async def test_qr_verification_completes_order_and_confirms_inventory(client, db):
    order_id = await ready_order(client)
    cred = await credential(client, order_id)
    r = await client.post("/api/v1/store/pickup/verify-qr", headers=auth("staff-a"), json={"qr_payload": cred["qr_payload"]})
    assert r.status_code == 200 and r.json()["data"]["order_status"] == "COMPLETED"
    inv = stock(db)
    assert (inv["available_quantity"], inv["reserved_quantity"]) == (8, 0)  # reserved -> deducted
    ver = db.docs("pickup_verifications")[order_id]
    assert ver["consumed_at"] is not None and ver["consumed_by"] == "staff-a" and ver["method"] == "QR"
    audit = list(db.docs(f"pickup_verifications/{order_id}/audit").values())
    assert [a["event"] for a in audit] == ["VERIFIED"] and audit[0]["staff_uid"] == "staff-a"


async def test_otp_verification_completes_order(client, db):
    order_id = await ready_order(client)
    cred = await credential(client, order_id)
    r = await client.post("/api/v1/store/pickup/verify-otp", headers=auth("staff-a"), json={"order_id": order_id, "otp": cred["otp"]})
    assert r.status_code == 200 and r.json()["data"]["order_status"] == "COMPLETED"
    assert stock(db)["available_quantity"] == 8 and db.docs("pickup_verifications")[order_id]["method"] == "OTP"


# --------------------------------------------------------------------- pickup verification: attacks
async def test_replay_and_double_redemption_rejected(client, db):
    order_id = await ready_order(client)
    cred = await credential(client, order_id)
    body = {"qr_payload": cred["qr_payload"]}
    assert (await client.post("/api/v1/store/pickup/verify-qr", headers=auth("staff-a"), json=body)).status_code == 200
    replay = await client.post("/api/v1/store/pickup/verify-qr", headers=auth("staff-a"), json=body)
    assert replay.status_code == 409 and replay.json()["error"]["code"] == "credential_already_used"
    otp = await client.post("/api/v1/store/pickup/verify-otp", headers=auth("staff-a"), json={"order_id": order_id, "otp": cred["otp"]})
    assert otp.status_code == 409  # the OTP of a consumed credential is dead too
    assert stock(db)["available_quantity"] == 8  # deducted exactly once
    events = [a["event"] for a in db.docs(f"pickup_verifications/{order_id}/audit").values()]
    assert events.count("VERIFIED") == 1 and events.count("REJECTED") == 2


async def test_cross_store_verification_rejected(client, db):
    order_id = await ready_order(client)
    cred = await credential(client, order_id)
    qr = await client.post("/api/v1/store/pickup/verify-qr", headers=auth("staff-b"), json={"qr_payload": cred["qr_payload"]})
    assert qr.status_code == 403 and qr.json()["error"]["code"] == "credential_wrong_store"
    otp = await client.post("/api/v1/store/pickup/verify-otp", headers=auth("staff-b"), json={"order_id": order_id, "otp": cred["otp"]})
    assert otp.status_code == 403
    assert db.docs("orders")[order_id]["order_status"] == "READY_FOR_PICKUP"
    assert stock(db)["reserved_quantity"] == 2
    rejected = [a for a in db.docs(f"pickup_verifications/{order_id}/audit").values() if a["reason"] == "wrong_store"]
    assert len(rejected) == 2 and rejected[0]["staff_store_id"] == "store-b"


async def test_forged_or_malformed_token_rejected(client):
    order_id = await ready_order(client)
    cred = await credential(client, order_id)
    token = cred["qr_payload"]
    tampered = token[:-3] + ("aaa" if not token.endswith("aaa") else "bbb")
    forged = generate_token("some-other-secret", order_id, int((utc_now() + timedelta(minutes=5)).timestamp()))
    for bad in (tampered, forged, "not-a-token-at-all", "qp1.a.b.c.d"):
        r = await client.post("/api/v1/store/pickup/verify-qr", headers=auth("staff-a"), json={"qr_payload": bad})
        assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_credential", bad


async def test_reissue_invalidates_previous_credential(client):
    order_id = await ready_order(client)
    old = await credential(client, order_id)
    new = await credential(client, order_id)
    assert old["qr_payload"] != new["qr_payload"]
    stale = await client.post("/api/v1/store/pickup/verify-qr", headers=auth("staff-a"), json={"qr_payload": old["qr_payload"]})
    assert stale.status_code == 400 and stale.json()["error"]["code"] == "invalid_credential"
    fresh = await client.post("/api/v1/store/pickup/verify-qr", headers=auth("staff-a"), json={"qr_payload": new["qr_payload"]})
    assert fresh.status_code == 200


async def test_wrong_otp_counts_attempts_then_locks(client, db, settings):
    order_id = await ready_order(client)
    cred = await credential(client, order_id)
    wrong = "000000" if cred["otp"] != "000000" else "111111"
    for _ in range(settings.pickup_max_verify_attempts):
        r = await client.post("/api/v1/store/pickup/verify-otp", headers=auth("staff-a"), json={"order_id": order_id, "otp": wrong})
        assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_credential"
    assert db.docs("pickup_verifications")[order_id]["attempts"] == settings.pickup_max_verify_attempts  # persisted despite error
    locked = await client.post("/api/v1/store/pickup/verify-otp", headers=auth("staff-a"), json={"order_id": order_id, "otp": cred["otp"]})
    assert locked.status_code == 429 and locked.json()["error"]["code"] == "too_many_attempts"
    assert db.docs("orders")[order_id]["order_status"] == "READY_FOR_PICKUP"
    # QR still works: the lock only protects the guessable OTP
    qr = await client.post("/api/v1/store/pickup/verify-qr", headers=auth("staff-a"), json={"qr_payload": cred["qr_payload"]})
    assert qr.status_code == 200


async def test_otp_for_unknown_order_is_generic_error(client):
    r = await client.post("/api/v1/store/pickup/verify-otp", headers=auth("staff-a"), json={"order_id": "ghost", "otp": "123456"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_credential"


async def test_otp_format_validated(client):
    r = await client.post("/api/v1/store/pickup/verify-otp", headers=auth("staff-a"), json={"order_id": "x", "otp": "12ab"})
    assert r.status_code == 422


async def test_customer_cannot_verify(client):
    r = await client.post("/api/v1/store/pickup/verify-qr", headers=auth("customer1"), json={"qr_payload": "qp1.a.b.c.dddddd"})
    assert r.status_code == 403


async def test_cancelled_order_credential_cannot_complete(client, db):
    order_id = await ready_order(client)
    cred = await credential(client, order_id)
    from app.modules.orders.lifecycle import OrderLifecycleService, OrderScope
    from app.shared.enums import OrderStatus
    await OrderLifecycleService(db).transition(order_id, OrderStatus.CANCELLED, actor_uid="staff-a", scope=OrderScope(store_id="store-a"), reason="spill")
    assert stock(db)["reserved_quantity"] == 0
    r = await client.post("/api/v1/store/pickup/verify-qr", headers=auth("staff-a"), json={"qr_payload": cred["qr_payload"]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "order_not_ready"
    assert stock(db)["available_quantity"] == 10  # nothing deducted


# --------------------------------------------------------------------- expiry (injected clock)
async def test_token_and_otp_expire(db, settings, client):
    order_id = await ready_order(client)
    t0 = utc_now()
    issuer = PickupService(db, settings, clock=lambda: t0)
    cred = await issuer.issue_credential("cust-1", order_id)
    assert cred.expires_at == t0 + timedelta(seconds=settings.pickup_token_ttl_seconds)

    late = PickupService(db, settings, clock=lambda: t0 + timedelta(seconds=settings.pickup_token_ttl_seconds + 1))
    with pytest.raises(CredentialExpiredError):
        await late.verify_qr(STAFF_A, cred.qr_payload)
    with pytest.raises(CredentialExpiredError):
        await late.verify_otp(STAFF_A, order_id, cred.otp)
    assert db.docs("orders")[order_id]["order_status"] == "READY_FOR_PICKUP"

    on_time = PickupService(db, settings, clock=lambda: t0 + timedelta(seconds=settings.pickup_token_ttl_seconds - 1))
    order = await on_time.verify_qr(STAFF_A, cred.qr_payload)
    assert order.order_status.value == "COMPLETED"


async def test_expired_credential_can_be_reissued(db, settings, client):
    order_id = await ready_order(client)
    t0 = utc_now()
    first = await PickupService(db, settings, clock=lambda: t0).issue_credential("cust-1", order_id)
    later = t0 + timedelta(hours=1)
    second = await PickupService(db, settings, clock=lambda: later).issue_credential("cust-1", order_id)
    assert second.qr_payload != first.qr_payload
    assert (await PickupService(db, settings, clock=lambda: later).verify_otp(STAFF_A, order_id, second.otp)).order_status.value == "COMPLETED"


# --------------------------------------------------------------------- concurrency
async def test_concurrent_verification_completes_exactly_once(db, settings, client):
    order_id = await ready_order(client)
    service = PickupService(db, settings)
    cred = await service.issue_credential("cust-1", order_id)
    results = await asyncio.gather(
        *(service.verify_qr(STAFF_A, cred.qr_payload) for _ in range(6)), return_exceptions=True
    )
    successes = [r for r in results if isinstance(r, Order)]
    failures = [r for r in results if isinstance(r, Exception)]
    assert len(successes) == 1 and len(failures) == 5
    assert all(isinstance(f, ConflictError) and f.code == "credential_already_used" for f in failures)
    inv = stock(db)
    assert (inv["available_quantity"], inv["reserved_quantity"]) == (8, 0)  # deducted once, not 6 times
    events = [a["event"] for a in db.docs(f"pickup_verifications/{order_id}/audit").values()]
    assert events.count("VERIFIED") == 1


async def test_concurrent_mixed_qr_and_otp_complete_once(db, settings, client):
    order_id = await ready_order(client)
    service = PickupService(db, settings)
    cred = await service.issue_credential("cust-1", order_id)
    results = await asyncio.gather(
        service.verify_qr(STAFF_A, cred.qr_payload),
        service.verify_otp(STAFF_A, order_id, cred.otp),
        return_exceptions=True,
    )
    assert sum(isinstance(r, Order) for r in results) == 1
    assert stock(db)["available_quantity"] == 8


# --------------------------------------------------------------------- crypto unit tests
def test_token_roundtrip_and_tamper_detection():
    token = generate_token("s3cret", "order123", 1_900_000_000)
    assert parse_token("s3cret", token) == ("order123", 1_900_000_000)
    with pytest.raises(InvalidCredentialError):
        parse_token("other", token)
    parts = token.split(".")
    parts[1] = "order999"  # swap order id, keep signature
    with pytest.raises(InvalidCredentialError):
        parse_token("s3cret", ".".join(parts))


def test_otp_hash_is_bound_to_order_and_secret():
    assert hash_otp("k", "o1", "123456") != hash_otp("k", "o2", "123456")
    assert hash_otp("k", "o1", "123456") != hash_otp("k2", "o1", "123456")
    assert hash_otp("k", "o1", "123456") == hash_otp("k", "o1", "123456")


# --------------------------------------------------------------------- analytics
async def test_compute_overview_pure():
    now = utc_now()
    mk = lambda secs, total: Order.model_validate({
        "id": "o", "customer_id": "c", "store_id": "s", "items": [], "subtotal": total, "delivery_fee": "0.00",
        "pickup_discount": "0.00", "pickup_fee": "4.00", "total_amount": total, "order_status": "COMPLETED",
        "idempotency_key": "k", "created_at": now, "updated_at": now,
        "preparing_at": now, "ready_at": now + timedelta(seconds=secs)})
    overview = compute_overview([mk(60, "35.00"), mk(120, "50.50")], Decimal("35.00"))
    assert overview.total_pickups == 2 and overview.avg_preparation_seconds == 90.0
    assert overview.total_revenue == Decimal("85.50") and overview.estimated_rider_cost_saved == Decimal("70.00")
    empty = compute_overview([], Decimal("35"))
    assert empty.total_pickups == 0 and empty.avg_preparation_seconds is None


async def test_analytics_endpoint_counts_only_own_completed_orders(client):
    order_id = await ready_order(client)
    cred = await credential(client, order_id)
    await client.post("/api/v1/store/pickup/verify-qr", headers=auth("staff-a"), json={"qr_payload": cred["qr_payload"]})
    a = (await client.get("/api/v1/store/analytics/overview", headers=auth("staff-a"))).json()["data"]
    b = (await client.get("/api/v1/store/analytics/overview", headers=auth("staff-b"))).json()["data"]
    assert a["total_pickups"] == 1 and a["estimated_rider_cost_saved"] == "35.00" and "Illustrative" in a["estimate_note"]
    assert b["total_pickups"] == 0
