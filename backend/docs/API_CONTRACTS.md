# API contracts (`/api/v1`)

Auth: `Authorization: Bearer <Firebase ID token>` on everything except health. Interactive docs: `/docs`.

## Envelope
```json
{ "success": true,  "data": {}, "error": null, "pagination": {"limit": 20, "next_cursor": "abc", "has_more": true} }
{ "success": false, "data": null, "error": {"code": "insufficient_stock", "message": "..."} }
```
`pagination` appears on list endpoints (`?limit=1..100&cursor=`). Money is a **string** (`"35.00"`), timestamps are ISO-8601 UTC.

## Error codes
`unauthorized` 401 · `forbidden`, `store_claim_missing`, `credential_wrong_store` 403 · `not_found`, `product_unavailable`, `invalid_cursor` 404 · `validation_error` 422 · `insufficient_stock`, `invalid_status_transition`, `order_not_cancellable`, `order_not_ready`, `store_not_accepting_orders`, `store_at_capacity`, `below_reserved_quantity`, `stock_reserved`, `credential_already_used`, `conflict` 409 · `invalid_credential` 400 · `credential_expired` 410 · `too_many_attempts` 429 · `service_unavailable` 503 · `internal_error` 500.

## Status of every contracted endpoint

| Endpoint | Status |
|---|---|
| `GET /health`, `GET /ready`, `GET /api/v1/health` | ✅ implemented |
| `GET, PATCH /customers/me` | ✅ |
| `GET /customer/stores`, `/stores/nearby`, `/stores/{id}` | ✅ |
| `GET /customer/products`, `/products/{id}` | ✅ |
| `GET /customer/cart`, `POST /cart/items`, `PATCH, DELETE /cart/items/{id}` | ⛔ **not implemented** (Dev 1; no cart collection yet) |
| `POST /customer/checkout/preview`, `POST /customer/orders`, `GET /customer/orders`, `GET /customer/orders/{id}`, `POST .../cancel`, `GET .../pickup-credential` | ✅ |
| `GET /customer/notifications`, `PATCH .../read` | ⛔ not implemented (Dev 1) |
| `GET, PATCH /store/me`, `PATCH /store/me/status`, `PATCH /store/me/pickup-settings` | ✅ |
| `GET, POST /store/inventory`, `PATCH, DELETE /store/inventory/{product_id}`, `GET /store/inventory/low-stock` | ✅ |
| `GET /store/orders`, `GET /store/orders/{id}`, `POST .../accept`, `.../reject`, `.../start-preparation`, `.../ready` | ✅ |
| `POST /store/pickup/verify-qr`, `POST /store/pickup/verify-otp`, `GET /store/pickup/queue` | ✅ |
| `GET /store/analytics/overview` | ✅ (illustrative rider-cost estimate) |
| `GET /store/analytics/daily`, `/analytics/performance` | ⛔ not implemented (Dev 2) |
| `GET /store/notifications`, `PATCH .../read` | ⛔ not implemented (Dev 2) |

Unimplemented endpoints are **not registered** (404) rather than stubbed.

## Examples

### `POST /customer/checkout/preview`
```json
{ "store_id": "store-a", "items": [{"product_id": "milk", "quantity": 2}, {"product_id": "bread", "quantity": 1}] }
```
```json
{ "success": true, "error": null, "data": {
  "store_id": "store-a",
  "items": [{"product_id":"milk","name":"Milk 500ml","unit_price":"30.00","quantity":2,"line_total":"60.00"},
            {"product_id":"bread","name":"Brown Bread","unit_price":"45.00","quantity":1,"line_total":"45.00"}],
  "pricing": {"subtotal":"105.00","delivery_fee":"0.00","pickup_discount":"25.00","pickup_fee":"4.00",
              "total_amount":"80.00","you_save":"25.00","rider_cost_saved":"35.00","platform_net_saving":"6.00"},
  "message": "You save ₹25 vs delivery" } }
```

### `POST /customer/orders`
Header **`Idempotency-Key: <8-128 chars>`** is required. Same key + same customer returns the original order with `200` (first call `201`); stock is reserved once.
Body as in preview. Response `data` is the Order (`order_status: "PLACED"`, `status_history: [CREATED, PLACED]`, prices computed server-side — client prices are ignored). Errors: `409 insufficient_stock`, `409 store_not_accepting_orders`, `409 store_at_capacity`, `404 not_found`.

### `GET /customer/orders/{id}/pickup-credential`
```json
{ "success": true, "error": null, "data": {"order_id":"…","qr_payload":"qp1.<order>.<exp>.<nonce>.<sig>","otp":"482913","expires_at":"2026-11-20T10:21:00Z"} }
```
`409 order_not_ready` unless `READY_FOR_PICKUP`. Each call invalidates the previous credential.

### `POST /customer/orders/{id}/cancel` — body optional `{"reason":"…"}`
Allowed in `PLACED`/`ACCEPTED`; releases reserved stock. Else `409 order_not_cancellable`.

### `PATCH /store/inventory/{product_id}`
```json
{ "available_quantity": 25 }
```
→ `{ "store_id":"store-a","product_id":"milk","available_quantity":25,"reserved_quantity":2,"pickable_quantity":23,"updated_at":"…" }`. `409 below_reserved_quantity` if lower than reserved.

### `POST /store/orders/{id}/accept|start-preparation|ready` → the updated Order. `POST …/reject` body optional `{"reason":"…"}` (PLACED only).

### `POST /store/pickup/verify-qr` / `verify-otp`
```json
{ "qr_payload": "qp1.…" }          { "order_id": "…", "otp": "482913" }
```
→ the Order with `order_status: "COMPLETED"`. Errors listed in `ORDER_LIFECYCLE.md`.

### `GET /store/pickup/queue`
```json
{ "data": [{"order_id":"…","order_status":"PREPARING","item_count":3,"total_amount":"80.00","placed_at":"…","preparation_elapsed_seconds":142,"ready_waiting_seconds":null}] }
```
(Customer-arrival indicator is not implemented.)

### `GET /store/analytics/overview`
```json
{ "data": {"total_pickups":12,"avg_preparation_seconds":210.5,"total_revenue":"940.00","estimated_rider_cost_saved":"420.00","estimate_note":"Illustrative estimate: …"} }
```
