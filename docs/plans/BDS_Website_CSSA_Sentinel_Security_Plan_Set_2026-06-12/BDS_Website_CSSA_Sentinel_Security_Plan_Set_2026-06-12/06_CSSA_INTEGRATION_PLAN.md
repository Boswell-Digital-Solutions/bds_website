# CSSA Integration Plan

## 1. Position

CSSA sits between every route handler and every outbound cloud call.

```text
HTTP handler
→ CloudActionRequest
→ CloudSecurityGate
→ CloudActionAuthorization persisted
→ GovernedEgressBroker
→ approved adapter
→ CloudActionOutcome persisted
```

Sentinel is asynchronous and is never called to authorize the current request.

## 2. Website CSSA modules

```text
server/security/
  contracts.ts
  identity.ts
  registry.ts
  policy.ts
  classifier.ts
  reservations.ts
  gate.ts
  recorder.ts
  outbox.ts
  egress.ts
  controls.ts
  events.ts
  status.ts
  adapters/
    forgecustomer.ts
    supabase.ts
    intake.ts
    dataforge.ts
```

Only `egress.ts` and approved adapters may instantiate outbound network calls.

## 3. Identity model

### Anonymous catalog

```json
{
  "principal": {"kind": "anonymous", "id": null},
  "executor": {"kind": "service", "id": "bds-website-bff"},
  "delegation": null
}
```

### Customer action

```json
{
  "principal": {
    "kind": "customer",
    "id": "verified-subject",
    "tenant_id": "verified-account-scope"
  },
  "executor": {
    "kind": "service",
    "id": "bds-website-bff",
    "app_id": "bds_website"
  },
  "delegation": {
    "type": "supabase-session",
    "scope": ["forgecustomer:customer"],
    "expires_at": "verified-exp"
  }
}
```

Request-body identity is descriptive only.

## 4. Cloud surface registry

| Surface | Upstream | Actions |
|---|---|---|
| `forgecustomer.catalog` | ForgeCustomer | products, plans, entitlement keys |
| `forgecustomer.account` | ForgeCustomer | provision, account, subscriptions, licenses |
| `forgecustomer.devices` | ForgeCustomer | installations, devices, deactivate |
| `forgecustomer.usage` | ForgeCustomer | usage, current entitlements |
| `forgecustomer.checkout` | ForgeCustomer | checkout creation |
| `forgecustomer.deletion` | ForgeCustomer | request, read, cancel |
| `supabase.auth` | Supabase | login, signup, callback, refresh, logout, magic link |
| `bds.intake` | Intake | consultation submission |
| `dataforge.security` | DataForge | evidence and outbox writes |

Unknown surfaces fail startup and runtime.

## 5. Action registry

| CSSA action | Auth | Class | Max body | Idempotency | Extra control |
|---|---|---:|---:|---|---|
| `catalog.products.read` | public | R0 | 0 | forbidden | rate limit |
| `catalog.plans.read` | public | R0 | 0 | forbidden | rate limit |
| `account.provision` | customer | R2 | 4 KiB | optional | exact Origin |
| `account.read` | customer | R2 | 0 | forbidden | no-store |
| `subscription.read` | customer | R2 | 0 | forbidden | no-store |
| `license.read` | customer | R2 | 0 | forbidden | no-store |
| `installation.read` | customer | R2 | 0 | forbidden | no-store |
| `installation.deactivate` | customer | R2 | 4 KiB | required | recent auth |
| `usage.read` | customer | R2 | 0 | forbidden | no-store |
| `checkout.create` | customer | R2 | 8 KiB | required | strict persistence |
| `deletion.request` | customer | R3 | 8 KiB | required | step-up |
| `deletion.read` | customer | R2 | 0 | forbidden | no-store |
| `deletion.cancel` | customer | R3 | 4 KiB | required | step-up |
| `intake.consultation.create` | anonymous | R2/R3 | 32 KiB | required | Turnstile |

## 6. Decision sequence

1. Validate edge and origin.
2. Match local route policy.
3. Resolve principal, executor, and delegation.
4. Validate JWT/session.
5. Validate same-origin/CSRF.
6. Parse and validate request.
7. Classify data.
8. Evaluate entitlement and action policy.
9. Reserve rate/quota capacity atomically.
10. Verify exact destination.
11. Build request digest.
12. Persist immutable authorization.
13. Atomically consume authorization in egress.
14. Execute with timeout and response cap.
15. Commit or release reservation.
16. Persist outcome.
17. Emit Sentinel evidence.

## 7. Contracts

### `CloudSecurityDecision.v1`

The full deterministic decision and policy versions.

### `CloudActionAuthorization.v1`

Written before execution and bound to principal, executor, account, app, action, destination, method, request digest, classification, policy bundle, expiry, and single-use state.

### `CloudActionOutcome.v1`

Records execution state, upstream status, response digest/class, bytes, duration, reservation commit, error, and retry count.

### `CloudSecurityFinding.v1`

Deterministic CSSA watchdog finding for replay, integrity failure, bypass, recorder backlog, or reservation leakage.

## 8. Recorder behavior

Strict write-before-execute for:

- checkout
- deletion actions
- device deactivation
- R3 intake
- authentication/session mutation
- any external side effect

Use a durable encrypted outbox when DataForge is unavailable. An in-memory queue is insufficient.

## 9. No-side-door rule

CI fails when `fetch`, `http`, `https`, `undici`, WebSocket, provider SDK, or subprocess network use occurs outside approved egress modules.

Move the current direct BFF `fetch()` into governed egress.

## 10. Modes

```text
OFF      tests/local development only
SHADOW   evaluate and record without changing runtime result
CANARY   enforce a deterministic subset
ACTIVE   enforce every registered surface
```

Production never uses OFF.

## 11. Sentinel return path

CSSA accepts only signed `CloudSecurityControlDirective.v1`, never raw incidents.

Initial allowlisted controls:

- require Turnstile
- lower one route limit
- hold one customer/action
- hold checkout for one account
- require reauthentication
- deny one destination/provider
- increase logging for a bounded period

Every control has exact scope, expiry, use count, reason, approval, rollback, and signature.
