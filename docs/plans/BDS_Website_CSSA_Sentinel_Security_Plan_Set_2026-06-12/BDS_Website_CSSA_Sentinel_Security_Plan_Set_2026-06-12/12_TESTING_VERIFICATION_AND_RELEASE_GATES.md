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
