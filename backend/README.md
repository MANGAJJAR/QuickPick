# QuickPick backend

FastAPI + Firestore backend for QuickPick, a self-pickup layer for quick-commerce dark stores. Built for the Google Startup Buildathon 2026. Zepto/Blinkit/Instamart are **simulated** — no third-party integrations exist or are claimed.

```powershell
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
python -m pytest -q            # no credentials needed
```

Docs (`docs/`): [ARCHITECTURE](docs/ARCHITECTURE.md) · [DATABASE_SCHEMA](docs/DATABASE_SCHEMA.md) · [API_CONTRACTS](docs/API_CONTRACTS.md) · [AUTHORIZATION](docs/AUTHORIZATION.md) · [ORDER_LIFECYCLE](docs/ORDER_LIFECYCLE.md) · [MODULE_OWNERSHIP](docs/MODULE_OWNERSHIP.md) · [DEVELOPMENT_GUIDE](docs/DEVELOPMENT_GUIDE.md) (setup, git workflow, Cloud Run) · [CUSTOMER_MODULE](docs/CUSTOMER_MODULE.md) · [DARK_STORE_MODULE](docs/DARK_STORE_MODULE.md)

## Status

**Working and tested (in-memory Firestore fake):** config/logging/errors, Firebase token verification wiring, role + store-level authorization, shared models and lifecycle, atomic inventory ledger, idempotent order creation, cancellation/reject with stock release, QR/OTP pickup verification (replay, expiry, cross-store, lockout, concurrency), discount engine + checkout preview, store inventory/order/pickup/queue endpoints, analytics overview, seed and role-provisioning scripts, **delivery option** (customer chooses delivery or pickup; store dispatch/deliver), **"riders are busy" walk-in discount** driven by weather, rush hour and a simulated rider-supply feed, **auto-expiry of uncollected orders** (stock released, both sides notified), **customer arrival signal** ("5 min away" / "I'm here"), customer + store **notifications** and device registration for push.

**Not implemented (not stubbed, routes absent):** cart (4 endpoints), analytics daily/performance, Gemini chat assistant, store suitability scoring, Smart-discount AI engine (mock engine only).

**Not verified:** a live rider-supply feed (rider supply is simulated; weather is live from Open-Meteo), FCM push delivery (needs a Firebase project with messaging), behaviour against the real Firestore emulator/production (transaction contention and index requirements), real Firebase ID tokens, the Docker image build, Cloud Run deployment.
