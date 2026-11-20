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
* **EXPIRED is defined but nothing triggers it yet** (needs a Cloud Scheduler job calling `transition(..., EXPIRED)`); see "not done" in the README.

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
