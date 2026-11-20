# Firestore schema

Conventions: all timestamps are timezone-aware **UTC**; money is a **string with 2 decimals** (`"35.00"`, parsed to `Decimal`, never float); enums are stored as their string value; quantities are integers. Firestore has no joins, so related data is fetched by id in code.

## Collections

### `users/{uid}`
`uid, name, email, phone, role, created_at, updated_at`. Created lazily by `GET /customers/me`. `role` mirrors the token claim (the claim is authoritative and refreshed on read).

### `stores/{id}`
`id, name, address, location{lat,lng}, operating_status (OPEN|PAUSED|CLOSED), pickup_enabled, preparation_capacity, created_at, updated_at`. Nearby search is computed in memory over pickup-enabled stores (fine for a city; add geohash before scaling).

### `products/{id}`
`id, name, description, category, image_url, price, unit, is_active`. Global catalogue (price is global, not per store). Seeded/administered out of band.

### `inventory/{store_id}__{product_id}`
`store_id, product_id, available_quantity, reserved_quantity, updated_at`.

**The reserved boundary**

| Field | Meaning | Written by |
|---|---|---|
| `available_quantity` | physical units on the shelf | store staff (`PATCH /store/inventory/{id}`), and `confirm` on pickup |
| `reserved_quantity` | units promised to open orders | **only** `InventoryLedger` |
| pickable = `available - reserved` | what a customer can still order | derived (`Inventory.pickable_quantity`) |

Operations (all inside a Firestore transaction, reads before writes):

* `reserve` (order placed): requires `pickable >= qty`; `reserved += qty`. All lines or none.
* `release` (cancel/reject/expire): `reserved -= qty` (refuses to go below 0).
* `confirm` (pickup verified): `reserved -= qty` and `available -= qty` (refuses to go below 0).
* Staff may not set `available_quantity < reserved_quantity` and may not delete a row with `reserved_quantity > 0`.
* Invariant: `0 <= reserved_quantity <= available_quantity`. Stock never goes negative.

### `orders/{id}`
`id, customer_id, store_id, items[{product_id,name,unit_price,quantity,line_total}], subtotal, delivery_fee, pickup_discount, pickup_fee, total_amount, order_type, order_status, pickup_code_reference, idempotency_key, status_history[{status,at,actor_uid,note}], cancel_reason, accepted_at, preparing_at, ready_at, completed_at, cancelled_at, expired_at, created_at, updated_at`.
`id = sha256(customer_id:idempotency_key)[:32]` so a duplicate request addresses the same document and is detected inside the creation transaction.
*Intentional denormalisation:* item `name`/`unit_price` are snapshots so order history survives catalogue edits; per-status timestamps avoid scanning `status_history` for analytics.

### `pickup_verifications/{order_id}`
`order_id, store_id, customer_id, token_hash, otp_hash, issued_at, expires_at, attempts, consumed_at, consumed_by, method`. Only `sha256(token)` and an HMAC-keyed OTP hash are stored. Subcollection **`audit/{auto-id}`**: `event (VERIFIED|REJECTED), reason, method, staff_uid, staff_store_id, order_id, at` — written in the same transaction as the decision (including rejections).
*Intentional denormalisation:* `store_id`/`customer_id` copied from the order so verification can reject cross-store attempts without an extra read path.

### `notifications/{id}` — **documented, not implemented**
Planned: `user_id|store_id, type, title, body, order_id, read, created_at`. Index will be `(user_id, created_at desc)`.

### `discount_rules/{id}` — **documented, not read yet**
Reserved for per-store/AI pricing overrides: `store_id|null, rider_cost_saved, ratio, max_discount, fee, active`. `ConfigDiscountEngine` currently uses environment settings only.

### `store_analytics/{store_id}__{yyyymmdd}` — **documented, not populated**
Reserved for daily pre-aggregation (`pickups, avg_prep_seconds, revenue`). Today `/store/analytics/overview` is computed on demand from completed orders (bounded to 1000).

## Composite indexes (`firestore.indexes.json`)

| Collection | Fields | Used by |
|---|---|---|
| orders | customer_id ↑, created_at ↓ | customer order list |
| orders | store_id ↑, created_at ↓ | store order list |
| orders | store_id ↑, order_status ↑, created_at ↓ | store list filtered by status |
| orders | store_id ↑, order_status ↑, created_at ↑ | live pickup queue (`in` filter) |
| inventory | store_id ↑, product_id ↑ | store inventory list |
| products | is_active ↑, name ↑ | product browse |
| products | is_active ↑, category ↑, name ↑ | product browse by category |
| stores | pickup_enabled ↑, name ↑ | store discovery |

Deploy with `firebase deploy --only firestore:indexes` (or `gcloud firestore indexes composite create`). Without them the emulator works but production queries fail with `FAILED_PRECONDITION`.

## Known scale limits (acceptable for the buildathon)
Low-stock filtering (≤500 rows), analytics (≤1000 orders), nearby search (≤200 stores) are computed in memory.
