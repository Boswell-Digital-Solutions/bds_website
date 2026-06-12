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
