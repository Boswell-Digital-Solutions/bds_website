# Security Doctrine and Authority

## 1. Governing rule

> No public request reaches a cloud service unless it is attributable, bounded, classified, policy-checked, authorized, executed through approved egress, and reconstructable.

## 2. Layer responsibilities

### Edge firewall

The edge protects availability and filters known-hostile traffic before origin resources are consumed.

It owns:

- DDoS absorption
- TLS edge policy
- managed and custom WAF rules
- bot challenges
- coarse rate limiting
- Turnstile or equivalent proof
- optional geography/ASN controls
- edge security logs

### Bun application firewall

The Bun server protects the origin from malformed and unexpected HTTP behavior.

It owns:

- exact Host and edge-token validation
- route and method manifest
- URL, header, body, and time limits
- security headers
- content-type enforcement
- same-origin checks
- route-specific local rate limits
- correlation IDs
- response bounds

### CSSA

CSSA is the deterministic authority for outbound cloud calls.

It owns:

- principal, executor, and delegation resolution
- action and data classification
- entitlement and policy checks
- atomic quota/rate reservations
- upstream and provider allowlists
- request digest
- single-use authorization
- governed egress
- immutable authorization/outcome truth

### Sentinel

Sentinel is the persistent intelligence layer.

It owns:

- baselines
- novelty and drift
- evidence quality
- cross-request/service correlation
- findings and compound incidents
- recommendations
- calibration

Sentinel does not sit in the request hot path and does not possess unrestricted firewall credentials.

### Forge_Command

Forge_Command is the operator and business control surface.

It owns:

- incident lifecycle
- approvals and escalation
- exceptional restrictions
- rollback visibility
- policy and model governance
- completed action receipts

### ForgeCustomer

ForgeCustomer remains authoritative for:

- customer identity projection
- subscription
- entitlement
- license
- installation and device
- usage
- checkout state
- account deletion lifecycle

## 3. Authority matrix

| Domain | Intelligence | Policy | Execution |
|---|---|---|---|
| Edge traffic | Edge analytics + Sentinel | Edge policy / Forge_Command | Edge WAF |
| HTTP validity | Bun telemetry | Versioned application policy | Bun server |
| Outbound cloud action | CSSA evidence | CSSA policy bundle | GovernedEgressBroker |
| Account takeover | Sentinel-Cloud | Identity policy / Forge_Command | Supabase/identity authority |
| Checkout abuse | Sentinel-Cost/Cloud | Commerce policy | CSSA + ForgeCustomer |
| Entitlement/license | Sentinel-License | ForgeCustomer/Forge_Command | ForgeCustomer |
| Provider route | Sentinel-Provider | CSSA + NeuroForge | NeuroForge/egress |
| Data boundary | Sentinel-Data | CSSA data policy | CSSA/BFF |
| Code repair | Sentinel evidence | SMITH | YellowJacket + Hermes |

## 4. Fail-closed boundaries

Fail closed when:

- Host is unknown.
- Production edge token is missing or invalid.
- Authorization is malformed or oversized.
- Origin is invalid for a state-changing request.
- Request body exceeds the route limit.
- Content type is wrong.
- Request schema fails.
- CSSA policy, entitlement, quota, or classification is unknown.
- Upstream host differs from the exact approved origin.
- A strict authorization cannot be durably recorded.
- A signed control is expired, replayed, widened, or invalid.
- A checkout mutation lacks idempotency.

Fail safe for availability when:

- Sentinel is unavailable.
- Forge_Command's incident UI is unavailable.
- Optional analytics are unavailable.
- Public static content can continue without exposing protected operations.

## 5. Data classes

| Class | Website examples | Default |
|---|---|---|
| R0 | Public pages and product/plan catalog | Allowed |
| R1 | Correlation ID, route name, service health | Allowed with retention limit |
| R2 | Email, account metadata, device metadata, contact message | Minimize, encrypt, never publicly cache |
| R3 | Deletion reason, sensitive support artifact, restricted business data | Explicit purpose and restricted path |
| R4 | Passwords, tokens, service keys, Stripe secrets, signing keys | Never logged or sent outside owner boundary |

## 6. Non-negotiable rules

1. Browser input is never trusted.
2. A Bearer token proves only verified issuer and claim assertions.
3. Edge allow does not imply application allow.
4. Application allow does not imply cloud authorization.
5. Sentinel incident prose never grants authority.
6. No network client exists outside approved egress modules.
7. No raw token, password, secret, or R4 value enters logs or Sentinel telemetry.
8. Every reversible restriction has expiry and rollback.
9. Permanent account, license, billing, or data actions require the owning authority.
10. Claims on `security.html` must match controls proven in production.
