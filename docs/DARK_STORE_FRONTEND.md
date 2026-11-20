# Dark store frontend

Location: `frontend/store-dashboard/`. It talks only to the store endpoints (`/api/v1/store/*`) with `Authorization: Bearer <Firebase ID token>`. The store is never sent by the client: the backend derives it from the token. Order status changes only through the action endpoints (the UI updates from the response and refetches; it never mutates status locally). Buttons disable while a request is in flight. Money and counts are displayed as the API returns them (exceptions are listed under "Derived in the browser").

## Architecture

* `src/api/` typed client (`client.ts`: envelope unwrapping, `ApiError`, one token refresh retry on 401, `onUnauthorized` → sign out and redirect to `/login`), `real.ts`, `mock.ts` (in-browser fake with an incoming-order stream), `types.ts`.
* `src/auth/` Firebase auth (or mock auth), `StoreGate` (role claim + backend `GET /store/me` must both agree).
* `src/hooks/queries.ts` TanStack Query hooks (board polls every 5s). `src/lib/` lifecycle table, verification error messages, scan debounce gate, stock validation, sound.
* `src/pages/`, `src/components/` UI. Statuses use one colour **and** an icon **and** a text label each.

## Screens and API calls

| Screen (route) | API calls | Notes |
|---|---|---|
| Login (`/login`) | Firebase Auth | Store accounts are created by operators; no sign-up. |
| Not authorized | `GET /store/me` | Shown when the token's `role` claim is not STORE_STAFF/STORE_MANAGER (no API call is made) or the backend answers 403 (e.g. `store_claim_missing`). |
| Overview (`/`) | `GET /store/me`, `PATCH /store/me/status`, `PATCH /store/me/pickup-settings`, `GET /store/orders` (×4 status + recent), `GET /store/pickup/queue`, `GET /store/analytics/overview` | Big Open/Pause/Closed control. Pickup-enabled switch is manager-only (disabled for staff, with the reason). |
| Orders board (`/orders`) | `GET /store/orders?status=` for PLACED/ACCEPTED/PREPARING/READY_FOR_PICKUP every 5s; `POST /store/orders/{id}/accept\|reject\|start-preparation\|ready` | Columns oldest-first. One primary action per card, only what the lifecycle permits; Reject (with reason) only on new orders. New orders chime and flash (the first load is silent). |
| Order drawer (`/orders?order=id`) | `GET /store/orders/{id}` (polled) + the same actions | Items, totals, timing and preparation timer, status history with actors. |
| Pickup counter (`/counter`, full screen) | `POST /store/pickup/verify-qr`, `POST /store/pickup/verify-otp`, `GET /store/orders?status=READY_FOR_PICKUP` | Camera scan (html5-qrcode), handheld-scanner box, OTP keypad. Scans are debounced (same code ignored for 4s, nothing while a verification is in flight). Green "Handed over" with the order summary, or a red screen with the specific reason (expired, already used, wrong store, not ready, invalid, too many attempts, no connection). |
| Inventory (`/inventory`) | `GET /store/inventory`, `GET /store/inventory/low-stock`, `POST /store/inventory`, `PATCH /store/inventory/{id}`, `DELETE /store/inventory/{id}` | Available / Reserved / Pickable shown separately. Negative or non-integer values are blocked in the UI; the backend's error (e.g. below reserved) is shown if it still rejects. Low stock tab with count badge. Remove is manager-only. |
| Pickup queue (`/queue`) | `GET /store/pickup/queue`, `GET /store/analytics/overview` | Ready orders, longest waiting first; queue size; typical prep time = measured average. |
| Analytics (`/analytics`) | `GET /store/analytics/overview`, `GET /store/orders` | **Measured** section and chart vs a separate dashed **"Estimated, based on assumptions"** card with an info tooltip. |
| Alerts (`/notifications`) | `GET /store/notifications`, `PATCH …/{id}/read` | **Backend not implemented**: real mode shows "Alerts aren't available yet". Mock mode has fixtures. The header bell and sidebar show unread counts. |

States designed everywhere: loading skeletons, empty ("No orders right now"), error with retry, offline banner, session expired (401 → login), unauthorized.

## Backend mismatches / gaps (backend not modified)

1. **No notifications endpoints** (`/store/notifications…`). Real mode shows an "unavailable" state; the unread badge stays 0.
2. **Inventory rows have no product name or category** (`product_id` only), and store staff cannot call the customer catalogue (`/customer/products` is customer-only). The table shows the id (humanised), search is by id, **the category filter is disabled** with a tooltip explaining why, and "Add item" needs the exact product id typed in.
3. **No "deactivate item"**: the only option is `DELETE` ("Remove", manager-only, refused while reserved).
4. **No daily/performance analytics endpoints.** The daily chart and today's counts are derived in the browser from the latest 100 orders (see below); performance uses the measured average prep time from `analytics/overview`.
5. **Orders carry no customer name/phone** (only `customer_id`), so "customer pickup info" shows the id and states that identity is proven by QR/OTP at the counter.
6. **OTP verification needs the order id** (`verify-otp` takes `order_id` + `otp`), so the keypad asks staff to pick the ready order first (auto-selected when only one is waiting).
7. **No expected-prep-time field.** The queue screen shows the measured average of completed orders instead.
8. **No customer-arrival indicator** (no such endpoint).
9. Docs and the running API agreed on every shape and error code exercised (5 live contract tests: profile/status/manager-only toggle, full flow, reject, inventory/analytics/notifications gap, auth failures).

## Derived in the browser (and labelled as such in the UI)
Overview "Today" counts and completion rate, the orders-per-day chart and the preparation-time chart are computed from the latest 100 orders returned by `GET /store/orders`. A store with more than 100 orders in the period will see partial figures. These are measured data, aggregated client-side only because the API has no daily endpoint.

## Mock mode
`VITE_USE_MOCKS=true` replaces the API with `mock.ts` and auth with demo logins (manager, staff, customer). It mimics the contract (shapes, error codes, lifecycle rules, reserved-stock rules, verification failures) and adds a new order about every 20 seconds. The counter shows a dashed demo panel to produce valid/expired/other-store/used codes. State is in memory and resets on reload. A banner is always visible.

## Tests (`npm test`, 59 + an opt-in live suite)
Actions shown per lifecycle state (table + rendered cards), double-submit prevention (double click = one request, buttons disabled, backend error surfaced, no local status change), reject-with-reason, scan debounce (gate + a camera stub reading one QR three times = one request), verification success summary and each failure message, OTP keypad, negative-stock prevention (error, Save disabled, API not called), backend "below reserved" error display, low-stock badge/tab, manager-only Remove, unauthorized-role screen (CUSTOMER / no role / ADMIN / backend 403 / signed out), measured vs illustrative analytics labelling and tooltip, daily/prep series builders, board columns/empty/error states, new-order chime logic, API client 401 refresh-then-redirect behaviour.

## Known limitations
* **Camera scanning is not verified on a real camera**: the in-app browser blocks the camera, so only the fallback message and a stubbed scanner were exercised. Test on the counter tablet over HTTPS before the demo.
* Not verified against real Firebase Auth or a deployed backend (no Firebase project here). The API layer was verified against the real backend app running locally with a fake token verifier.
* The new-order chime is best-effort (browser autoplay rules need one prior click). It was unit-tested, not heard.
* Polling, not push (5s). Docker image and hosting deploys were not built/run here.
* Visual review was done in the in-app browser at 1100×760 in mock mode (Overview, Orders, Counter success/failure, Inventory, Analytics); the Queue, Alerts, order drawer and narrow phone widths were not reviewed visually (they are covered by tests).
* Accessibility was designed in (labels, focus rings, `aria-current`/`aria-pressed`, text+icon statuses, reduced motion) and checked with Testing Library roles, not an automated audit.
