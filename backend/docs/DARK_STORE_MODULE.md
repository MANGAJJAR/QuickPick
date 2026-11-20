# Dark-store module (Developer 2)

## Already working (reference slice built with the foundation)
Store profile/status/pickup settings (`stores/store_*`), inventory CRUD + low stock (`inventory/store_*`), orders accept/reject/prepare/ready (`orders/store_*`), pickup verify QR/OTP + live queue (`pickup/store_routes.py`, `pickup/queue.py`), analytics overview (`analytics/`). Pickup verification itself is foundation code (`pickup/service.py`); you own its routes and the staff experience.

## Yours to build
1. **Store notifications** (`GET /store/notifications`, `PATCH .../read`): e.g. "new order placed". Needs a hook when an order is created (Dev 1's code) — agree on an event helper in a core PR rather than editing `customer_service.py`.
2. **Analytics daily/performance** (`/store/analytics/daily`, `/performance`): either aggregate on read (as `overview` does) or populate `store_analytics/{store_id}__{yyyymmdd}` on pickup completion (inside the verification transaction → core PR to `pickup/service.py`).
3. **Customer-arrival indicator** on the queue: needs an endpoint (e.g. customer "I'm here") — propose the contract in a core PR.
4. **Store suitability scoring** (rank stores by order volume + density): `modules/stores/store_service.py` or a new `scoring.py`, consumed by the AI assistant.
5. Order-expiry sweeper for stale `READY_FOR_PICKUP` orders (Cloud Scheduler → internal endpoint or script).
6. Frontend-facing polish: real-time queue (Firestore listeners from the client, or SSE).

## Rules you must keep
* `store_id` always comes from the token (`user.store_id`), never from the request.
* Never write `reserved_quantity`; set only `available_quantity` via `StoreInventoryService.set_quantity` (it blocks values below reserved).
* Status changes only through `OrderLifecycleService.transition` (use `only_from` to narrow an action's legal source states, as `reject` does).
* Do not weaken verification checks; add tests under `tests/test_dark_store_*.py` (see the existing replay/concurrency/expiry tests).

## Roles
Staff can run the floor (orders, pickup, inventory edit, open/pause). Only managers can edit the store profile/pickup settings and delete inventory rows.

## Tests
`tests/test_dark_store.py` covers authorization, inventory rules, transitions, QR/OTP security, expiry, concurrency, analytics.
