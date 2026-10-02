# 7. Security & Commerce Model

## Public Security Narrative

The site positions BDS around:

- passkey authentication
- Stripe-hosted checkout
- Ed25519-signed admin actions
- private infrastructure segmentation
- fail-closed governance

These are presented most clearly on the homepage, `security.html`, and `docs/store_security_architecture_v_1.md`.

## Commerce Implementation: ForgeCustomer

Customer identity, commerce, licensing, entitlements, installations, and usage
are owned by **ForgeCustomer** (Rust/Axum), not by this website. The site is a
pure customer-surface client that renders ForgeCustomer state and never holds
commercial truth. The full integration is documented in
`§9 ForgeCustomer Integration`.

Key boundaries enforced in code:

- All ForgeCustomer calls go through this site's server-side BFF proxy
  (`server/forge.ts`); the browser never calls ForgeCustomer directly (it has no
  CORS layer). The proxy forwards the signed-in user's own Supabase access token.
- An explicit allowlist blocks every non-customer route, including `/v1/admin/*`.
- No Supabase service-role key, Stripe secret, or operator credential is present
  in the website or its client bundles. Stripe Checkout is hosted; no card data
  touches the site.
- Entitlements activate from Stripe's webhook-driven projection, never from a
  browser redirect — the checkout success page polls `GET /v1/subscriptions`
  until `grants_cloud: true`.
- Self-service subscription changes use Stripe's hosted **Customer Portal**:
  `POST /v1/billing-portal` mints a portal session (origin-locked `return_url`); the
  cancel/switch result reprojects via webhook. The website never holds a cancel/plan-change
  surface of its own.
- Checkout `success_url`/`cancel_url` and portal `return_url` are origin-locked to the
  canonical website domain (`https://bds-digitalsolutions.com`, plus `www.`) or a
  loopback dev origin, and to one exact path each. The former website domain
  (`boswelldigitalsolutions.com`) no longer resolves and is not accepted.

## Canonical Website Domain

The canonical public website is `https://bds-digitalsolutions.com`
(BDS-WEB-PR-v0.1 CP1). All `rel=canonical`, `og:url`, `og:image`, `twitter:image`,
`/apps` generated canonicals, and the `security.txt` `Policy`/`Canonical` fields use
it. The in-code host allowlist (`DEFAULT_ALLOWED_HOSTS`), the origin fallback in
`server/security/http.ts`, and `render.yaml` `BDS_ALLOWED_HOSTS` name the same host.

Business email stays on `boswelldigitalsolutions.com`
(`charlesboswell@boswelldigitalsolutions.com`). Mailbox addresses are not website
URLs and are not rewritten.

`tools/qc/canonical-domain.ts` (part of `bun run qc:security` and CI) fails on any
former-domain web host in the repository outside `docs/`, and exempts `@`-prefixed
mailbox values.

Login reuses Supabase; ForgeCustomer validates JWTs from the same project.

## Still Documentation, Not Code

The following remain positioning statements rather than checked-in website
behavior:

- passkey registration/authentication (the website uses Supabase login today)
- signed admin gateway verification logic (lives in Forge Command, not here)

## Public Intake Boundary

The public contact page now submits consultation requests to the Rust intake service over HTTPS. That gives the marketing site a real inquiry lane without exposing ForgeCommand's admin surface directly from the website.

- website contact form posts to the public intake endpoint
- intake persistence and triage happen outside this static website repo
- operator review still belongs in ForgeCommand rather than the marketing surface

## Commerce Posture

The public store posture is intentionally bounded:

- licensed software and services only
- no card handling on the website itself
- legal terms already scaffolded
- the AuthorForge Pro lane routes buyers through `pricing.html` into ForgeCustomer-driven Stripe Checkout; the one-time Standard license still uses contact-based coordination

The store page now links the Pro lane to `pricing.html`, where checkout is started against ForgeCustomer.
