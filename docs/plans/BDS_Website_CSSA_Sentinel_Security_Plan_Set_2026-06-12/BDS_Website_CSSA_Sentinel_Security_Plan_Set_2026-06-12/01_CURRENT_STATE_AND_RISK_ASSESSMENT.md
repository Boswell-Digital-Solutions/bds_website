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
