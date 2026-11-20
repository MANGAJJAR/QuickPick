# QuickPick customer app

Mobile-first web app for QuickPick customers: find a nearby dark store, build a cart, see what you save by picking up, track the order and show a QR code at the counter. React 18 + Vite + TypeScript (strict) + Tailwind v4, TanStack Query, React Router, Firebase Auth, Leaflet/OpenStreetMap.

Screens, API calls and limitations: [../../docs/CUSTOMER_FRONTEND.md](../../docs/CUSTOMER_FRONTEND.md).

## Setup

```powershell
cd frontend/customer-app
npm install
copy .env.example .env      # then edit
npm run dev                 # http://localhost:5173
```

### Environment (`.env`)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend base URL **including** `/api/v1` (default `http://localhost:8080/api/v1`) |
| `VITE_USE_MOCKS` | `true` = in-browser fake backend + one-click demo login (no backend, no Firebase). Default `false` |
| `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID` | Firebase web app config (public values, but keep them out of git) |
| `VITE_FIREBASE_AUTH_EMULATOR_URL` | Optional, e.g. `http://localhost:9099` |

Real mode needs the backend running (see `backend/docs/DEVELOPMENT_GUIDE.md`), CORS allowing `http://localhost:5173` (`CORS_ALLOW_ORIGINS` on the backend), and users created in Firebase Auth. New sign-ups are customers by default.

### Mock mode

```powershell
$env:VITE_USE_MOCKS="true"; npm run dev
```

A yellow banner is shown the whole time. Orders advance automatically (accepted 5s, preparing 12s, ready 22s); on the order page a "Simulate store scan" button completes the pickup.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build into `dist/` |
| `npm run typecheck` | `tsc` only |
| `npm run lint` | oxlint |
| `npm test` | Vitest unit/component tests (no network) |

Contract check against a running backend (optional, skipped by default):

```powershell
$env:LIVE_API_URL="http://127.0.0.1:8099/api/v1"; $env:LIVE_TOKEN="customer1"; $env:LIVE_STAFF_TOKEN="staff-a"; npm test
```

The backend must accept those tokens (the backend's test verifier does; real Firebase does not).

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
gcloud run deploy quickpick-customer-app --source . --region asia-south1 --allow-unauthenticated `
  --set-build-env-vars "VITE_API_BASE_URL=https://<api-url>/api/v1,VITE_FIREBASE_API_KEY=...,VITE_FIREBASE_AUTH_DOMAIN=...,VITE_FIREBASE_PROJECT_ID=...,VITE_FIREBASE_APP_ID=..."
```

(or `docker build --build-arg VITE_API_BASE_URL=... -t customer-app .`; the `Dockerfile` serves `dist/` with nginx on `$PORT`). After deploying, add the app's domain to Firebase Auth "Authorized domains" and to the backend's `CORS_ALLOW_ORIGINS`. The Docker build has not been run on this machine.
