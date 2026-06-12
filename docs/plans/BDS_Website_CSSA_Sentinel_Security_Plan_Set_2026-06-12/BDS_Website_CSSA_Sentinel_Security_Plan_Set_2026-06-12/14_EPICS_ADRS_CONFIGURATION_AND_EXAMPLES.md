# Epics, ADRs, Configuration, and Examples

# Part I — Epics

## BDS-SEC-000 Architecture lock

**Acceptance:** Authority, edge, origin, CSSA, Sentinel, session, signing, outbox, and data boundaries are accepted.

## BDS-SEC-010 Origin firewall

**Acceptance:** Exact Host, edge token, disabled Render subdomain, route manifest, limits, deadlines, and headers pass.

## BDS-SEC-020 Edge WAF

**Acceptance:** Managed/custom WAF, rate limits, Turnstile, event export, and rollback operate.

## BDS-SEC-030 CSP and supply chain

**Acceptance:** No inline scripts, fonts and Supabase self-hosted, strict CSP enforced, lock/SBOM/scans present.

## BDS-SEC-040 Route contracts

**Acceptance:** Every BFF route has closed request/query/response schemas, byte limit, idempotency, class, and CSSA action.

## BDS-SEC-050 CSSA kernel

**Acceptance:** Contracts, registry, identity, classifier, policy, recorder, outbox, egress, and no-side-door tests exist.

## BDS-SEC-060 Session security

**Acceptance:** HttpOnly session, CSRF, rotation, revocation, step-up, MFA/passkey path, and abuse controls.

## BDS-SEC-070 Intake security

**Acceptance:** Same-origin intake, server-side Turnstile, schemas, rate limits, classification, and quarantine.

## BDS-SEC-080 Sentinel evidence

**Acceptance:** Edge, Bun, CSSA, identity, ForgeCustomer, intake, and deployment evidence replays.

## BDS-SEC-090 Sentinel incidents

**Acceptance:** Initial incident families correlate without double-counting and appear in Forge_Command.

## BDS-SEC-100 Bounded controls

**Acceptance:** Signed directive, exact scope, expiry, receipt, lineage, and rollback for each action.

## BDS-SEC-110 Verification

**Acceptance:** ASVS Level 2 mapping, DAST, fuzzing, penetration test, chaos, and runbook exercises complete.

# Part II — ADRs

## ADR-001 Keep the website and BFF same-origin

Reduces CORS, cookie, and CSRF complexity.

## ADR-002 Edge WAF is defense-in-depth

The origin independently validates Host, edge identity, routes, methods, and contracts.

## ADR-003 Disable the Render default subdomain

Prevents straightforward WAF bypass.

## ADR-004 CSSA owns outbound cloud authorization

No route directly calls ForgeCustomer, Supabase, or intake.

## ADR-005 Sentinel remains asynchronous

Hard security controls continue during Sentinel outage.

## ADR-006 Server-managed sessions are the target

Long-lived credentials are not readable by browser JavaScript.

## ADR-007 Strict CSP without unsafe-inline

Inline code is removed rather than broadly permitted.

## ADR-008 Contact submission is same-origin

The browser never receives the internal intake destination.

## ADR-009 Route allowlist becomes a contract registry

Method/path checks alone are not enough.

## ADR-010 Raw incidents never grant firewall authority

Only signed, scoped controls affect enforcement.

## ADR-011 Security-page claims require evidence

Public statements must match deployed and verified controls.

## ADR-012 ASVS 5.0 Level 2 is the baseline

The site has authentication, customer data, and commerce surfaces.

# Part III — Configuration examples

## Render blueprint additions

```yaml
services:
  - type: web
    name: bds-website
    plan: starter
    renderSubdomainPolicy: disabled
    envVars:
      - key: BDS_ENV
        value: production
      - key: BDS_ALLOWED_HOSTS
        sync: false
      - key: BDS_REQUIRE_EDGE_TOKEN
        value: "true"
      - key: BDS_EDGE_TOKEN_CURRENT
        sync: false
      - key: BDS_CSSA_MODE
        value: shadow
      - key: BDS_POLICY_BUNDLE_PATH
        sync: false
      - key: BDS_DATAFORGE_SECURITY_URL
        sync: false
```

Confirm the exact current Render Blueprint field names before merging.

## Route policy

```ts
const checkoutPolicy = {
  id: "forge.checkout.create",
  method: "POST",
  template: "/v1/checkout",
  auth: "customer",
  cssaAction: "checkout.create",
  dataClass: "R2",
  maxBodyBytes: 8192,
  idempotency: "required",
  originRequired: true,
  csrfRequired: true,
  reauthMaxAgeSeconds: 900,
  requestSchema: "checkout-request.v1",
  responseSchema: "checkout-response.v1",
  upstream: "forgecustomer"
};
```

## CSSA event

```json
{
  "event_type": "cssa.authorization.issued",
  "producer": "bds-website",
  "route_id": "forge.checkout.create",
  "principal_id_hash": "hmac:...",
  "executor_id": "bds-website-bff",
  "data_class": "R2",
  "request_digest": "sha256:...",
  "decision": "allow",
  "authorization_id": "authz_...",
  "expires_at": "ISO-8601",
  "control_lineage": null
}
```

## Sentinel control

```json
{
  "schema_version": "cloud_security.control_directive.v1",
  "control_id": "ctl_...",
  "incident_id": "inc_bds_...",
  "policy_decision_id": "pdec_...",
  "issuer": "forge-command-policy",
  "action": "bds.checkout.hold",
  "target": {
    "account_id": "acct_...",
    "route_id": "forge.checkout.create"
  },
  "scope": "single_account_single_route",
  "issued_at": "ISO-8601",
  "expires_at": "ISO-8601",
  "max_uses": 1,
  "rollback": {
    "required": true,
    "action": "bds.checkout.release"
  },
  "signature": "base64:..."
}
```

## CSP report-only header

```text
Content-Security-Policy-Report-Only:
default-src 'self';
base-uri 'none';
object-src 'none';
frame-ancestors 'none';
script-src 'self';
style-src 'self';
img-src 'self' data:;
font-src 'self';
connect-src 'self' https://PROJECT.supabase.co wss://PROJECT.supabase.co;
report-uri /api/security/csp-report
```

After server-managed authentication and self-hosting, narrow `connect-src`.

# Part IV — Planned file inventory

```text
server/
  app.ts
  routes.ts
  headers.ts
  limits.ts
  origin.ts
  logging.ts
  forge.ts
  intake.ts
  auth/
    routes.ts
    session.ts
    csrf.ts
    supabase.ts
  security/
    contracts.ts
    registry.ts
    identity.ts
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

src/js/
  hud.js
  forge/
    api.js
    account.js
    checkout-success.js
    deletion.js
    login.js
    pricing.js
    session.js

schemas/
  http/
  cloud_security/
  forgecustomer/
  intake/

tests/
  security/
  contracts/
  integration/
  browser/
  fuzz/

infra/
  edge/
  render/
  policies/

docs/security/
  architecture.md
  threat-model.md
  cssa.md
  sentinel.md
  runbooks.md
  asvs-5.0-map.md
```
