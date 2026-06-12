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
