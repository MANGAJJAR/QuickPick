# Putting QuickPick on the internet (beginner guide)

This guide takes you from "it runs on my laptop" to two public links you can send to anyone:

- **Customer app**: `https://<your-project-id>.web.app`
- **Store dashboard**: `https://<your-project-id>-store.web.app`

You do not need to know Docker, servers or cloud computing. Every command below can be copied as it is.
Anything in `<angle brackets>` is something you replace with your own value.

---

## 0. Pick your path

| | **Path A: Demo (mock mode)** | **Path B: Full (real backend)** |
|---|---|---|
| What visitors see | The same apps with built-in demo data and "Continue as demo" buttons | The real thing: real login, real database, real orders |
| Backend needed | No | Yes (Google Cloud Run) |
| Costs | Free | Free for light use, but needs a billing card on file |
| Time | about 15 minutes | 1 to 2 hours the first time |
| Good for | A live link **today**, the pitch video, judges who just want to click | Showing it really works |

**My advice:** do Path A first. It gives you a working link quickly. Then do Path B when you have time. If Path B goes wrong, Path A still stands.

### How the pieces fit together (Path B)

```
 Visitor's browser
        |
        v
 Firebase Hosting  ---->  your two websites (customer app, store dashboard) + product photos
        |
        |  any address starting with /api  is forwarded to...
        v
 Google Cloud Run  ---->  your backend (the FastAPI code in the backend folder)
        |
        v
 Firestore (database)      Firebase Authentication (logins)
```

Because Hosting forwards `/api` to the backend, the websites and the API share one web address. That avoids a whole class of browser security errors (CORS).

---

## 1. One-time preparation

### 1.1 What you already have
- **Node.js**: you already use it for the apps. Nothing to install.
- **The Firebase tool**: the scripts run it for you (`npx firebase-tools`). Nothing to install.

### 1.2 What you need for Path B only: the Google Cloud CLI (`gcloud`)
1. Open https://cloud.google.com/sdk/docs/install and download the **Windows installer**.
2. Run it and accept the defaults. At the end, keep "Run gcloud init" **unticked** (we do that ourselves).
3. **Close every PowerShell window and open a new one.** (Windows only notices new programs in new windows.)
4. Check it works:
```powershell
gcloud --version
```
   You should see a few lines starting with `Google Cloud SDK`.
5. Sign in. A browser window opens; pick the Google account that will own the project:
```powershell
gcloud auth login
```

### 1.3 If PowerShell refuses to run the scripts
Windows sometimes blocks scripts with a red message mentioning "execution policy". Fix it for the current window only (nothing permanent changes):
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
Then run the script again.

---

## 2. Create your Firebase project (both paths)

1. Go to https://console.firebase.google.com and sign in.
2. Click **Create a project** (or "Add project").
3. Name it, for example `quickpick-demo`. Underneath the name Firebase shows a **Project ID** such as `quickpick-demo-4f2a1`. **Write this down. It is the `<project-id>` used everywhere below.** (It is not always the same as the name.)
4. Turn **Google Analytics off** (you don't need it) and click **Create project**. Wait until it says "Your new project is ready".

> Use a project that exists only for this demo. The seed step overwrites stores and products in its database.

---

## 3. Path A: demo links in about 15 minutes

Open PowerShell in the QuickPick folder:
```powershell
cd "C:\Users\Yash Gajjar\Desktop\QuickPick"
```
Run (replace `<project-id>`):
```powershell
.\deploy\hosting.ps1 -ProjectId <project-id> -Mode mock
```

What happens, in order:
1. It builds both apps (about a minute). It prints `Product photos in the customer build: 93`.
2. A browser window opens asking you to sign in to Firebase. Sign in and allow access. (Only the first time.)
3. It creates the second website for the dashboard and uploads both.
4. It prints your two links.

Open them:
- Customer app: click **Continue as demo customer**.
- Dashboard: click **Sign in as store manager**.

**If you see "Hosting site not found" or similar:** in the Firebase console open **Build > Hosting**, click **Get started**, click Next through the screens, then run the command again.

That is Path A done. The demo data lives inside the apps, so there is nothing else to set up.

---

## 4. Path B: the real thing

Do these in order. Each step says how to know it worked.

### B1. Turn on billing (Blaze plan)
Cloud Run (which runs your backend) needs a billing account. For light use you will pay nothing, because the free allowance is generous, and Cloud Run costs nothing while nobody is using it.

1. In the Firebase console, bottom left, click **Upgrade** next to the plan name, choose **Blaze**, and add a card.
2. **Set a budget alert so you can never be surprised.** Go to https://console.cloud.google.com/billing, open **Budgets & alerts**, **Create budget**, set a small amount (for example 500 rupees) and keep the default email alerts on.

### B2. Create the database (Firestore)
1. In the Firebase console: **Build > Firestore Database > Create database**.
2. Choose **Production mode** (safe: only your backend can touch the data).
3. Location: **asia-south1 (Mumbai)**. **You cannot change this later.** It must match the backend region used below.
4. Click **Enable**.

### B3. Turn on logins
1. **Build > Authentication > Get started**.
2. **Sign-in method** tab > **Email/Password** > switch **Enable** on > **Save**.

### B4. Get your website's Firebase keys
1. Click the **gear icon** (top left) > **Project settings**.
2. Scroll to **Your apps** and click the **`</>`** (web) icon.
3. Nickname: `quickpick-web`. Leave "Firebase Hosting" **unticked**. Click **Register app**.
4. You will see a block of code with `apiKey`, `authDomain`, `projectId`, `appId`. **Copy `apiKey` and `appId`** into a notepad.
   These are public by design (every visitor's browser gets them), so they are not secrets. The backend, not these keys, protects your data.

### B5. Deploy the backend
Make sure you did step 1.2 (installed `gcloud` and signed in). Then:
```powershell
cd "C:\Users\Yash Gajjar\Desktop\QuickPick"
.\deploy\backend.ps1 -ProjectId <project-id>
```
This takes **5 to 10 minutes** the first time. It does all of this for you:
1. Turns on the Google services the backend needs.
2. Makes sure the database exists.
3. Creates a limited "account" for the backend (it can use the database and read its two secrets, nothing else).
4. Creates two random secrets: one for signing pickup QR codes, one that protects the scheduled job. You never see or store them.
5. Builds and starts the backend on Cloud Run (Google builds it for you; no Docker needed).
6. Creates a job that runs **every minute** to release orders nobody accepted or collected.
7. Checks that the backend answers.

**It worked when** the last lines show `GET /health -> {"success":true...}` and `Done. The API is live at https://quickpick-api-...run.app`.

If it fails, jump to the troubleshooting table at the end.

### B6. Put the database rules and indexes in place
```powershell
npx firebase-tools deploy --only firestore --project <project-id>
```
- The **rules** make the database refuse direct access from browsers (only your backend may touch it).
- The **indexes** are shortcuts Firestore needs for some of the backend's searches. **They take a few minutes to build after this command finishes.** Until they are ready, some screens (order lists, queue) can show an error like "the query requires an index". Wait 5 minutes and try again.

### B7. Load the demo stores and products
```powershell
.\deploy\seed.ps1 -ProjectId <project-id>
```
- A browser window opens the first time to sign you in. Use the same Google account.
- It asks you to type the project id again to confirm. That is on purpose, because it writes to the live database.
- It adds 17 Ahmedabad stores and 93 products.

### B8. Deploy the websites in real mode
Use the `apiKey` and `appId` you copied in step B4:
```powershell
.\deploy\hosting.ps1 -ProjectId <project-id> -Mode real -ApiKey <your-apiKey> -AppId <your-appId>
```
When it finishes it prints the two links.

### B9. Create your users
**A customer:** open the customer link, choose **Create account**, and sign up. That is all.

**A store manager (for the dashboard):**
1. In the Firebase console: **Build > Authentication > Users > Add user**. Enter an email and a password.
2. Give that user the manager role for one store:
```powershell
.\deploy\seed.ps1 -ProjectId <project-id> -SkipSeed -Email <manager-email> -Role STORE_MANAGER -StoreId store-a
```
3. Open the dashboard link and sign in with that email. (If you were already signed in, sign out and in again.)

For counter staff with fewer rights use `-Role STORE_STAFF`. Store ids: `store-a`, `store-b`, and so on (see the Stores list in the customer app).

### B10. Try everything (5-minute checklist)
- [ ] Customer app opens; stores are listed; product photos show.
- [ ] Sign up, add items, choose **Pickup**, place the order.
- [ ] Dashboard (manager): the order appears on the Orders board. Accept it, start preparing, mark ready.
- [ ] Customer app: the order page shows the pickup QR code and OTP.
- [ ] Dashboard > **Pickup counter**: type the OTP. The order completes.
- [ ] Place a **Delivery** order too and walk it through "Send with rider" and "Mark delivered".
- [ ] Dashboard > Overview > set **Rider supply** to "Very low" and see the "Riders are busy" offer on the customer side (allow location in the browser).

---

## 5. Changing something later and redeploying

| You changed... | Run |
|---|---|
| Anything in the customer app or dashboard | `.\deploy\hosting.ps1 -ProjectId <project-id> -Mode real -ApiKey <key> -AppId <appId>` |
| Anything in the backend folder | `.\deploy\backend.ps1 -ProjectId <project-id>` |
| `backend\firestore.indexes.json` or `firestore.rules` | `npx firebase-tools deploy --only firestore --project <project-id>` |
| Product photos | add the file as `frontend\customer-app\public\products\<product-id>.webp`, then run the hosting command |

Browsers can keep the old version for a short time. Press **Ctrl + F5** to force a fresh copy. If you replace a product photo, give the new file a **new name**, because browsers remember photos for a month.

---

## 6. Costs and safety

- With a few users this should cost **nothing or a few rupees**. The budget alert (B1) will email you if that changes.
- **To stop everything and stop all charges:** Google Cloud console > select the project > **IAM & Admin > Settings > Shut down**.
- Never commit passwords, keys or `.env` files. The `.gitignore` files already block `.env`. `.env.production` is safe because it only holds blanks.
- Anyone can open your live links. Only people with accounts can place orders, and only users you gave a store role can use the dashboard.

---

## 7. When something goes wrong

| What you see | What it means and what to do |
|---|---|
| `gcloud : The term 'gcloud' is not recognized` | Close PowerShell, open a **new** window (step 1.2). If still missing, run the installer again. |
| `cannot be loaded because running scripts is disabled` | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` (step 1.3), then retry. |
| `Billing account for project ... is not found` / "requires billing" | Do step B1 (Blaze plan). |
| Backend deploy fails with `Permission denied`/`PERMISSION_DENIED` while building | In https://console.cloud.google.com/iam-admin/iam find the account ending `-compute@developer.gserviceaccount.com` and add the roles **Cloud Build Service Account**, **Storage Object Viewer** and **Artifact Registry Writer**. Run `backend.ps1` again. |
| `Hosting site not found` | Firebase console > Build > Hosting > Get started, click through, run again. |
| The website loads but every list is empty or shows "Something went wrong" (Path B) | The backend is not reachable. Check `https://<api-url>/health` in a browser. Check that the service name `quickpick-api` and region `asia-south1` match `firebase.json`, and that you ran the hosting script with `-Mode real`. |
| "The query requires an index" | The indexes from step B6 are still building. Wait 5 to 10 minutes. |
| Dashboard says your account "doesn't have a store staff role" | Do step B9 and then **sign out and in again**. |
| `auth/api-key-not-valid` or login does nothing | The `-ApiKey` or `-AppId` was wrong. Copy them again from Project settings > Your apps and redeploy the websites. |
| Product photos are missing | They live in `frontend\customer-app\public\products` (93 files). The hosting script prints how many were built. |
| Orders never expire | Check Cloud Scheduler (console > Cloud Scheduler): the job `quickpick-expire-orders` should exist and succeed every minute. |
| You still see the old version after deploying | Press Ctrl + F5. |

---

## 8. What was and was not tested

Tested here: the two JSON configuration files are valid, the three PowerShell scripts parse, both apps build in demo and real mode from the script, the build contains all 93 product photos, and the production build contains **none** of your local development settings (I checked this on purpose: the first try leaked the local emulator address into the build, which would have broken login on the live site, and it is now fixed and guarded by an automatic check).

**Not tested** (it needs your Google account, so I could not run it): the `gcloud` commands, the Cloud Run deploy, the Cloud Scheduler job, the Hosting forwarding of `/api` to Cloud Run, and the real Firebase login. Expect to fix one small thing the first time. The troubleshooting table lists the likely ones.

Push notifications to a closed app (FCM) and the Gemini assistant are not part of this deployment.
