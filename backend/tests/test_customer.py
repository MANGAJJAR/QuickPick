"""Developer 1 (customer module) tests."""

from __future__ import annotations

import asyncio

from tests.conftest import advance_to_ready, auth, place_order


def stock(db, store="store-a", product="milk"):
    return db.docs("inventory")[f"{store}__{product}"]


async def test_profile_created_on_first_call_and_scoped_to_caller(client):
    r1 = await client.get("/api/v1/customers/me", headers=auth("customer1"))
    r2 = await client.get("/api/v1/customers/me", headers=auth("customer2"))
    assert r1.json()["data"]["uid"] == "cust-1" and r2.json()["data"]["uid"] == "cust-2"
    assert r1.json()["data"]["email"] == "c1@example.com"


async def test_profile_phone_validation(client):
    r = await client.patch("/api/v1/customers/me", headers=auth("customer1"), json={"phone": "abc"})
    assert r.status_code == 422
    ok = await client.patch("/api/v1/customers/me", headers=auth("customer1"), json={"phone": "+919876543210"})
    assert ok.json()["data"]["phone"] == "+919876543210"


async def test_store_discovery_list_nearby_and_detail(client):
    listing = await client.get("/api/v1/customer/stores", headers=auth("customer1"))
    assert {s["id"] for s in listing.json()["data"]} == {"store-a", "store-b"}
    near = await client.get("/api/v1/customer/stores/nearby", headers=auth("customer1"),
                            params={"lat": 23.0258, "lng": 72.5873, "radius_km": 5})
    assert [s["store"]["id"] for s in near.json()["data"]] == ["store-a"]
    wide = await client.get("/api/v1/customer/stores/nearby", headers=auth("customer1"),
                            params={"lat": 23.0258, "lng": 72.5873, "radius_km": 30})
    assert [s["store"]["id"] for s in wide.json()["data"]] == ["store-a", "store-b"]
    assert (await client.get("/api/v1/customer/stores/store-a", headers=auth("customer1"))).status_code == 200
    assert (await client.get("/api/v1/customer/stores/nope", headers=auth("customer1"))).status_code == 404


async def test_store_with_pickup_disabled_is_hidden(client, db):
    db.docs("stores")  # sanity
    await db.collection("stores").document("store-b").update({"pickup_enabled": False})
    assert (await client.get("/api/v1/customer/stores/store-b", headers=auth("customer1"))).status_code == 404
    ids = {s["id"] for s in (await client.get("/api/v1/customer/stores", headers=auth("customer1"))).json()["data"]}
    assert ids == {"store-a"}


async def test_product_availability_per_store(client):
    r = await client.get("/api/v1/customer/products", headers=auth("customer1"), params={"store_id": "store-b"})
    by_id = {p["product"]["id"]: p for p in r.json()["data"]}
    assert by_id["milk"]["pickable_quantity"] == 10 and by_id["milk"]["in_stock"] is True
    assert by_id["bread"]["pickable_quantity"] == 0 and by_id["bread"]["in_stock"] is False
    one = await client.get("/api/v1/customer/products/bread", headers=auth("customer1"), params={"store_id": "store-a"})
    assert one.json()["data"]["pickable_quantity"] == 5
    assert (await client.get("/api/v1/customer/products/ghost", headers=auth("customer1"))).status_code == 404


async def test_product_pagination_and_category_filter(client):
    page1 = await client.get("/api/v1/customer/products", headers=auth("customer1"), params={"limit": 2})
    body = page1.json()
    assert len(body["data"]) == 2 and body["pagination"]["has_more"] is True
    page2 = await client.get("/api/v1/customer/products", headers=auth("customer1"),
                             params={"limit": 2, "cursor": body["pagination"]["next_cursor"]})
    assert len(page2.json()["data"]) == 1 and page2.json()["pagination"]["has_more"] is False
    dairy = await client.get("/api/v1/customer/products", headers=auth("customer1"), params={"category": "dairy"})
    assert {p["product"]["id"] for p in dairy.json()["data"]} == {"milk", "eggs"}


async def test_checkout_preview_calculations(client):
    r = await client.post("/api/v1/customer/checkout/preview", headers=auth("customer1"),
                          json={"store_id": "store-a", "items": [{"product_id": "milk", "quantity": 2}, {"product_id": "bread", "quantity": 1}]})
    data = r.json()["data"]
    p = data["pricing"]
    assert p["subtotal"] == "105.00" and p["pickup_discount"] == "25.00" and p["total_amount"] == "80.00"
    assert p["pickup_fee"] == "4.00" and p["platform_net_saving"] == "6.00"
    assert data["message"] == "You save ₹69 vs delivery"  # 25 discount + 35 delivery fee + 9 handling fee a pickup spares you
    assert p["you_save"] == "69.00" and p["delivery_fee"] == "0.00" and p["handling_fee"] == "0.00"


async def test_preview_ignores_client_prices_and_merges_duplicate_lines(client):
    r = await client.post("/api/v1/customer/checkout/preview", headers=auth("customer1"),
                          json={"store_id": "store-a", "items": [{"product_id": "milk", "quantity": 1, "unit_price": "0.01"}, {"product_id": "milk", "quantity": 1}]})
    assert r.json()["data"]["pricing"]["subtotal"] == "60.00"
    assert len(r.json()["data"]["items"]) == 1


async def test_create_order_reserves_inventory_and_prices_server_side(client, db):
    r = await place_order(client)
    assert r.status_code == 201
    order = r.json()["data"]
    assert order["order_status"] == "PLACED" and order["total_amount"] == "35.00"
    assert [e["status"] for e in order["status_history"]] == ["CREATED", "PLACED"]
    inv = stock(db)
    assert inv["available_quantity"] == 10 and inv["reserved_quantity"] == 2


async def test_insufficient_stock_rejected_and_nothing_written(client, db):
    r = await place_order(client, items=[{"product_id": "bread", "quantity": 6}])
    assert r.status_code == 409 and r.json()["error"]["code"] == "insufficient_stock"
    assert stock(db, product="bread")["reserved_quantity"] == 0
    assert db.docs("orders") == {}


async def test_multi_item_order_is_all_or_nothing(client, db):
    r = await place_order(client, items=[{"product_id": "milk", "quantity": 2}, {"product_id": "bread", "quantity": 6}])
    assert r.status_code == 409
    assert stock(db)["reserved_quantity"] == 0  # milk reservation was not applied


async def test_cross_store_items_cannot_be_ordered(client):
    # bread is only stocked at store-a; ordering it "from" store-b must fail
    r = await place_order(client, store_id="store-b", items=[{"product_id": "bread", "quantity": 1}])
    assert r.status_code == 409 and r.json()["error"]["code"] == "insufficient_stock"


async def test_duplicate_order_prevented_by_idempotency_key(client, db):
    first = await place_order(client, key="same-key-1")
    second = await place_order(client, key="same-key-1")
    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["data"]["id"] == second.json()["data"]["id"]
    assert len(db.docs("orders")) == 1 and stock(db)["reserved_quantity"] == 2


async def test_concurrent_duplicate_requests_create_one_order(client, db):
    results = await asyncio.gather(*(place_order(client, key="race-key-1") for _ in range(5)))
    assert sorted(r.status_code for r in results) == [200, 200, 200, 200, 201]
    assert len(db.docs("orders")) == 1 and stock(db)["reserved_quantity"] == 2


async def test_idempotency_key_is_scoped_per_customer(client, db):
    a = await place_order(client, token="customer1", key="shared-key-1")
    b = await place_order(client, token="customer2", key="shared-key-1")
    assert a.json()["data"]["id"] != b.json()["data"]["id"]


async def test_missing_idempotency_key_rejected(client):
    r = await client.post("/api/v1/customer/orders", headers=auth("customer1"),
                          json={"store_id": "store-a", "items": [{"product_id": "milk", "quantity": 1}]})
    assert r.status_code == 422


async def test_concurrent_orders_never_oversell(client, db):
    results = await asyncio.gather(
        place_order(client, token="customer1", key="oversell-1", items=[{"product_id": "bread", "quantity": 3}]),
        place_order(client, token="customer2", key="oversell-2", items=[{"product_id": "bread", "quantity": 3}]),
    )
    assert sorted(r.status_code for r in results) == [201, 409]
    inv = stock(db, product="bread")
    assert inv["reserved_quantity"] == 3 and inv["reserved_quantity"] <= inv["available_quantity"]


async def test_store_must_be_open_and_has_capacity(client, db):
    await db.collection("stores").document("store-a").update({"operating_status": "CLOSED"})
    r = await place_order(client)
    assert r.status_code == 409 and r.json()["error"]["code"] == "store_not_accepting_orders"
    await db.collection("stores").document("store-a").update({"operating_status": "OPEN", "preparation_capacity": 1})
    assert (await place_order(client, key="cap-key-01")).status_code == 201
    full = await place_order(client, key="cap-key-02")
    assert full.status_code == 409 and full.json()["error"]["code"] == "store_at_capacity"


async def test_order_ownership(client):
    order_id = (await place_order(client, token="customer1")).json()["data"]["id"]
    assert (await client.get(f"/api/v1/customer/orders/{order_id}", headers=auth("customer1"))).status_code == 200
    assert (await client.get(f"/api/v1/customer/orders/{order_id}", headers=auth("customer2"))).status_code == 404
    assert (await client.post(f"/api/v1/customer/orders/{order_id}/cancel", headers=auth("customer2"))).status_code == 404
    mine = await client.get("/api/v1/customer/orders", headers=auth("customer2"))
    assert mine.json()["data"] == []


async def test_order_listing_newest_first_with_pagination(client):
    ids = [(await place_order(client, key=f"list-key-{i}")).json()["data"]["id"] for i in range(3)]
    r = await client.get("/api/v1/customer/orders", headers=auth("customer1"), params={"limit": 2})
    got = [o["id"] for o in r.json()["data"]]
    assert got == [ids[2], ids[1]] and r.json()["pagination"]["has_more"] is True


async def test_cancel_releases_reserved_stock(client, db):
    order_id = (await place_order(client)).json()["data"]["id"]
    r = await client.post(f"/api/v1/customer/orders/{order_id}/cancel", headers=auth("customer1"), json={"reason": "changed mind"})
    assert r.status_code == 200 and r.json()["data"]["order_status"] == "CANCELLED"
    assert r.json()["data"]["cancel_reason"] == "changed mind"
    assert stock(db)["reserved_quantity"] == 0 and stock(db)["available_quantity"] == 10


async def test_cancel_rules(client, db):
    order_id = (await place_order(client)).json()["data"]["id"]
    await client.post(f"/api/v1/customer/orders/{order_id}/cancel", headers=auth("customer1"))
    again = await client.post(f"/api/v1/customer/orders/{order_id}/cancel", headers=auth("customer1"))
    assert again.status_code == 409  # terminal state
    assert stock(db)["reserved_quantity"] == 0  # not double-released

    second = (await place_order(client, key="cancel-key-2")).json()["data"]["id"]
    for step in ("accept", "start-preparation"):
        await client.post(f"/api/v1/store/orders/{second}/{step}", headers=auth("staff-a"))
    late = await client.post(f"/api/v1/customer/orders/{second}/cancel", headers=auth("customer1"))
    assert late.status_code == 409 and late.json()["error"]["code"] == "order_not_cancellable"
    assert stock(db)["reserved_quantity"] == 2


async def test_pickup_credential_authorization_and_storage(client, db):
    order_id = (await place_order(client)).json()["data"]["id"]
    url = f"/api/v1/customer/orders/{order_id}/pickup-credential"
    early = await client.get(url, headers=auth("customer1"))
    assert early.status_code == 409 and early.json()["error"]["code"] == "order_not_ready"

    await advance_to_ready(client, order_id)
    assert (await client.get(url, headers=auth("customer2"))).status_code == 404  # not the owner
    assert (await client.get(url, headers=auth("staff-a"))).status_code == 403  # wrong role
    ok = await client.get(url, headers=auth("customer1"))
    cred = ok.json()["data"]
    assert ok.status_code == 200 and len(cred["otp"]) == 6 and cred["qr_payload"].startswith("qp1.")

    stored = db.docs("pickup_verifications")[order_id]
    blob = str(stored)
    assert cred["qr_payload"] not in blob and cred["otp"] not in stored.values()  # raw values never stored
    assert len(stored["token_hash"]) == 64 and stored["consumed_at"] is None
    assert db.docs("orders")[order_id]["pickup_code_reference"] == order_id
