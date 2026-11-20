# Customer frontend

Location: `frontend/customer-app/`. Talks only to the backend's customer endpoints (`/api/v1/customers/*`, `/api/v1/customer/*`) with `Authorization: Bearer <Firebase ID token>`. Money is always displayed from API strings; the client never computes prices, and never sends prices, roles or store ids (only `store_id` + `product_id`/`quantity`, as the API requires).

## Architecture

* `src/api/` typed client (`client.ts`: envelope unwrapping, `ApiError`, one token-refresh retry on 401, `onUnauthorized` → sign out and redirect to `/login`), `real.ts` (real backend), `mock.ts` (in-browser fake, `VITE_USE_MOCKS=true`), `ai.ts` (assistant adapter, **mock**), `types.ts`.
* `src/auth/` Firebase auth (or one-click mock auth), `RequireAuth`.
* `src/cart/` client-side cart (localStorage) with one-store-per-cart rule and the "Start a new cart?" dialog.
* `src/hooks/queries.ts` TanStack Query hooks (polling, retry policy: only network/5xx errors retry).
* `src/lib/idempotency.ts` one idempotency key per distinct cart, persisted in `sessionStorage`.
* `src/pages/`, `src/components/` UI.

## Screens and API calls

| Screen (route) | API calls | Notes |
|---|---|---|
| Login / sign up (`/login`) | Firebase Auth, then `GET /customers/me` | `/customers/me` creates the profile on first call. Redirects back to where the user was going. |
| Home (`/`) | `GET /customer/stores/nearby?lat&lng&radius_km` (with geolocation) else `GET /customer/stores` | List + Leaflet/OSM map. Distance, open/closed, pickup availability. Location denied → all stores, no distance, with a prompt to retry. |
| Store (`/store/:id`) | `GET /customer/stores/{id}`, `GET /customer/products?store_id=` (cursor "Load more", refetch every 30s) | Search + category filter are client-side. Stock: "In stock" / "Only N left" (≤5) / "Out of stock". Ordering disabled when the store is not OPEN. |
| Cart (`/cart`) | `POST /customer/checkout/preview` | Subtotal and line totals come from the preview. |
| Checkout (`/checkout`) | `POST /customer/checkout/preview`, `POST /customer/orders` (+ `Idempotency-Key`) | Savings hero, Delivery vs Pickup comparison. Double tap and retries reuse the same key. |
| Order (`/orders/:id`) | `GET /customer/orders/{id}` polled every 6s until terminal, `POST …/cancel`, `GET …/pickup-credential` | Stepper PLACED→COMPLETED plus CANCELLED/EXPIRED. Cancel only in PLACED/ACCEPTED. In READY_FOR_PICKUP shows QR + OTP + countdown, "Get a new code" after expiry. COMPLETED shows a success card and hides the credential. |
| Orders (`/orders`) | `GET /customer/orders` | History with status badges. |
| Alerts (`/notifications`) | `GET /customer/notifications`, `PATCH …/{id}/read` | **Backend not implemented** → honest "Alerts aren't available yet" state in real mode. Mock mode has fixtures, unread badge and mark-as-read. |
| Assistant (floating button) | none (mock) + `GET /customer/products` for the catalogue | **Mock adapter**, see below. |

States designed for every screen: loading skeletons, empty, error with retry, offline banner, out of stock, store closed.

## Backend mismatches / gaps (backend not modified)

1. **No cart endpoints** (`/customer/cart…` do not exist). The cart is client-side; pricing uses `checkout/preview`. Cart does not sync across devices.
2. **No notifications endpoints.** Real mode shows an "unavailable" state; the unread badge stays 0.
3. **No AI endpoint.** `src/api/ai.ts` is a clearly labelled mock keyword parser ("Demo parser (mock, not Gemini)"); it matches items against the real store catalogue and adds them to the cart through the normal flow. Pickup-window text ("in 10 min") is parsed but not bookable (no slots in the API), and the UI says so. **Incomplete: not Gemini.**
4. **Pickup credential path** is `GET /customer/orders/{id}/pickup-credential` (the brief wrote `/orders/{id}/…`). The API is trusted.
5. **No prep-time field.** "Ready in ~10-15 min (estimated)" is a constant in `src/config.ts`, labelled Estimated.
6. **No product text search.** Search/categories are client-side over the loaded pages (page size 100).
7. **No delivery price quote.** The "Delivery" column shows `rider_cost_saved` as "Delivery fee (est.)", labelled Estimated/Illustrative, and deliberately shows no delivery total (that would require client-side price math).
8. **`pickup_fee` (₹4) is billed to the store platform, not the customer** (backend design), so the pickup column shows "Service fee: Paid by the store" and the total excludes it.
9. Docs and the running API agreed on every shape and error code exercised (7 live contract tests: profile, stores, nearby, products, preview, idempotent create, cancel, credential gating, completion, errors, 401).

## Mock mode

`VITE_USE_MOCKS=true` replaces the API with `mock.ts` and auth with a demo login. It mimics the contract (same shapes, error codes, 25 INR discount, idempotency replay) but is not the backend. A banner is always visible. "Simulate store scan" completes a pickup.

## Tests (`npm test`)

Cart cross-store confirmation (logic + dialog), checkout preview rendering (savings hero, comparison, Estimated labels, only ids/quantities sent), idempotency key reuse on retry and double-tap, order stepper states (incl. cancelled/expired), QR screen expiry/refresh and hiding after completion, 401 redirect (client refresh-then-`onUnauthorized`, `RequireAuth`), formatting and the mock assistant parser. A live contract suite runs only when `LIVE_API_URL` is set.

## Known limitations

* Not verified against real Firebase Auth or a deployed backend (no Firebase project in this environment). The API layer was verified against the real backend app running locally with a fake token verifier.
* The Docker image and hosting deployments were not built/run here.
* Map tiles load from OpenStreetMap's public tile server (fine for a demo; use a tile provider for production traffic).
* No push/real-time updates (polling every 6s); no PWA/offline caching beyond the browser cache.
* Accessibility was designed in (labels, focus, contrast, reduced motion, `aria-current` on the stepper) but only checked manually and with Testing Library roles, not with an automated audit.
* Visual checks were done in the in-app browser at 375px in mock mode; the desktop layout was not reviewed screen by screen.
