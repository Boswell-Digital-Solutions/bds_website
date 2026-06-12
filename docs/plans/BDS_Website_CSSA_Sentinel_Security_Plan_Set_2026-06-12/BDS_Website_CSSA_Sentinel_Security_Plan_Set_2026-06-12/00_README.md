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
