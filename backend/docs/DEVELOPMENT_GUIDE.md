# Development guide

## Setup (Windows / PowerShell)
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
copy .env.example .env
```

## Tests (no Firebase credentials needed)
```powershell
python -m pytest -q
```

## Run locally
Option A — Firestore emulator + your own Firebase dev project for auth:
```powershell
# terminal 1: Firestore emulator (needs gcloud + Java) or `docker compose up firestore`
gcloud emulators firestore start --host-port=localhost:8081
# terminal 2
$env:FIRESTORE_EMULATOR_HOST="localhost:8081"; $env:GCP_PROJECT_ID="quickpick-dev"
python -m scripts.seed_dev_data        # simulated stores/products/inventory
uvicorn app.main:app --reload --port 8080
```
Auth needs Firebase: either the Auth emulator (`npx firebase-tools emulators:start --only auth`, then `$env:FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"`) or a dev project with `gcloud auth application-default login`. Create users in the emulator UI, then give them roles:
```powershell
python -m scripts.set_role --uid <uid> --role STORE_STAFF --store-id store-a
```
Option B — everything in Docker: `docker compose up --build` (starts the Firestore emulator and the API; auth emulator on the host at 9099).

Check: `curl localhost:8080/health`, open `http://localhost:8080/docs`.

## Writing code
* Routes only parse input, call a service and return `ok(...)`. Business rules live in services, Firestore in repositories.
* Money is `Decimal`/`Money`; never `float`. Timestamps are `utc_now()`.
* Any multi-document change uses `run_in_transaction` with **reads first, writes after**, and never queries inside it. Stock changes go through `InventoryLedger`; status changes through `OrderLifecycleService`.
* If a failure must persist (counters, audit), return an outcome and raise after commit.
* Add tests with the fake DB (`tests/conftest.py` fixtures: `client`, `db`, `settings`; tokens `customer1`, `staff-a`, `manager-a`, `staff-b`, …). The fake rejects non-storable values, so serialisation bugs surface.
* Run `python -m pytest -q` before every commit; PRs need green tests.

## Git workflow
```
main (protected)  <-  dev (integration)  <-  feature/core-foundation
                                          <-  feature/customer-module   (Dev 1)
                                          <-  feature/dark-store-module (Dev 2)
```
```powershell
git checkout dev; git pull
git checkout -b feature/customer-module     # or feature/dark-store-module
# work, test, commit
git push -u origin feature/customer-module  # open PR -> dev
git fetch origin; git rebase origin/dev     # keep your branch current
```
Never push to `main`; merge `dev` into `main` by PR when the demo build is green. Protect `main` (and ideally `dev`) in GitHub: Settings → Branches → require PR + passing checks.

## Deploying to Cloud Run
Prerequisites: a GCP project with Firestore (Native mode), Firebase Authentication enabled, and billing.
```powershell
$PROJECT="your-project-id"; $REGION="asia-south1"
gcloud config set project $PROJECT
gcloud services enable run.googleapis.com firestore.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

# secrets (never in the repo)
python -c "import secrets; print(secrets.token_urlsafe(48))" | gcloud secrets create pickup-token-secret --data-file=-

# runtime service account with least privilege
gcloud iam service-accounts create quickpick-api
$SA="quickpick-api@$PROJECT.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role="roles/datastore.user"
gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role="roles/firebaseauth.viewer"
gcloud secrets add-iam-policy-binding pickup-token-secret --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"

# indexes
firebase deploy --only firestore:indexes --project $PROJECT

# build + deploy from source (uses the Dockerfile)
gcloud run deploy quickpick-api --source . --region $REGION --service-account $SA `
  --allow-unauthenticated `
  --set-env-vars "ENVIRONMENT=production,GCP_PROJECT_ID=$PROJECT" `
  --set-secrets "PICKUP_TOKEN_SECRET=pickup-token-secret:latest"
```
`--allow-unauthenticated` only opens the network door; every API route still requires a Firebase ID token. Verify with `curl https://<service-url>/ready`. Use the same Firebase/GCP project that issues your client tokens (the Admin SDK validates the token audience against `GCP_PROJECT_ID`). Add `GEMINI_API_KEY` the same way when the AI module is built.
