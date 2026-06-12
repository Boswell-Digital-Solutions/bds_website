# BDS Website CSSA, Sentinel, Firewall, and Security Plan

**Generated:** June 12, 2026  
**Repository:** `Boswecw/bds_website`  
**Status:** Implementation-ready architecture plan


---

# BDS Website CSSA, Sentinel, Firewall, and Security Plan Set

**Repository:** `Boswecw/bds_website`  
**Assessment date:** June 12, 2026  
**Repository snapshot reviewed:** `025ae3930b2e1fc490c2ccebefa45c7292235256`  
**Status:** Implementation-ready architecture plan  
**Primary operator surface:** Forge_Command  
**Cloud enforcement:** CSSA  
**Security intelligence:** Forge Sentinel  
**Evidence spine:** DataForge + Centipede  
**Customer/commerce authority:** ForgeCustomer  
**Current host:** Render Web Service  
**Recommended edge:** Cloudflare or an equivalent reverse-proxy WAF/CDN

## Mission

Protect the BDS public website as an internet-hostile surface while preserving its deliberately simple static-page architecture and same-origin ForgeCustomer backend-for-frontend.

```text
Internet
→ Edge CDN / DDoS / WAF / Bot Control
→ Authenticated Render Origin
→ Bun Application Firewall
→ CSSA CloudSecurityGate
→ GovernedEgressBroker
→ ForgeCustomer / Supabase / Intake
→ immutable authorization and outcome evidence
→ DataForge + Centipede
→ Sentinel nodes + Sentinel Prime
→ Forge_Command
→ signed, scoped, expiring controls
```

## Security doctrine

> The edge absorbs hostile traffic.  
> The origin rejects malformed and unauthorized requests.  
> CSSA governs every outbound cloud action.  
> Sentinel recognizes patterns across requests, accounts, and services.  
> Forge_Command approves consequential responses.

## Existing strengths

The repository already contains several valuable security foundations:

- Fail-closed static-file path handling.
- An explicit method/path allowlist for customer-facing ForgeCustomer routes.
- No website access to `/v1/admin/*`.
- No Stripe secret, Supabase service-role key, or operator credential in the website.
- User-scoped Supabase access-token forwarding.
- `Cache-Control: no-store` on account and commerce responses.
- Checkout idempotency support.
- Checkout completion based on authoritative subscription state rather than the redirect alone.
- Separation between the website surface and ForgeCustomer commercial truth.

## Highest-priority gaps

1. No encoded edge WAF, DDoS, bot-control, or origin-lock architecture.
2. The default Render origin can bypass the WAF unless it is disabled.
3. The Bun server lacks request-size, header-size, URL-length, body-read, and upstream deadlines.
4. Security headers are incomplete and there is no Content Security Policy.
5. Supabase is loaded from a third-party ESM CDN and persistent browser sessions remain readable by JavaScript.
6. Stateful BFF routes do not enforce an explicit same-origin or CSRF policy.
7. The BFF forwards raw JSON bodies and query strings after only path/method allowlisting.
8. The contact form posts directly to an exposed external intake URL with only a honeypot.
9. CSSA authorization/outcome records and Sentinel telemetry are not implemented.
10. Security-focused CI, fuzzing, DAST, dependency scanning, and incident exercises are absent.

## Plan documents

1. `01_CURRENT_STATE_AND_RISK_ASSESSMENT.md`
2. `02_SECURITY_DOCTRINE_AND_AUTHORITY.md`
3. `03_TARGET_REFERENCE_ARCHITECTURE.md`
4. `04_EDGE_WAF_DDOS_AND_ORIGIN_FIREWALL.md`
5. `05_APPLICATION_FIREWALL_AND_SERVER_HARDENING.md`
6. `06_CSSA_INTEGRATION_PLAN.md`
7. `07_AUTH_SESSION_CSRF_AND_ACCOUNT_SECURITY.md`
8. `08_DATA_INPUT_OUTPUT_AND_SUPPLY_CHAIN_SECURITY.md`
9. `09_SENTINEL_INTEGRATION_PLAN.md`
10. `10_FORGE_COMMAND_INCIDENT_EXPERIENCE.md`
11. `11_IMPLEMENTATION_ROADMAP.md`
12. `12_TESTING_VERIFICATION_AND_RELEASE_GATES.md`
13. `13_OPERATIONS_RUNBOOKS_AND_RECOVERY.md`
14. `14_EPICS_ADRS_CONFIGURATION_AND_EXAMPLES.md`

## Definition of done

The website is production-security ready only when:

- Public production traffic reaches the origin through the approved edge.
- The default Render subdomain is disabled.
- The origin requires a rotating edge-authentication token and exact Host.
- Every cloud egress operation passes through CSSA.
- Sensitive cloud operations are reconstructable from immutable authorization and outcome records.
- URLs, headers, bodies, content types, timing, redirects, and responses are bounded.
- CSP is enforced without `unsafe-inline`, `unsafe-eval`, or unapproved third-party script execution.
- Browser JavaScript cannot read long-lived session credentials.
- Stateful actions use same-origin validation, CSRF defense, and step-up authentication where required.
- Contact, login, magic-link, checkout, installation, and deletion abuse controls are tested.
- Sentinel correlates edge, application, CSSA, Supabase, ForgeCustomer, intake, and deployment evidence.
- Raw Sentinel findings and incidents cannot directly change firewall behavior.
- Every automated restriction is signed, exact in scope, reversible, time-bounded, and receipted.
- OWASP ASVS 5.0 Level 2 is used as the verification baseline.


---

# Current State and Risk Assessment

## 1. Current runtime

The current website is a static multi-page HTML/CSS/JavaScript site served by a small Bun/Node HTTP server.

```text
Browser
├─ static HTML/CSS/JS
├─ direct Supabase Auth client
├─ same-origin /api/forge/* calls
└─ direct intake-domain contact submission

Bun server
├─ static file allowlist
├─ /api/public-config
└─ ForgeCustomer BFF proxy

ForgeCustomer
└─ customer, commerce, license, entitlement, installation, and usage authority
```

Render deploys the static site and BFF as one public web service.

## 2. Current strengths

### Static-file fail-closed behavior

The server refuses paths outside selected public directories and root files. It normalizes paths and verifies that the result remains under the repository root.

### Customer/API separation

The ForgeCustomer proxy defines an exact method/path allowlist, excludes admin routes, forwards only the customer's own access token, and never handles operator credentials.

### Commercial-truth separation

The website renders ForgeCustomer state but does not own subscription, entitlement, license, device, usage, or billing truth.

### Checkout integrity

Checkout supports idempotency. The success page waits for webhook-driven subscription state instead of trusting a browser redirect.

### Cache isolation

Authenticated and commerce BFF responses are marked `no-store`.

## 3. Material risks

| Priority | Risk | Current condition | Required response |
|---|---|---|---|
| Critical | Edge bypass | No encoded WAF/origin-lock requirement | Reverse-proxy WAF, disable Render subdomain, edge secret |
| Critical | Browser session theft after XSS | Persistent Supabase session is JavaScript-readable | Strict CSP now; server-managed HttpOnly session target |
| High | Memory/slow-request denial | Request body reader has no byte or time limit | Streaming byte limit and deadline |
| High | Upstream connection exhaustion | ForgeCustomer fetch has no deadline | Abort timeout, response cap, circuit breaker |
| High | Weak execution policy | No CSP, inline script, external ESM module | Externalize, self-host, enforce CSP |
| High | Login/magic-link automation | Direct Supabase auth and no visible challenge | Turnstile/CAPTCHA and rate controls |
| High | Contact spam/payload abuse | Direct external intake and honeypot only | Same-origin BFF, Turnstile, schemas, limits |
| High | Origin impersonation | No exact Host or edge identity | Host allowlist and rotating edge header |
| High | Overbroad publication | Root `.html` and entire `src` directory can be served | Explicit route and asset manifest |
| Medium | Overbroad API contract | Body/query forwarded without route schema | Closed request/query schemas |
| Medium | Upstream response exposure | No response type, size, or schema validation | Cap, parse, validate, minimize |
| Medium | Missing same-origin enforcement | POST routes accept any Origin when token is present | Exact Origin policy; CSRF after cookie migration |
| Medium | Supply-chain injection | Supabase JS from `esm.sh`; fonts from Google | Bundle and self-host dependencies |
| Medium | Incomplete security headers | No HSTS, CSP, Permissions-Policy, COOP, CORP | Add staged header policy |
| Medium | Limited telemetry | Console logs only | Structured events, CSSA receipts, Sentinel evidence |
| Medium | Documentation drift | Old FastAPI/passkey plan differs from Bun/Supabase runtime | Supersede obsolete architecture document |
| Medium | Availability | Free Render service can cold-start | Always-on production service and readiness checks |

## 4. Code-level observations

### HTTP server

Strengths:

- Fails closed for many non-public paths.
- Restricts static methods to GET and HEAD.
- Adds `nosniff`, frame denial, and a referrer policy.

Gaps:

- Health responds before method validation.
- Any root `.html` file is public.
- The entire `src/` directory is public.
- No CSP, HSTS, Permissions-Policy, COOP, CORP, or origin-cluster header.
- No header, URL, body, connection, or request-time constraints.
- No exact Host validation.
- No edge-origin authentication.
- Most internal errors become 404, reducing diagnosis.

### ForgeCustomer BFF

Strengths:

- Exact endpoint allowlist.
- Customer JWT only.
- No admin routes or service-role key.
- Narrow header forwarding.
- `no-store`.
- Correlation IDs.
- Checkout idempotency support.

Gaps:

- Authorization syntax and length are not validated.
- No same-origin check for state-changing operations.
- No body-size, read-time, or closed-schema validation.
- Query parameters are not allowlisted by route.
- Upstream base is not validated against an exact production HTTPS origin at startup.
- No upstream deadline.
- No response byte cap or response schema.
- Correlation ID is not forwarded to ForgeCustomer.
- No CSSA decision, authorization, outcome, or reservation record.

### Browser authentication

The browser Supabase client persists sessions and is imported from a third-party ESM CDN. A successful XSS could steal the session and refresh token.

### Contact intake

The contact page exposes the external intake endpoint and submits directly from the browser. A honeypot catches only basic bots and provides no cryptographic challenge, distributed rate limit, server classification, or centralized audit.

## 5. Threat model

### External threats

- Volumetric and application-layer DDoS
- Path and vulnerability scanning
- Credential stuffing and password spraying
- Magic-link flooding
- Contact spam and malicious content
- Checkout/idempotency abuse
- Stolen browser sessions
- Authorization replay
- Direct-origin WAF bypass
- Dependency/CDN compromise
- ForgeCustomer route probing
- Slowloris and oversized requests
- Open-redirect and callback abuse

### Internal/system threats

- Misconfigured upstream base URL
- Accidental publication of internal files
- Release that weakens headers or allowlists
- Compromised upstream returning oversized or unsafe data
- Sensitive values appearing in logs
- CSSA/Sentinel authority confusion
- Self-confirming policy feedback loops
- Forged, stale, or widened control directives


---

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


---

# Target Reference Architecture

## 1. Production topology

```text
                              ┌──────────────────────────┐
Internet ─ DNSSEC / TLS ─────▶│ Edge CDN / WAF / DDoS   │
                              │ Bot + Rate + Turnstile   │
                              └─────────────┬────────────┘
                                            │ edge-auth header
                                            ▼
                              ┌──────────────────────────┐
                              │ Render: bds-website      │
                              │ Bun application firewall │
                              └──────┬───────────┬───────┘
                                     │           │
                              static │           │ /api/*
                                     ▼           ▼
                                public assets  CSSA Gate
                                                │
                                      immutable authorization
                                                │
                                                ▼
                                      GovernedEgressBroker
                         ┌──────────────────────┼───────────────────────┐
                         ▼                      ▼                       ▼
                    ForgeCustomer         Supabase Auth          Intake service
                         │                      │                       │
                         └──────────────────────┼───────────────────────┘
                                                ▼
                                  CSSA outcomes + security events
                                                ▼
                                      DataForge / Centipede
                                                ▼
                     Sentinel-Cost / Cloud / Data / Provider / Agent /
                                      License + Sentinel Prime
                                                ▼
                                           Forge_Command
                                                │
                                  signed scoped control directive
                                                ▼
                               Edge / CSSA / Identity / ForgeCustomer
```

## 2. Trust zones

### Zone 0 — Internet

Untrusted clients, crawlers, scanners, bots, and attackers.

### Zone 1 — Edge

Public reverse proxy. It filters and annotates traffic but owns no business truth.

### Zone 2 — Website origin

Publicly deployed but origin-authenticated. It serves static assets and the same-origin BFF.

### Zone 3 — Customer service plane

ForgeCustomer and Supabase own customer identity and commercial state.

### Zone 4 — Operator plane

Forge_Command, signing authority, policy administration, and incident review.

### Zone 5 — Evidence plane

DataForge and Centipede provide append-oriented evidence, reconciliation, replay, and retention.

## 3. Request flows

### Public page

```text
GET /pricing.html
→ edge WAF/cache
→ Host + edge-token validation
→ route manifest
→ static response + security headers
```

### Public catalog

```text
GET /api/forge/v1/plans
→ edge rate limit
→ application limit
→ CSSA R0/public action
→ single-use authorization
→ ForgeCustomer
→ response validation
→ explicit caching policy
→ outcome receipt
```

### Account read

```text
GET /api/forge/v1/account
→ server session or verified Bearer token
→ principal/account extraction
→ CSSA customer-read action
→ exact ForgeCustomer route
→ response schema + byte limit
→ no-store
```

### Checkout

```text
POST /api/forge/v1/checkout
→ exact Origin + CSRF
→ recent authentication when risk requires
→ Turnstile when challenged
→ required idempotency key
→ CSSA rate/quota reservation
→ strict authorization persistence
→ ForgeCustomer checkout
→ exact hosted checkout URL validation
→ outcome receipt
```

### Contact intake

```text
POST /api/intake/consultation
→ exact Origin
→ Turnstile verification
→ IP/device/email rate limit
→ closed body schema + R2/R3 classification
→ CSSA authorization
→ governed intake egress
→ normalized response
```

### Authentication target

```text
Browser
→ same-origin /auth/*
→ PKCE / Supabase
→ server-held session
→ __Host-bds-session HttpOnly cookie
→ no long-lived token readable by JavaScript
```

## 4. Degraded modes

| Failure | Behavior |
|---|---|
| Sentinel unavailable | CSSA/WAF continue; prediction and correlation pause |
| Forge_Command unavailable | Preapproved narrow policy continues; new approvals stop |
| ForgeCustomer unavailable | Static pages continue; BFF returns bounded 503 |
| Supabase unavailable | Existing valid sessions follow staleness policy; new login stops |
| Intake unavailable | Contact form shows safe fallback; no silent loss |
| DataForge unavailable | Durable outbox; strict actions block if proof cannot persist |
| Edge unavailable | Fail over only to an equally governed edge; never expose open origin |
| CSSA unavailable | Cloud actions fail closed; public static pages continue |

## 5. Same-origin rationale

Keeping pages and BFF on one origin reduces:

- CORS complexity
- cookie scope
- CSRF surface
- redirect complexity
- browser privacy leakage
- operational tracing gaps

Do not split the BFF into a public API subdomain without a documented scaling need and equivalent CORS/cookie protections.


---

# Edge WAF, DDoS, Bot, and Origin Firewall

## 1. Recommended front door

Use Cloudflare or an equivalent managed reverse proxy in front of Render.

Required capabilities:

- Anycast DDoS protection
- managed WAF
- custom firewall rules
- route-specific rate limiting
- bot challenge
- Turnstile or equivalent proof
- DNSSEC
- security-event export
- custom origin headers

## 2. Prevent direct-origin bypass

1. Attach only approved production domains to Render.
2. Disable the default `onrender.com` subdomain after validation.
3. Validate the exact `Host` header in Bun.
4. Have the edge inject a rotating `X-BDS-Edge-Token`.
5. Reject production requests without the valid token, except a narrowly scoped health-probe path if Render requires it.
6. Compare token values in constant time.
7. Support current and next secrets during rotation.
8. Never expose the token to browser JavaScript, HTML, logs, or errors.

### Environment

```text
BDS_ENV=production
BDS_ALLOWED_HOSTS=boswelldigitalsolutions.com,www.boswelldigitalsolutions.com
BDS_REQUIRE_EDGE_TOKEN=true
BDS_EDGE_TOKEN_CURRENT=<secret>
BDS_EDGE_TOKEN_NEXT=<optional-overlap-secret>
```

## 3. DNS and transport

- Enable DNSSEC.
- Add CAA records for intended certificate authorities.
- Redirect HTTP to HTTPS at the edge.
- Require TLS 1.2 minimum and prefer TLS 1.3.
- Stage HSTS, then progress to:

```text
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

- Monitor certificate transparency for unexpected issuance.

## 4. Edge firewall rules

### Scanner and secret paths

Block or managed-challenge common probes:

```text
/.git
/.env
/.aws
/.ssh
/wp-admin
/wp-login.php
/xmlrpc.php
/phpmyadmin
/server-status
/vendor/phpunit
/cgi-bin
```

The origin must independently reject them.

### Methods by surface

| Path | Allowed methods |
|---|---|
| Static pages/assets | GET, HEAD |
| `/api/public-config` | GET |
| Public catalog | GET |
| Provision/checkout/deactivate/deletion | POST |
| Intake | POST |
| Health | GET, HEAD |

Block TRACE, CONNECT, and unneeded WebDAV methods globally.

### Suspicious automation

Managed challenge when:

- bot/scanner confidence is poor
- user agent is empty or malformed
- rapid route enumeration occurs
- repeated 401/403/404 responses occur
- a risky ASN/country combines with authentication abuse

Do not trust or block solely on a claimed user-agent string.

### JSON expectations

For JSON POST requests:

- Require `application/json`.
- Reject edge-level oversize bodies.
- Reject missing Host.
- Reject path traversal encodings.
- Reject ambiguous framing where supported.

## 5. Initial rate limits

Starting values require tuning with shadow evidence.

| Surface | Initial limit | Key |
|---|---:|---|
| Static pages | 120/min | IP |
| Static assets | 600/min | IP |
| Public config | 30/min | IP |
| Public catalog | 60/min | IP |
| Account reads | 120/5 min | account + IP |
| Provision | 5/10 min | account + IP |
| Checkout | 5/10 min | account + IP |
| Installation deactivate | 10/hour | account |
| Deletion request/cancel | 5/day | account |
| Contact intake | 5/hour | IP + email hash |
| Login | 10/10 min | IP + email hash |
| Magic link | 3/hour | IP + email hash |

Challenge before block for uncertain automation. Hard-block protocol abuse, replay, and known bypass attempts.

## 6. Turnstile placement

Required for:

- contact submission
- repeated sign-up/sign-in failures
- magic-link requests
- password recovery
- checkout after a risk threshold
- any anonymous write endpoint

Every token is verified server-side. A client widget alone grants no authority.

## 7. Rule governance

- Store custom rule definitions in version control.
- Give each rule an ID, purpose, owner, mode, expiry, and rollback.
- Deploy uncertain rules in log/challenge before block.
- Export edge events into DataForge/Sentinel.
- Sentinel cannot directly edit WAF policy.
- Sentinel may request a signed, scoped, expiring edge control.

## 8. Edge action classes

| Class | Example |
|---|---|
| Observe | Log a scanner pattern |
| Challenge | Challenge one client fingerprint |
| Throttle | Reduce one route/client rate |
| Temporary block | Block one client for 15 minutes |
| Route hold | Temporarily suspend checkout |
| Permanent rule | Security-owner review and replay required |


---

# Application Firewall and Bun Server Hardening

## 1. Explicit publication manifest

Replace broad publication rules with explicit routes and generated asset manifests.

```ts
const PUBLIC_ROUTES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/about.html", "about.html"],
  ["/account.html", "account.html"],
  ["/architecture.html", "architecture.html"],
  // every approved route
]);

const PUBLIC_ASSET_PREFIXES = [
  "/src/assets/",
  "/src/js/",
  "/src/styles/"
];
```

Use an explicit white-paper manifest so a new private file is not published automatically.

## 2. HTTP limits

Starting limits:

```text
Request target: 8 KiB
Aggregate headers: 16 KiB
Header count: 64
Default JSON body: 64 KiB
Checkout body: 8 KiB
Provision body: 4 KiB
Deletion body: 8 KiB
Contact body: 32 KiB
Body-read deadline: 5 seconds
Total request deadline: 15 seconds
Upstream deadline: 8 seconds
Upstream response: 1 MiB
```

Reject early with structured 400, 408, 413, 414, or 431 responses.

## 3. Health endpoints

- Validate method before returning health.
- `/healthz` proves process liveness only.
- Add `/readyz` for configuration readiness.
- Do not expose dependency or secret details publicly.
- Never allow state-changing methods on health or static paths.

## 4. Host and origin

### Host

Reject unknown Hosts before routing.

### Origin

For POST/PUT/PATCH/DELETE:

- Require exact approved Origin when present.
- Use strict Referer fallback only where unavoidable.
- Reject `null` Origin unless a documented native client requires it.
- Trust forwarded host/proto only after edge authentication.

## 5. Security headers

Target:

```text
Content-Security-Policy:
  default-src 'self';
  base-uri 'none';
  object-src 'none';
  frame-ancestors 'none';
  form-action 'self' mailto:;
  script-src 'self';
  style-src 'self';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self';
  manifest-src 'self';
  worker-src 'self';
  upgrade-insecure-requests;
  report-to bds-csp

Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
```

Do not enable cross-origin embedder isolation until all dependencies are self-hosted and tested.

## 6. CSP migration

1. Move homepage inline HUD logic into `src/js/hud.js`.
2. Self-host fonts.
3. Install, lock, bundle, and self-host Supabase JS.
4. Deploy CSP in Report-Only.
5. Eliminate unexpected violations.
6. Enforce without `unsafe-inline` or `unsafe-eval`.
7. Evaluate Trusted Types after stabilization.

## 7. Route policy contract

Each BFF allowlist entry becomes a full policy:

```ts
interface RoutePolicy {
  id: string;
  method: string;
  template: string;
  auth: "public" | "customer";
  requestSchema?: string;
  querySchema?: string;
  responseSchema: string;
  maxBodyBytes: number;
  idempotency: "forbidden" | "optional" | "required";
  originRequired: boolean;
  csrfRequired: boolean;
  dataClass: "R0" | "R1" | "R2" | "R3";
  cssaAction: string;
}
```

Reject:

- body on GET unless explicitly allowed
- unknown JSON properties
- duplicate/ambiguous query values
- malformed IDs
- unexpected content type
- missing or malformed idempotency
- oversized or non-Bearer Authorization

## 8. Upstream validation

At startup:

- Parse `FORGECUSTOMER_API_BASE`.
- Require HTTPS in production.
- Forbid embedded credentials.
- Require an exact approved hostname.
- Forbid base path, query, and fragment unless explicitly designed.

At runtime:

- Use an abort deadline.
- Disable redirects or validate every redirect.
- Forward `X-Correlation-ID`.
- Send only allowlisted headers.
- Cap response bytes.
- Require expected content type.
- Validate response JSON.
- Normalize upstream errors.

## 9. Structured logging

```json
{
  "timestamp": "ISO-8601",
  "level": "info",
  "event": "bds.http.request.completed",
  "correlation_id": "uuid",
  "route_id": "forge.checkout",
  "method": "POST",
  "status": 200,
  "duration_ms": 142,
  "client_ip_hash": "hmac:...",
  "principal_id_hash": "hmac:...",
  "cssa_authorization_id": "authz_...",
  "edge_request_id": "..."
}
```

Never log Authorization, cookies, passwords, access/refresh tokens, Turnstile tokens, Stripe secrets, or raw R4 values.


---

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


---

# Authentication, Session, CSRF, and Account Security

## 1. Current risk

The current Supabase browser client persists sessions in JavaScript-accessible storage. A successful XSS can therefore become account takeover. The third-party ESM import also expands the script supply chain.

## 2. Immediate containment

Before session redesign:

- Self-host the Supabase bundle.
- Enforce strict CSP.
- Remove inline scripts.
- Use short access-token lifetime and refresh-token rotation.
- Enable MFA/passkeys where supported.
- Add Turnstile/CAPTCHA to sign-up, repeated sign-in, magic link, and recovery.
- Restrict redirect URLs exactly.
- Keep `next` same-origin and root-relative.
- Use generic authentication errors to reduce account enumeration.

## 3. Target server-managed session

### Cookie

```text
Set-Cookie:
__Host-bds-session=<opaque-random-id>;
Path=/;
Secure;
HttpOnly;
SameSite=Lax;
Max-Age=<bounded>;
Priority=High
```

Use Lax for email/OAuth callback compatibility unless tests prove Strict works.

### Session record

- Opaque random ID.
- Encrypted server-side session record or dedicated store.
- Session ID rotation at login, reauthentication, and privilege change.
- Idle and absolute expiry.
- Device/session inventory.
- Immediate revocation.
- No access or refresh token in browser-readable storage.

The BFF refreshes and forwards Supabase access tokens server-side only.

## 4. Auth endpoints

```text
GET  /auth/session
POST /auth/sign-in
POST /auth/sign-up
POST /auth/magic-link
GET  /auth/callback
POST /auth/refresh
POST /auth/sign-out
POST /auth/reauth
POST /auth/mfa/challenge
POST /auth/mfa/verify
```

All writes use CSSA and route-specific abuse controls.

## 5. CSRF

After cookie migration:

- SameSite cookie.
- Exact Origin for state-changing requests.
- Cryptographically random CSRF token bound to session.
- Custom request header.
- Rotation with session.
- Reject mismatch before processing body.
- Never mutate on GET.

## 6. Step-up authentication

Require recent authentication for:

- checkout when risk is elevated
- installation/device deactivation
- deletion request
- deletion cancellation near deadline
- email/password change
- MFA/passkey change
- session revocation
- sensitive support operations

Use a 5–15 minute recent-auth window by action.

## 7. Credential-abuse controls

- Per-IP, per-account, and per-device limits.
- Progressive delay.
- Generic login error.
- Turnstile after threshold.
- Breached-password protection where supported.
- Alert on new device/region plus sensitive action.
- Notify users of major account changes.
- Session/device management.
- Revoke all sessions after confirmed compromise or password reset.

## 8. Magic-link rules

- One-time use.
- Short TTL.
- Exact redirect allowlist.
- IP and normalized-email-hash rate limits.
- No account-existence disclosure.
- Request and redemption recorded separately.
- High-risk redemption can require additional verification.

## 9. JWT validation

Verify:

- issuer
- audience
- signature
- expiration
- not-before
- algorithm allowlist
- subject
- session ID when available
- revocation/security state
- account scope

Never trust decoded claims before cryptographic verification.


---

# Data, Input, Output, and Supply-Chain Security

## 1. Closed input schemas

Every API route uses a closed schema and rejects unknown properties.

### Checkout

```json
{
  "plan_key": "allowlisted-plan-key",
  "success_url": "same-origin approved path",
  "cancel_url": "same-origin approved path"
}
```

Do not accept arbitrary external redirect destinations.

### Provision

Accept only declared optional fields such as a validated IANA timezone. Reject prototype keys and unknown fields.

### Device deactivation

Validate identifier format and maximum length before interpolation.

### Deletion

Bound and normalize the reason. Treat free-form reason text as R3.

### Contact

```text
name       1–120 characters
email      normalized, 3–254 characters
reason     closed enum
message    1–5000 characters
source     closed enum
Turnstile  required
```

Accept plain text only.

## 2. Output schemas

Validate ForgeCustomer responses before returning them to the browser.

This:

- detects upstream contract drift
- prevents accidental field exposure
- caps memory consumption
- supports CSSA response classification
- produces deterministic evidence

## 3. URL and redirect security

- Exact origin allowlist.
- Parse with the platform `URL` API.
- Require HTTPS in production.
- Forbid credentials in URLs.
- Forbid protocol-relative URLs.
- Forbid user-controlled hostnames.
- Validate Stripe-hosted checkout destinations or require a ForgeCustomer-signed redirect contract.
- Revalidate every redirect hop.

## 4. Contact-service boundary

Move contact submission behind the same origin:

```text
Browser
→ POST /api/intake/consultation
→ Turnstile verification
→ request schema
→ CSSA
→ governed intake adapter
```

Do not expose the internal intake service URL in HTML.

## 5. Browser output safety

- Render untrusted values with `textContent`, not `innerHTML`.
- Encode for the destination context.
- Avoid dynamic script creation.
- Avoid inline event handlers.
- Apply scheme allowlists to dynamic links.
- Evaluate Trusted Types after CSP stabilizes.

## 6. Reduce third-party execution

Current external dependencies include Google Fonts and an `esm.sh` Supabase module.

Target:

- self-host fonts
- install, pin, bundle, and self-host Supabase JS
- retain Stripe hosted checkout
- route intake through the same-origin BFF
- permit only required Supabase endpoints in `connect-src`

## 7. Dependency governance

- Commit a real Bun lockfile.
- Pin direct dependencies.
- Use automated dependency-update pull requests.
- Run an OSV/dependency audit.
- Produce CycloneDX or SPDX SBOM.
- Run secret scanning and gitleaks.
- Run CodeQL or equivalent SAST.
- Pin GitHub Actions by commit SHA.
- Require review for dependency or network-surface changes.
- Record build provenance and artifact hash.

## 8. Static-asset integrity

- Content-hash built JS and CSS.
- Use long immutable cache only for hashed assets.
- Revalidate HTML and public config.
- Do not publish source maps without a defined need.
- Maintain a public asset manifest.
- Reject unknown MIME types.
- Preserve `nosniff`.

## 9. Data minimization and retention

| Record | Initial retention |
|---|---|
| Routine HTTP metadata | 30 days |
| WAF event | 30–90 days |
| Authentication security event | 365 days |
| CSSA authorization/outcome | 365 days or contract rule |
| Confirmed material incident | approved extension |
| Contact content | business-purpose retention |
| Raw token or secret | never |
| CSP report | 30 days |

Use keyed hashes or tokenization for IP, email, and account identifiers when direct identity is unnecessary.

## 10. Responsible-disclosure endpoint

Add:

```text
/.well-known/security.txt
```

Include the security contact, policy URL, preferred languages, canonical URL, acknowledgement expectations, and expiration date.

Update `security.html` only with controls that are deployed and verified.


---

# Sentinel Integration Plan

## 1. Role

Sentinel observes the BDS website asynchronously.

```text
Edge + Bun + CSSA + Supabase + ForgeCustomer + Intake + Deployment
→ canonical events
→ DataForge
→ Sentinel nodes
→ Sentinel Prime
→ Forge_Command
```

Sentinel never authorizes a live request.

## 2. Evidence producers

### Edge

- request volume
- WAF rule match
- challenge result
- bot class/score
- rate-limit action
- country and ASN
- edge request ID
- origin status
- DDoS summary

### Bun server

- route decision
- Host and edge-token failure
- malformed request
- method denial
- size/time-limit rejection
- same-origin failure
- CSP report
- status and duration
- release version

### CSSA

- decision
- authorization
- outcome
- replay attempt
- reservation lifecycle
- data classification
- signed-control application
- recorder backlog

### Identity/Supabase

- login success/failure
- magic-link request/redemption
- MFA result
- password reset
- session creation/revocation
- device/region novelty

### ForgeCustomer

- checkout
- subscription state
- entitlement decision
- device activation/deactivation
- usage/quota
- suspension/deletion
- Stripe reconciliation result

### Intake

- Turnstile result
- spam classification
- rate-limit result
- submission outcome
- payload size and class

### Deployment/GitHub

- commit
- dependency change
- security-test result
- deployment and rollback
- configuration hash
- WAF/policy change

## 3. Node mapping

| Evidence | Sentinel node |
|---|---|
| WAF, auth, origin, replay | Sentinel-Cloud |
| traffic, cost, quota, retry | Sentinel-Cost |
| classification, CSP, input/output | Sentinel-Data |
| executor, bypass, release behavior | Sentinel-Agent |
| entitlement and devices | Sentinel-License |
| Supabase, ForgeCustomer, intake health | Sentinel-Provider |
| compound patterns | Sentinel Prime |

A separate Sentinel-Web service is not needed initially. Use a BDS website profile across the established nodes.

## 4. Initial features and baselines

- requests per IP/device/account/route
- 401/403/404/429 ratios
- unique paths per client
- login-failure velocity
- magic-link request/redemption ratio
- new device/region
- checkout attempts per account
- idempotency-key reuse
- contact attempts per IP/email hash
- WAF challenge failures
- origin-token failures
- request/response sizes
- upstream latency/failure
- CSSA deny rate
- CSP violation family
- release-to-error change
- dependency/network-surface change
- device deactivation and deletion frequency

## 5. Incident families

### Credential stuffing

Signals:

- many accounts from one client
- many clients against one account
- failure burst
- Turnstile failure
- successful login from a new device after failures

Bounded response:

- challenge
- progressive delay
- require MFA
- revoke one suspicious session
- notify account owner

### Direct-origin bypass

Signals:

- invalid edge token
- unknown Host
- Render-origin requests
- repeated API probing

Bounded response:

- origin rejection
- investigate DNS and edge configuration
- rotate edge token if leakage is suspected

### BFF route probing

Signals:

- `/v1/admin/*`
- method mismatch
- route enumeration
- encoded traversal
- malformed IDs

Bounded response:

- challenge/block exact client
- preserve evidence
- do not impact unrelated customers

### Checkout abuse

Signals:

- rapid checkout creation
- idempotency replay
- new device/region
- payment failure/dispute
- entitlement divergence

Bounded response:

- hold checkout only
- require reauthentication or Turnstile
- preserve noncommercial account functions

### Contact abuse

Signals:

- repeated submissions
- duplicate content
- malicious URL/payload patterns
- Turnstile failure
- unusual email-domain behavior

Bounded response:

- throttle/challenge
- quarantine as plain text
- never automatically execute links or attachments

### Session theft

Signals:

- impossible travel
- concurrent distant sessions
- new device plus sensitive action
- token replay

Bounded response:

- revoke affected session
- require reauthentication/MFA
- do not permanently close the account automatically

### Deployment regression

Signals:

- CSP violation spike
- 5xx increase
- route/allowlist change
- new outbound host
- security-test failure

Bounded response:

- pause deployment
- governed rollback
- Sentinel supplies evidence but never patches code directly

## 6. Compound correlation example

```text
New region/device
+ 18 failed logins
+ successful login
+ checkout creation
+ device deactivation
+ CSSA route anomaly
--------------------------------
Possible account takeover
```

Track independent evidence roots. Do not count transformed copies of one event as separate proof.

## 7. Control path

```text
Sentinel incident
→ policy evaluation
→ Forge_Command approval when required
→ signed control directive
→ CSSA / edge / identity authority
→ action receipt
→ Sentinel monitoring
```

## 8. Initial bounded controls

- require Turnstile for one account/client
- reduce one route limit
- hold checkout for one account
- require reauthentication
- revoke one session
- temporarily block one client fingerprint
- increase logging for 15 minutes
- request governed deployment rollback

Never automate permanent account closure, permanent license revocation, subscription cancellation, customer-data deletion, source-code mutation, or broad geographic blocking without owning-authority review.

## 9. Feedback-loop prevention

A denial caused by a Sentinel-originated control carries:

```text
control_id
incident_id
policy_decision_id
policy_generated_effect=true
```

Sentinel tracks whether enforcement worked separately from whether the original hypothesis was confirmed.


---

# Forge_Command BDS Website Incident Experience

## 1. Goal

Forge_Command displays one coherent case even when evidence comes from the edge, Render, Bun, CSSA, Supabase, ForgeCustomer, and Sentinel.

## 2. Active list

| Column | Example |
|---|---|
| Priority | High |
| Incident | Possible account takeover followed by checkout |
| Surface | BDS Website / customer account |
| Source | Edge + Identity + CSSA |
| Recommendation | Hold checkout, revoke one session, require MFA |
| Authority | Identity + CSSA + Operator |
| Age | 8 minutes |
| State | Review required |

## 3. Detail view

### Header

```text
Incident #BDS-443
Possible account takeover

Likelihood: 84%
Impact: 78%
Confidence: 81%
Evidence quality: 95%
Status: Review Required
```

### Evidence groups

#### Original behavior

- login failure burst
- new device/region
- successful session
- checkout initiation
- device deactivation

#### Edge decisions

- challenge results
- rate-limit actions
- WAF matches

#### CSSA decisions

- route authorization
- data classification
- idempotency
- reservation
- outcome

#### Sentinel interpretation

- baseline deviation
- evidence independence
- conflicts
- uncertainties

#### Proposed actions

- revoke session `...91af`
- hold checkout for 15 minutes
- require MFA/reauthentication
- notify account owner

## 4. Action cards

Every action card shows:

- exact target
- exact scope
- owning authority
- approval level
- duration
- reversibility
- expected effect
- action risk
- rollback
- policy version
- control ID after approval

There is no “Block Everything” or “Fix All” button.

## 5. Website security dashboard

Display:

- edge health
- origin-token failures
- WAF actions
- request rates
- auth failures
- CSSA decision rates
- recorder/outbox backlog
- upstream health
- CSP violations
- current release
- security-policy version
- Sentinel coverage

Service health and security risk are separate statuses.

## 6. Completed stub

```text
RESOLVED · BDS-443

Actions:
- Revoked one session
- Held checkout for 15 minutes
- Required MFA

Outcome:
No further unauthorized activity during 24-hour monitoring.

Receipts:
edge_rcpt_...
cssa_rcpt_...
identity_rcpt_...

Resolved by:
Operator + Identity + CSSA
```

## 7. Roles

```text
bds_security_viewer
bds_security_operator
bds_policy_admin
bds_identity_admin
bds_commerce_admin
bds_auditor
```

No role silently changes policy, signs a broad control, and executes a permanent business action.


---

# Implementation Roadmap

## Delivery strategy

Build bounded vertical slices. Each wave includes code, configuration, tests, telemetry, rollback, and documentation.

## Wave 0 — Authority and architecture lock

Deliver:

- accept the authority model
- supersede the outdated FastAPI/passkey website document
- approve the managed edge
- approve CSSA/Sentinel boundaries
- identify the policy/control signing authority
- select the DataForge outbox design
- define production domains and exact upstream origins

Exit:

- no authority ambiguity
- no unresolved direct-origin strategy
- data classes accepted

## Wave 1 — Immediate origin hardening

Deliver:

- exact route/asset manifest
- Host allowlist
- edge-token validation
- method-before-health validation
- URL/header/body/time limits
- upstream timeout and response cap
- strict content types
- structured errors and logs
- upstream URL validation at startup

Exit:

- oversized, slow, and malformed requests fail safely
- unknown Host and missing edge token fail closed
- internal files cannot become public merely by filename

## Wave 2 — CSP and supply-chain reduction

Deliver:

- externalize homepage inline script
- self-host fonts
- install/bundle Supabase
- CSP Report-Only
- Permissions-Policy, COOP, CORP, and staged HSTS
- CSP report endpoint
- hashed production assets

Exit:

- no unexpected CSP violation
- no unapproved third-party script
- enforced CSP without unsafe-inline/eval

## Wave 3 — Edge firewall

Deliver:

- proxied DNS
- DNSSEC
- managed WAF
- custom scanner and method rules
- rate limits
- bot challenge
- Turnstile
- security-event export
- disabled Render subdomain

Exit:

- direct-origin test fails
- edge rollback documented
- legitimate traffic baseline accepted
- flood exercise passes

## Wave 4 — Application contracts

Deliver:

- route-policy objects
- request/query/response schemas
- exact redirect allowlists
- required idempotency for mutations
- same-origin enforcement
- same-origin contact BFF

Exit:

- unknown fields and destinations are rejected
- internal intake URL disappears from HTML
- upstream contract drift fails safely

## Wave 5 — CSSA SHADOW

Deliver:

- contracts
- identity/delegation resolver
- cloud registry
- authenticated policy bundle
- classifier
- recorder/outbox
- governed egress
- shadow decisions/authorizations/outcomes
- no-side-door CI

Exit:

- every outbound action has one authorization
- shadow behavior matches legacy behavior
- direct network calls outside egress fail CI
- replay works

## Wave 6 — Server-managed sessions

Deliver:

- auth BFF endpoints
- HttpOnly cookie
- opaque/server session
- CSRF
- rotation/revocation
- step-up authentication
- generic errors
- MFA/passkey path

Exit:

- no long-lived token is page-readable
- CSRF suite passes
- magic-link/callback flow passes
- fixation and replay tests pass

## Wave 7 — CSSA CANARY and ACTIVE

Deliver:

- rate/quota reservation
- strict persistence
- single-use authorization consumption
- checkout/deletion/device enforcement
- signed control directives
- rollback

Exit:

- replay and digest mutation fail
- strict recorder outage blocks strict actions
- canary rollback succeeds
- false-block rate is accepted

## Wave 8 — Sentinel SHADOW

Deliver:

- canonical event adapters
- edge/Bun/CSSA/identity/ForgeCustomer/intake/deployment ingestion
- baselines
- deterministic correlation
- Forge_Command incident UI

Exit:

- known scenarios reconstruct
- no evidence double-counting
- missing telemetry reduces confidence
- raw incident cannot enforce

## Wave 9 — Bounded Sentinel controls

Enable one at a time:

1. require Turnstile
2. reduce route limit
3. hold one checkout
4. require reauthentication
5. revoke one session

Each requires signed scope, expiry, receipt, feedback lineage, visible rollback, and a completed rollback exercise.

## Wave 10 — Production hardening

Deliver:

- ASVS 5.0 Level 2 mapping
- external penetration test
- chaos and load rehearsal
- key rotation
- backup/restore
- incident exercises
- `security.txt`
- truthful security-page update
- production readiness review

## Minimum milestone before public commerce

- edge WAF and origin lock
- request limits and deadlines
- strict CSP
- self-hosted runtime dependencies
- same-origin validation
- Turnstile for contact/auth abuse
- closed route schemas
- CSSA shadow evidence
- structured logs
- security CI


---

# Testing, Verification, and Release Gates

## 1. Baseline

Use OWASP ASVS 5.0 Level 2, plus CSSA contracts, Sentinel correlation, edge firewall, account isolation, supply-chain, and resilience testing.

## 2. Contract tests

- decision/authorization/outcome/finding schemas
- unknown major version rejection
- stable canonical hashing
- immutable record cardinality
- control signature, scope, expiry, and replay
- request/response schema compatibility

## 3. Unit tests

- route and asset manifest
- path normalization
- Host allowlist
- constant-time edge-token validation
- Origin/Referer rules
- Authorization syntax
- body byte limit and deadline
- URL/query validation
- idempotency
- classification
- CSSA policy
- rate/quota reservation
- response cap
- security headers

## 4. Fuzzing

Fuzz:

- encoded traversal
- mixed slash/backslash
- invalid UTF-8
- duplicate headers
- duplicate query parameters
- conflicting framing
- chunked bodies
- oversized IDs
- JSON depth and arrays
- prototype keys
- malformed JWTs
- redirects
- Unicode hostnames

## 5. Integration tests

- browser → BFF → ForgeCustomer mock
- CSSA authorization → egress → outcome
- DataForge unavailable → durable outbox
- contact → Turnstile mock → intake
- Supabase callback → cookie session
- checkout → authoritative subscription polling
- device deactivation/deletion step-up
- Sentinel evidence ingestion

## 6. Browser tests

- sign-in/sign-up/magic link
- session expiry and refresh
- sign-out
- account dashboard
- checkout
- deletion lifecycle
- CSP enforcement
- no mixed content
- open-redirect rejection
- DOM-XSS corpus
- mobile navigation
- accessibility

## 7. Edge tests

- disabled Render URL returns 404
- custom Host without edge token is rejected
- scanner paths are blocked
- methods are restricted
- challenge/rate thresholds behave as designed
- Turnstile failure is enforced
- edge event reaches Sentinel
- rule rollback works

## 8. Security automation

```text
format/lint
→ unit + contract
→ secret scan
→ dependency audit
→ SAST/CodeQL
→ no-side-door network scan
→ SBOM
→ browser tests
→ DAST/ZAP
→ fuzz
→ policy/config validation
→ build provenance
```

## 9. Abuse scenarios

1. Credential stuffing.
2. Password spraying.
3. Magic-link flood.
4. Stolen session replay.
5. Direct-origin bypass.
6. `/v1/admin/*` probing.
7. Oversized slow POST.
8. Query/body contract smuggling.
9. Checkout replay.
10. Contact spam.
11. Malicious contact content.
12. Upstream timeout.
13. Oversized/non-JSON upstream response.
14. CSSA recorder outage.
15. DataForge reconciliation.
16. Forged Sentinel incident sent to CSSA.
17. Expired/widened control.
18. CSP regression after release.
19. Dependency compromise simulation.
20. Rollback failure.

## 10. Performance budgets

Measure:

- edge-to-origin p95
- Bun p95/p99
- CSSA decision p99
- classification p99
- upstream p95/p99
- recorder write p99
- outbox age
- Sentinel detection delay

Performance pressure may not silently disable security controls.

## 11. Release blockers

Do not release when:

- critical/high security tests fail
- direct egress exists outside CSSA
- CSP adds an unexpected source
- public route manifest expands without review
- WAF/origin token is absent
- secrets are detected
- CSSA contract versions conflict
- rollback is unavailable
- security headers regress
- dependency risk is unreviewed


---

# Operations, Runbooks, and Recovery

## 1. Operational telemetry

Monitor:

- edge request/challenge/block rates
- origin-token and Host failures
- Bun 4xx/5xx
- request-limit failures
- upstream latency/errors
- CSSA allow/deny/record latency
- recorder/outbox backlog
- authentication failures and new devices
- checkout attempts
- contact abuse
- CSP violations
- current release/security-policy version
- Sentinel coverage and incident lag

## 2. DDoS or bot flood

1. Verify edge is receiving the attack.
2. Identify target routes and client characteristics.
3. Increase challenge/rate controls at the smallest scope.
4. Keep informational pages available where possible.
5. Protect auth, checkout, and intake separately.
6. Confirm origin resource pressure.
7. Record control receipts.
8. Release gradually with hysteresis.
9. Review false positives.

## 3. Direct-origin attack

1. Confirm edge-token or Host failures.
2. Verify the Render subdomain is disabled.
3. Verify DNS does not expose origin.
4. Rotate the edge token if leakage is possible.
5. Block exact paths/clients at origin.
6. Check whether any bypass succeeded.
7. Re-run origin-bypass tests.

## 4. Credential stuffing

1. Confirm the failure pattern and evidence quality.
2. Challenge exact clients/accounts.
3. Require MFA/reauthentication for affected accounts.
4. Revoke suspicious successful sessions.
5. Notify the account owner when appropriate.
6. Review checkout, device, and deletion activity.
7. Avoid permanent account penalty without confirmation.

## 5. Session theft

1. Identify the exact session/device/region.
2. Revoke that session.
3. Require reauthentication and MFA.
4. Inspect sensitive actions.
5. Rotate session identifiers.
6. Preserve evidence without storing the token.
7. Restore verified access.

## 6. Checkout abuse

1. Hold checkout for the exact account.
2. Preserve noncommercial account access.
3. Inspect idempotency, device, region, and payment outcome.
4. Reauthenticate the customer.
5. Reconcile ForgeCustomer and Stripe.
6. Release gradually.
7. Never cancel a subscription from anomaly alone.

## 7. Contact abuse

1. Increase Turnstile/rate controls.
2. Quarantine suspicious text.
3. Do not follow links or open attachments automatically.
4. Block exact fingerprints.
5. Preserve pseudonymized identifiers and evidence.
6. Release legitimate submissions after review.

## 8. CSSA recorder failure

1. Mark evidence coverage degraded.
2. Activate durable outbox.
3. Block strict actions if durable authorization cannot be recorded.
4. Keep static pages available.
5. Repair storage.
6. Reconcile sequence and hashes.
7. Verify no duplicate side effects.
8. Clear degraded state with a receipt.

## 9. ForgeCustomer outage

1. Open a provider-health incident.
2. Stop retry amplification.
3. Return bounded 502/503 with correlation ID.
4. Keep public static pages available.
5. Pause checkout when state is uncertain.
6. Reconcile after recovery.
7. Verify no duplicated checkout or deletion.

## 10. CSP violation spike

1. Correlate with release and page.
2. Separate legitimate resource change from injection.
3. Contain session/release risk if injection is suspected.
4. Roll back through governed deployment.
5. Do not weaken CSP globally as a quick fix.
6. Add a regression test.

## 11. Compromised dependency

1. Freeze deployment.
2. Identify affected version and artifacts.
3. Remove exposure.
4. Rotate secrets if execution could access them.
5. Rebuild from known-good lock and provenance.
6. Verify SBOM and hashes.
7. Monitor Sentinel evidence.
8. Communicate when required.

## 12. Sentinel false positive

1. Preserve the original finding and action.
2. Separate policy-generated effects.
3. Roll back the bounded control.
4. Identify the feature/baseline/change-window cause.
5. Create a reviewed label.
6. Replay the correction.
7. Do not suppress related true incidents.

## 13. Rollback failure

1. Stop issuing similar controls.
2. Escalate immediately.
3. Preserve before/after state.
4. Use the owning authority for manual recovery.
5. Open a high-priority incident.
6. Disable automation until canary and rollback pass.

## 14. Key rotation

Exercise rotation for:

- edge-origin token
- CSSA policy signing key
- control-directive signing key
- session encryption/signing key
- pseudonymization HMAC key
- DataForge producer key
- Supabase keys under provider procedure

Every rotation defines overlap, revocation, rollback, and audit.


---

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
