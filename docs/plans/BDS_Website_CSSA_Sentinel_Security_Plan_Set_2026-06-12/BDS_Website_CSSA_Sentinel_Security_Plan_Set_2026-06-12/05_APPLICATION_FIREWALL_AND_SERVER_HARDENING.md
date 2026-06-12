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
