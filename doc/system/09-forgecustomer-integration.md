# 9. ForgeCustomer Integration

## Role and Boundary

ForgeCustomer (repo: `Boswecw/forgecustomer`, Rust/Axum) is the authority for
customer identity, commerce, licensing, entitlements, installations, and usage
for Boswell Digital Solutions products. AuthorForge is the first product.

The website is a pure **customer-surface client**: it renders state ForgeCustomer
owns and never holds commercial truth itself. It only ever calls the public
**customer** endpoints (`/v1/...`) with the signed-in user's own Supabase access
token. It never touches `/v1/admin/*` (that belongs to Forge Command) and never
holds the Supabase service-role key, any Stripe secret, or any operator
credential.

## Why a Server-Side BFF

ForgeCustomer currently exposes **no CORS layer**, so the browser must not call
it directly. Every ForgeCustomer request is routed through this site's own
server — a backend-for-frontend (BFF) proxy in `server/forge.ts`, wired into
`dev-server.ts`. The proxy forwards the user's Supabase access token per request
and marks every response `Cache-Control: no-store`, so one user's response is
never cached for another.

### Request path

```
Browser (Supabase session)
  → fetch /api/forge/v1/...  (Authorization: Bearer <user jwt>)
    → BFF proxy (server/forge.ts)   [allowlist check, token forwarded]
      → FORGECUSTOMER_API_BASE/v1/...
```

### Allowlist

`server/forge.ts` holds an explicit allowlist of `(method, path)` pairs. Anything
not on the list — notably every `/v1/admin/*` route and any operator surface — is
rejected with a `404 NOT_FOUND` before any upstream request is made. Public
catalog endpoints (`/v1/products`, `/v1/plans`, `/v1/entitlements/keys`) are the
only routes the proxy will forward without a user token.

## Configuration (env)

| Variable | Scope | Purpose |
|----------|-------|---------|
| `FORGECUSTOMER_API_BASE` | server only | ForgeCustomer base URL, e.g. `https://api.forgecustomer.example` |
| `SUPABASE_URL` | public | Supabase project URL, reused for login |
| `SUPABASE_ANON_KEY` | public | Supabase anon/publishable key, reused for login |

The two Supabase values are public and reach the browser through
`GET /api/public-config`. No secret is ever exposed there. ForgeCustomer
validates JWTs from the same Supabase project. See `.env.example`.

## Error Contract

Every non-2xx ForgeCustomer response carries:

```json
{ "error": { "code": "...", "message": "...", "correlation_id": "...", "details": {} } }
```

Handling is centralized in `src/js/forge/errors.js` (`describeForgeError`). The
`correlation_id` is logged with every error — server-side in the proxy and
client-side in the error parser — so support can trace it.

| Status / code | UX treatment |
|---------------|--------------|
| 401 `UNAUTHENTICATED` / `TOKEN_EXPIRED` | refresh the session once and retry; on repeat, sign out and re-login |
| 403 `CUSTOMER_SUSPENDED` | redirect to `/account/suspended.html` |
| 403 `FORBIDDEN` (closed / unprovisioned) | sign out, redirect to `/account/closed.html` |
| 403 `REVOKED` | distinct inline message + support contact (never self-serviceable) |
| 402 `QUOTA_EXCEEDED` | upsell to `/pricing.html` (details carry `limit` + `used`) |
| 402 `DEVICE_LIMIT_REACHED` | prompt to remove a device (details carry `limit` + `used`) |
| 422 `VALIDATION_FAILED` | field-level message (`details.field` names the input) |
| 409 `CONFLICT` | conflict message, refresh and retry |

## Flows

### 1. Provision on first sign-in

`src/js/forge/session.js` `bootstrapSession()` runs before any other call on an
authenticated page. It ensures `POST /v1/account/provision` has run once per
session (idempotent server-side; returns `created: false` on repeat), passing an
optional best-effort timezone hint.

### 2. Pricing → Stripe Checkout

`pricing.html` + `src/js/forge/pricing.js` render the public catalog. The free
baseline plan (`authorforge_included`) is not checkout-able. The paid plan
(`authorforge_pro`) starts checkout via `POST /v1/checkout` (with an
`Idempotency-Key`), then the browser is sent to the returned `checkout_url`.

### 3. Checkout success — poll, never trust the redirect

`checkout/success.html` + `src/js/forge/checkout-success.js` only say "payment
received, activating…" and poll `GET /v1/subscriptions` until the webhook-driven
projection shows `grants_cloud: true`. On timeout it shows "this can take a
minute" with a manual refresh. **The UI is never flipped to active based on the
redirect alone.**

### 4. Account dashboard (reads)

`account.html` + `src/js/forge/account.js` render, read-only:

- `GET /v1/account` — identifiers
- `GET /v1/subscriptions` — status, `grants_cloud`, `current_period_end`, `cancel_at_period_end`
- `GET /v1/licenses` — `status`, `device_limit`, `active_devices`
- `GET /v1/installations` — status / last heartbeat, with
  `POST /v1/installations/{id}/deactivate` to free a device slot
- `GET /v1/usage/current` — per-meter usage bars (the website never writes usage)

### 5. Account deletion

`src/js/forge/deletion.js` (in the account page) drives the deletion lifecycle:
`POST /v1/account/deletion-request`, `GET` the latest, and
`POST /v1/account/deletion-request/cancel`. It renders every state —
requested / verified / cooling_off (cancellable, shows `cooling_off_until`) /
processing (cancel disabled, point of no return) / completed / rejected /
canceled. After completion the API returns 403 for the account and the user is
signed out gracefully and sent to `/account/closed.html`.

## Module Map

| File | Responsibility |
|------|----------------|
| `server/forge.ts` | BFF proxy: allowlist, token forwarding, `no-store`, correlation-id logging, public-config |
| `src/js/forge/config.js` | Fetch public config (`/api/public-config`) |
| `src/js/forge/supabase.js` | Supabase client + session/token helpers |
| `src/js/forge/errors.js` | Error contract → typed `ForgeError` + UX mapping |
| `src/js/forge/api.js` | BFF client with 401 refresh-and-retry; typed endpoint wrappers |
| `src/js/forge/session.js` | Session bootstrap + provision-once + central error redirect |
| `src/js/forge/login.js` | Login / sign-up / magic-link controller |
| `src/js/forge/pricing.js` | Catalog render + checkout start |
| `src/js/forge/checkout-success.js` | Activation polling |
| `src/js/forge/account.js` | Dashboard reads + device deactivation |
| `src/js/forge/deletion.js` | Deletion lifecycle |
