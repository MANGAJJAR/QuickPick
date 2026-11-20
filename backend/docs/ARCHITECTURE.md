# Architecture

Modular monolith: one FastAPI service, strict layering, async throughout, Firestore as the only datastore.

```
HTTP -> routes (HTTP only) -> services (business rules) -> repositories (ALL Firestore access)
                                  \-> shared/ (enums, models, lifecycle, money)   core/ (config, firebase, security, logging)
```

| Layer | Allowed to | Not allowed to |
|---|---|---|
| `routes` | parse/validate input, call one service, wrap with `ok()` | contain business logic, touch Firestore |
| `schemas` | request/response validation | logic |
| `services` | enforce rules, open transactions | build HTTP responses |
| `repositories` | read/write Firestore, (de)serialise | business decisions |
| `shared/`, `core/` | define cross-module contracts | be edited by a feature developer alone |

## Documented deviations from the requested folder structure

* `shared/models.py`, `shared/money.py`, `shared/order_lifecycle.py`, `shared/repository.py`, `shared/geo.py` were added. Domain models, Decimal money, the state machine and the base repository are cross-module contracts and needed a home next to `enums.py`/`schemas.py`.
* Each module has its own `deps.py` (service factories). `api/dependencies.py` only holds auth/db/settings so the two developers never edit the same file.
* Modules that serve both audiences are split **by file**: `customer_routes.py` / `customer_service.py` (Dev 1) vs `store_routes.py` / `store_service.py` (Dev 2). See `MODULE_OWNERSHIP.md`.
* `modules/inventory/ledger.py` is the agreed inventory contract (see below).

## Key design decisions

1. **Transactions only touch documents addressed by id.** Inventory id is `{store_id}__{product_id}`; the order id is derived from `customer_id + Idempotency-Key`; the pickup verification id equals the order id. No queries inside transactions.
2. **Inventory contract** (`InventoryLedger`): `read` (all reads) then `reserve | release | confirm` (queued writes) inside the *caller's* transaction. Customer order code never writes `inventory` directly. Details in `DATABASE_SCHEMA.md`.
3. **One state machine** (`shared/order_lifecycle.py`) executed by `OrderLifecycleService.transition`. `COMPLETED` is reachable only through pickup verification.
4. **Failures that must persist are returned, not raised.** Raising inside a Firestore transaction rolls its writes back, so OTP attempt counters and audit rows for rejected verifications are returned as an outcome and the error is raised after commit.
5. **Pluggable pricing.** Checkout depends on the `DiscountEngine` protocol; `ConfigDiscountEngine` is the mock; swap the factory in `discounts/deps.py` for a Gemini engine.
6. **Stateless.** Settings from env, clients created once at startup, no local state; safe for Cloud Run autoscaling.
7. **Errors** all use the envelope `{success, data, error:{code,message}, pagination?}`; money is serialised as strings.

## Request lifecycle

`request-id middleware -> bearer token verified (Firebase Admin) -> AuthUser(role, store_id from claims) -> role/store dependency -> route -> service -> repository/transaction -> ok(...)`.

## Testing approach

`tests/fakes/firestore.py` is an in-memory async Firestore fake that rejects values Firestore cannot store (Decimal, Enum), supports the query features used, and applies transactions atomically under a lock. Auth is replaced by a fake token verifier. **Limitation:** the fake serialises transactions, so it proves the *logic* is correct under concurrent requests but does not exercise real Firestore contention/retry; run the emulator before the demo.
