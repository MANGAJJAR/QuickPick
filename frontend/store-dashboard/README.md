# QuickPick store dashboard

Operations dashboard for dark-store staff: a live order board, a full-screen pickup counter (camera QR scan + OTP keypad), inventory, pickup queue, analytics and alerts. Built for a tablet or laptop at the counter. React 18 + Vite + TypeScript (strict) + Tailwind v4, TanStack Query (polling), React Router, Firebase Auth, Recharts, html5-qrcode.

Screens, API calls per screen and limitations: [../../docs/DARK_STORE_FRONTEND.md](../../docs/DARK_STORE_FRONTEND.md).

## Setup

```powershell
cd frontend/store-dashboard
npm install
copy .env.example .env      # then edit
npm run dev                 # http://localhost:5173
```

### Environment (`.env`)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend base URL **including** `/api/v1` (default `http://localhost:8080/api/v1`) |
| `VITE_USE_MOCKS` | `true` = in-browser fake backend with a stream of incoming orders and demo logins (no backend, no Firebase). Default `false` |
| `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID` | Firebase web app config (public values, but keep them out of git) |
| `VITE_FIREBASE_AUTH_EMULATOR_URL` | Optional, e.g. `http://localhost:9099` |

Real mode needs the backend running (see `backend/docs/DEVELOPMENT_GUIDE.md`), its `CORS_ALLOW_ORIGINS` to include this app's origin, and a Firebase user whose token carries the store role and store, set by an operator:

```powershell
python -m scripts.set_role --uid <firebase-uid> --role STORE_STAFF --store-id store-a     # run from backend/
python -m scripts.set_role --uid <firebase-uid> --role STORE_MANAGER --store-id store-a
```

The user must sign out and in again after claims change. Accounts without a store role see "Not authorized for a store". The store is never chosen in the UI: the backend derives it from the token.

### Mock mode

```powershell
$env:VITE_USE_MOCKS="true"; npm run dev
```

A yellow banner stays visible. Sign in as manager, counter staff, or a customer (to see the unauthorized screen). New orders arrive about every 20 seconds. On the counter screen, a dashed "pretend to be the customer" panel produces valid, expired, other-store and already-used codes. Mock state lives in memory and resets on page reload.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build into `dist/` |
| `npm run typecheck` | `tsc` only |
| `npm run lint` | oxlint |
| `npm test` | Vitest unit/component tests (no network) |

Optional contract check against a running backend (skipped by default):

```powershell
$env:LIVE_API_URL="http://127.0.0.1:8099/api/v1"; npm test
```

The backend must accept the tokens `staff-a`, `manager-a`, `staff-b`, `customer1` (the backend's test token verifier does; real Firebase does not).

## Counter hardware notes

* Camera scanning needs HTTPS (or `localhost`) and camera permission; the app falls back to the keypad and a "handheld scanner" text box (USB barcode scanners type the QR text and press Enter).
* The new-order chime needs one click/tap on the page first (browser autoplay rules). The header toggle turns it on/off.

## Deploy

The app builds to static files; `VITE_*` values are baked in at build time.

**Firebase Hosting**

```powershell
npm run build
firebase init hosting      # public dir: dist, single-page app: yes
firebase deploy --only hosting
```

**Cloud Run (static, nginx)**

```powershell
gcloud run deploy quickpick-store-dashboard --source . --region asia-south1 --allow-unauthenticated `
  --set-build-env-vars "VITE_API_BASE_URL=https://<api-url>/api/v1,VITE_FIREBASE_API_KEY=...,VITE_FIREBASE_AUTH_DOMAIN=...,VITE_FIREBASE_PROJECT_ID=...,VITE_FIREBASE_APP_ID=..."
```

(or `docker build --build-arg VITE_API_BASE_URL=... -t store-dashboard .`; the `Dockerfile` serves `dist/` with nginx on `$PORT`). `--allow-unauthenticated` only serves the static files; every API call still needs a Firebase token. Afterwards add the app's domain to Firebase Auth "Authorized domains" and to the backend's `CORS_ALLOW_ORIGINS`. The Docker build has not been run on this machine.
