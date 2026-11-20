# Customer module (Developer 1)

## Already working (reference slice built with the foundation)
Profile (`customers/`), store discovery + nearby (`stores/customer_*`), product browse with per-store availability (`products/`), checkout preview, order creation with atomic reservation + idempotency, order list/detail/cancel (`orders/customer_*`), pickup credential (`pickup/customer_routes.py`). Study `orders/customer_service.py` — it is the pattern for everything else.

## Yours to build
1. **Cart** (`GET /customer/cart`, `POST /customer/cart/items`, `PATCH|DELETE /customer/cart/items/{item_id}`). No collection exists yet. Suggested: `users/{uid}/cart` subcollection or a `carts/{uid}` doc (add to `DATABASE_SCHEMA.md` via a core PR). **Must enforce one store per cart** (reject adding an item when the cart has another `store_id`; the order endpoint already rejects products not stocked at the chosen store). Cart totals must reuse `CustomerOrderService.preview` pricing, never recompute separately.
2. **Customer notifications** (`GET /customer/notifications`, `PATCH .../read`): create notification docs from order events (hook after `transition` calls in your cancel flow, and coordinate with Dev 2 for store-driven events).
3. **Gemini chat assistant** ("2 milk, bread, pickup in 10 min"): put it in `modules/ai/`, parse to `CartLine`s, find the nearest store with `StoreDiscoveryService.nearby`, then call `preview`. Needs the Gemini key from Secret Manager.
4. Order-expiry job and slot/ETA selection if the demo needs them (coordinate: expiry uses `OrderLifecycleService.transition(..., EXPIRED, scope=...)`, which needs a system scope — request it in a core PR).

## Rules you must keep
* Prices always come from the server. Never trust client prices or discounts.
* Reserve stock only via `InventoryLedger` inside the order transaction.
* All status changes via `OrderLifecycleService`.
* Customer responses must scope by `user.uid` (404 for other people's orders).
* Idempotency: `Idempotency-Key` header, same key + customer ⇒ same order.

## Tests
`tests/test_customer.py` covers the behaviours above; add yours in `tests/test_customer_*.py`.
