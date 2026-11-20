# Order lifecycle, pickup verification and pricing

## States

```
CREATED -> PLACED -> ACCEPTED -> PREPARING -> READY_FOR_PICKUP -> COMPLETED
              |          |           |               |
              +----------+-----------+---------------+--> CANCELLED
              PLACED, READY_FOR_PICKUP ----------------> EXPIRED
```

Terminal: `COMPLETED`, `CANCELLED`, `EXPIRED`. The table lives in `app/shared/order_lifecycle.py` (the single source of truth) and is executed by `OrderLifecycleService.transition`.

| From | Allowed next |
|---|---|
| CREATED | PLACED, CANCELLED |
| PLACED | ACCEPTED, CANCELLED, EXPIRED |
| ACCEPTED | PREPARING, CANCELLED |
| PREPARING | READY_FOR_PICKUP, CANCELLED |
| READY_FOR_PICKUP | COMPLETED, CANCELLED, EXPIRED |

* `CREATED` is transient: the creation transaction writes `CREATED` then `PLACED` into `status_history` and stores `PLACED` (inventory is reserved in the same transaction).
* Customer self-cancel: only `PLACED`/`ACCEPTED`. Store "reject": only `PLACED`.
* Cancel/reject/expire from a reserved state releases stock atomically.
* `COMPLETED` is **not** reachable through `transition`; only verified pickup completes an order.
* **Auto-expiry** (`app/modules/orders/expiry.py`): a PLACED order the store never accepts expires after `PLACED_EXPIRY_MINUTES` (15), and a READY_FOR_PICKUP order nobody collects expires after `READY_EXPIRY_MINUTES` (30). `0` turns a rule off. Orders being prepared are never auto-expired. Each expiry runs through `transition(EXPIRED)` with `only_from`, so stock release, status history and the notifications commit atomically, and an order that moved on in the meantime is skipped. `Order.expires_at` carries the live deadline (set on PLACED and READY, cleared otherwise) so clients can show a countdown.
  * Triggers: an in-process loop every `EXPIRY_SWEEP_INTERVAL_SECONDS` (60; `0` disables, fine for local/dev and a single instance), and `POST /api/v1/internal/jobs/expire-orders` with header `X-Job-Secret: $JOB_SECRET` for Cloud Scheduler (returns 403 `jobs_disabled` unless `JOB_SECRET` is set). Safe to run from many instances at once.
  * Needs two composite indexes (already in `firestore.indexes.json`): `orders(order_status, created_at)` and `orders(order_status, ready_at)`.

## Pickup verification

1. Customer calls `GET /customer/orders/{id}/pickup-credential` (order must be `READY_FOR_PICKUP`, caller must own it). Server returns a signed QR payload `qp1.<order_id>.<expiry>.<nonce>.<hmac>` and a numeric OTP. Calling again re-issues and **invalidates** the previous credential.
2. Stored: `sha256(token)` and `HMAC(secret, order_id:otp)`; never the raw values.
3. Staff submits the QR payload (`verify-qr`) or `order_id` + OTP (`verify-otp`).
4. QR signature is checked before any DB read. Then, in **one transaction**: same store → not consumed → not expired → OTP attempt limit → hash match → order still `READY_FOR_PICKUP`; then consume credential, `READY_FOR_PICKUP -> COMPLETED`, inventory `confirm` (reserved → deducted), audit row.
5. Rejections write an audit row (and increment `attempts` for OTP) and return a typed error: `invalid_credential` 400 (generic, no oracle), `credential_wrong_store` 403, `credential_already_used` 409, `credential_expired` 410, `too_many_attempts` 429, `order_not_ready` 409.

Security properties covered by tests: forged/tampered tokens, replay, double redemption (sequential and concurrent), cross-store use, expiry (injected clock), OTP brute-force lockout (persisted), re-issue invalidation, cancelled orders.

## Pricing (illustrative; all assumptions)

```
rider_cost_saved     = RIDER_COST_SAVED                      (default 35.00)
pickup_discount      = min( round_half_up_to_rupee(rider_cost_saved * 0.70),  MAX_PICKUP_DISCOUNT (25.00),  subtotal )
quickpick_fee        = QUICKPICK_FEE                          (default 4.00)
platform_net_saving  = rider_cost_saved - pickup_discount - quickpick_fee
total_amount         = subtotal + delivery_fee(0) - pickup_discount
```

Assumptions: (1) `35 × 0.70 = 24.50` is rounded half-up to a whole rupee → **₹25**, then capped at 25. (2) `quickpick_fee` is QuickPick's fee billed to the dark-store platform, so it is recorded on the order (`pickup_fee`) but **not** added to the customer total; this keeps the headline "You save ₹25 vs delivery" true. (3) The discount never exceeds the subtotal. (4) Pickup orders have `delivery_fee = 0`. (5) `platform_net_saving` can be negative if the cap is raised above the saving. (6) Product price is global; prices are read outside the order transaction (catalogue changes mid-checkout are tolerated). (7) All figures are Decimal; these numbers are a hackathon model, not measured costs.


## Delivery orders

A customer chooses **PICKUP** (default) or **DELIVERY** at checkout (`fulfilment` on `POST /customer/orders`). The platform's riders do the delivering; QuickPick records the address and the hand-offs, and prices both ways from the same cart.

```
PLACED -> ACCEPTED -> PREPARING -> READY_FOR_PICKUP ("packed, waiting for a rider") -> OUT_FOR_DELIVERY -> DELIVERED
```

* Store actions: `POST /store/orders/{id}/dispatch` (packed -> OUT_FOR_DELIVERY, delivery orders only) and `POST /store/orders/{id}/deliver` (OUT_FOR_DELIVERY -> DELIVERED). `deliver` runs in one transaction with the stock confirmation (reserved -> deducted), exactly like a verified pickup, plus the customer notification.
* Delivery orders have no pickup code, no arrival signal, and never appear in the counter queue. A packed delivery does **not** auto-expire (it waits for a rider, not the customer); an unaccepted one still expires after `PLACED_EXPIRY_MINUTES`.
* Pricing: `delivery_fee` (`DELIVERY_FEE`, default 25) is waived at or above `FREE_DELIVERY_ABOVE` (default 199). No pickup discount, no QuickPick fee. `delivery_eta_minutes` is an estimate stored on the order.
* A store can switch delivery off with `Store.delivery_enabled` (documents without the field count as enabled).

## "Riders are busy": surge pricing in reverse

`app/modules/signals/` turns rider scarcity into one number, `multiplier` (1.0 = normal, capped at `MAX_SURGE_MULTIPLIER` 1.8):

| input | source | adds |
|---|---|---|
| rider supply LOW / VERY_LOW | **simulated**: the store manager sets it (`PUT /store/signals`); swap `SignalService` for the platform's real rider feed | +0.30 / +0.60 |
| weather RAIN / STORM | **live** from Open-Meteo (free, no key, cached `WEATHER_CACHE_SECONDS`); a manager can force it; any failure means CLEAR | +0.30 / +0.50 |
| rush hour | schedule `RUSH_HOURS` (default 12:30-14:00, 19:30-21:30 local) | +0.25 |

`multiplier >= SURGE_THRESHOLD` (1.25) means riders are busy. It raises the delivery ETA (`DELIVERY_BASE_ETA_MINUTES + 30 x (multiplier - 1)`) and, **only for customers within `WALK_RADIUS_KM` (1 km) of the store**, the pickup discount:

```
normal   discount = min(round(35 x 0.70), 25, subtotal)                    = 25
walking  discount = min(round(35 x multiplier x 0.70), 40, subtotal)       (up to 40; the platform's delivery cost rose by the same factor)
```

The same function prices the preview and the order, so the number shown is the number charged. The customer's location is client-reported: it can only unlock the higher discount (at most ₹15 more, never above the order value), and the order records `surge_multiplier` and `walk_distance_m` for audit. Everyone else keeps the normal discount. `GET /customer/stores/{id}/offer?lat=&lng=` returns the headline ("Riders are busy. Walk 3 min and save ₹40"), the reasons, the delivery ETA and where each input comes from.
