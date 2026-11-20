# Module ownership (zero-merge-conflict rule)

**Rule: you only edit files you own. Shared files change only through a `feature/core-foundation` PR reviewed by both developers.**

## Core foundation (neither developer alone)
`app/core/*`, `app/shared/*`, `app/api/*`, `app/main.py`, `app/modules/auth/*`, `app/modules/discounts/*`, `app/modules/inventory/ledger.py`, `app/modules/inventory/repository.py`, `app/modules/orders/{lifecycle,repository}.py`, `app/modules/pickup/{service,crypto}.py`, `*/repository.py` (all), `tests/conftest.py`, `tests/fakes/*`, `tests/test_shared.py`, `scripts/*`, `docs/*` (except the two module docs), Docker/config files, `firestore.indexes.json`.

## Developer 1 — customer module
`modules/customers/*`, `modules/products/{routes,service}.py`, `modules/stores/{customer_routes,customer_service}.py`, `modules/orders/{customer_routes,customer_service}.py`, `modules/pickup/customer_routes.py`, `modules/notifications/` (customer side), `docs/CUSTOMER_MODULE.md`, `tests/test_customer*.py`.

## Developer 2 — dark-store module
`modules/stores/{store_routes,store_service}.py`, `modules/inventory/{store_routes,store_service,schemas}.py`, `modules/orders/{store_routes,store_service}.py`, `modules/pickup/{store_routes,queue}.py`, `modules/analytics/*`, `modules/notifications/` (store side), `docs/DARK_STORE_MODULE.md`, `tests/test_dark_store*.py`.

Shared-but-additive files (`*/schemas.py`, `*/deps.py`, `modules/pickup/schemas.py`): add new classes/functions only, never change existing ones without a core PR.

Files in the same package that belong to different people (e.g. `stores/customer_routes.py` vs `stores/store_routes.py`) never collide because each developer has their own files. Each module's `deps.py` is edited by the module owner for that audience; `stores/deps.py` and `orders/deps.py` are shared: add functions only, in separate commits, and rebase before pushing. `api/router.py` already includes every router, so new routes need no change there (add new files to it only via a core PR).

## The agreed contracts between the modules

| Contract | Provider | Consumer | Rule |
|---|---|---|---|
| `InventoryLedger.read/reserve/release/confirm` | foundation | Dev 1 (order create), lifecycle, pickup | Dev 1 never writes `inventory` directly; Dev 2 never writes `reserved_quantity` |
| `OrderLifecycleService.transition` | foundation | Dev 1 (cancel), Dev 2 (accept/reject/prepare/ready) | all status changes go through it |
| `PickupService.issue_credential / verify_*` | foundation | Dev 1 (credential route), Dev 2 (verify routes) | |
| `DiscountEngine.quote` | foundation | Dev 1 checkout | AI pricing replaces the engine only |
| `shared/models.py` Order/Inventory/Store/Product/User | foundation | both | field changes need a core PR + docs update |
| Response envelope `ok()` and error codes | foundation | both | |

## Cross-module requests
Need a new repository method, enum value or model field? Open a PR into `dev` from `feature/core-foundation`, tag the other developer, and merge it before building on it.
