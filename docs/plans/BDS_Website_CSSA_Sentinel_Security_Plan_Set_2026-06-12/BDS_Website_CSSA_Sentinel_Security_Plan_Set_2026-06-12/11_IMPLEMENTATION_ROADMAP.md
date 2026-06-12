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
