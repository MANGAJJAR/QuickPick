# Authentication & authorization

## Authentication
* Clients send `Authorization: Bearer <Firebase ID token>`.
* `FirebaseTokenVerifier` verifies signature, expiry, audience and issuer with the Firebase Admin SDK (in a worker thread). Failure → `401 unauthorized`.
* Identity (`uid`), **role** and **store_id** are read only from the verified token. No request body, query, path or header value is ever used to decide role or store ownership (tested: a body containing `role: ADMIN` is ignored).
* A missing or unknown `role` claim degrades to `CUSTOMER` (least privilege). A `store_id` claim is honoured only for `STORE_STAFF`/`STORE_MANAGER`.

## Role matrix

| Endpoint group | CUSTOMER | STORE_STAFF | STORE_MANAGER | ADMIN |
|---|---|---|---|---|
| `/api/v1/customers/*`, `/api/v1/customer/*` | ✅ | ❌ | ❌ | ❌ |
| `/api/v1/store/*` read, orders, pickup, inventory create/update, status | ❌ | ✅ | ✅ | ❌ |
| `PATCH /store/me`, `PATCH /store/me/pickup-settings`, `DELETE /store/inventory/{id}` | ❌ | ❌ | ✅ | ❌ |
| `/health`, `/ready`, `/api/v1/health` | public | public | public | public |

`ADMIN` has no application endpoints yet (admin work is done through scripts). Store endpoints additionally require a `store_id` claim, otherwise `403 store_claim_missing`.

## Store-level authorization
Every store service method takes `store_id` from the token and scopes the query or transaction to it:
* orders: loaded, then compared to the caller's store → mismatch is `404` (indistinguishable from "does not exist"); the lifecycle transaction re-checks the scope.
* inventory: document ids are built from the caller's `store_id`, so another store's row is unreachable.
* pickup verification: the verification's and order's `store_id` must equal the staff member's → `403 credential_wrong_store` (audited).

## Customer ownership
Customer reads/cancels/credential requests compare `order.customer_id` to the token uid; others get `404`.

## Role provisioning
Roles are custom claims set by an operator with the Admin SDK — never by the API:

```powershell
python -m scripts.set_role --uid <firebase-uid> --role STORE_STAFF --store-id store-a
python -m scripts.set_role --uid <firebase-uid> --role STORE_MANAGER --store-id store-a
python -m scripts.set_role --uid <firebase-uid> --role ADMIN
```

The user must refresh their ID token (sign out/in, or `getIdToken(true)`) for new claims to apply. The script needs Admin credentials (ADC); run it from a trusted machine or Cloud Shell. Customers need no provisioning (default role).

## Not yet covered
Token revocation checks (`check_revoked`), rate limiting, App Check, and an admin API.
