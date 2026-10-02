# 5. Page Inventory

## Implemented Public Pages

| Page | Path | Status |
|------|------|--------|
| Homepage | `index.html` | Primary authored page; most complete experience |
| Products | `products.html` | Live product-entry page for applications |
| Services | `services.html` | Live services-entry page |
| Forge | `forge.html` | Live platform overview page |
| Meet SMITH | `meet-smith.html` | Live SMITH explainer framing it as the continuous authority HUD |
| Architecture | `architecture.html` | Live public architecture explainer with Mermaid layered-system diagram |
| White Papers | `white-papers/index.html` | Live public research archive with dated metadata and archive-style paper indexing |
| Store | `store.html` | Live licensing surface; Pro lane links to `pricing.html` |
| Pricing | `pricing.html` | Live catalog + Stripe Checkout start (ForgeCustomer) |
| Security | `security.html` | Live security posture and responsible-disclosure page |
| About | `about.html` | Live company identity page |
| Founder | `founder.html` | Live founder background and governance-philosophy page |
| Media Center | `media.html` (served at `/media`, `/media/`, `/media.html`) | Static press page: company snapshot, three boilerplates, founder profile, AuthorForge press section (status: in development), story angles, technical-resource links, news state, media contact. In the main navigation before Contact and in the homepage Company footer group. It also has press-asset downloads and a media inquiry form on the governed intake lane (BDS-WEB-PR-v0.1 CP3). |
| Contact | `contact.html` | Live inquiry and support page wired to the public intake service |
| AuthorForge | `authorforge.html` | Live product detail page |
| AuthorForge Founder | `authorforge-founder.html` | Live supporting detail page |
| AuthorForge Cost Comparison | `authorforge-cost-comparison.html` | Live supporting detail page |

## Legal Pages

| Page | Path | Status |
|------|------|--------|
| Terms | `legal/terms.html` | Live policy page |
| Privacy | `legal/privacy.html` | Live policy page |
| Refund | `legal/refund.html` | Live policy page |
| EULA | `legal/eula.html` | Live multi-product software license page with Pro / ecosystem integration terms |
| Ecosystem Terms | `legal/ecosystem.html` | Live optional ecosystem feature terms page |

## Account Surface (ForgeCustomer)

These pages render customer state owned by ForgeCustomer. They are `noindex` and
require a Supabase session (except the dedicated state pages). See §9.

| Page | Path | Status |
|------|------|--------|
| Sign in | `login.html` | Supabase login / sign-up / magic link |
| Account dashboard | `account.html` | Subscription, licenses, installations/devices, usage, deletion controls |
| Checkout success | `checkout/success.html` | Polls `GET /v1/subscriptions` until `grants_cloud: true` |
| Checkout canceled | `checkout/cancel.html` | No-charge return page |
| Account suspended | `account/suspended.html` | Landing page for `403 CUSTOMER_SUSPENDED` |
| Account closed | `account/closed.html` | Landing page for closed/deleted accounts |

## Media Center Truth Rules

`media.html` follows BDS-WEB-PR-v0.1. Each material statement is one of: stable
company fact, current product fact, development statement, or attributed founder
statement. A statement that cannot be verified against its owning source is omitted
or labeled as in development. For this reason the page:

- labels AuthorForge "in development", because the Author-Forge repository has no
  published release;
- states "U.S. Navy veteran" and "service-disabled veteran-owned small business".
  The operator supplied VA evidence of Navy service (1993–1997, honorable) and a
  service-connected disability. The evidence is not stored in this repository, and
  the page publishes no rating, condition, or identifier. This is an ownership
  statement, not an SBA VetCert certification claim.

## Press Assets (BDS-WEB-PR-v0.1 CP3)

Approved press assets live under `src/assets/media/` and are served through the
existing `/src/assets/` prefix. No new route or allowlist entry exists. Every
file in the tree is published, so the tree holds only operator-approved files.
`tests/security.test.ts` pins the exact file list. Adding a file means adding it
to that list in the same reviewed change.

| File | Subject | Format | Disposition |
|------|---------|--------|-------------|
| `bds/bds-seal-500.webp` | Canonical BDS company seal | WebP, 500 × 500, transparent | APPROVED_EDITORIAL; web resolution. The source is the operator-supplied seal reference. A higher-resolution original is pending. |
| `bds/bds-wordmark-728x308.webp` | BDS wordmark | WebP, 728 × 308, black background | APPROVED_EDITORIAL |
| `founder/charles-boswell-portrait-2189x2468.webp` | Founder portrait | WebP, 2189 × 2468; EXIF/XMP removed, pixels unchanged | APPROVED_EDITORIAL |
| `authorforge/authorforge-artwork-1024.webp` | AuthorForge artwork | WebP, 1024 × 1024 | APPROVED_EDITORIAL; must be described as in development |
| `*-thumb-320.webp` | Page previews of the seal and portrait | WebP, 320 px wide | APPROVED_WEB_ONLY (not offered for download) |

The page shows small previews and links to the full files with `download`. A
full-resolution file is never a page thumbnail.

## Media Inquiry Lane

The media form posts through the existing consultation intake
(`POST /api/intake/consultation`). It uses `reason = "Media / press inquiry"` and
`source_page = "media.html"`, both added to the allowlists in `server/intake.ts`.
Outlet, topic, format, and deadline are visible fields marked
`data-message-field`. `src/js/contact-form.js` writes them into the message text,
so the intake contract still accepts only `name`, `email`, `reason`, `message`,
`source_page`, and `turnstile_token`. An unreachable or unconfigured intake fails
visibly and shows the business email. An inquiry is a request; any reply stays a
human action.

## Discovery: robots, sitemap, structured data (BDS-WEB-PR-v0.1 CP4)

- `/robots.txt` and `/sitemap.xml` are explicit entries in the public route map.
  Before CP4 the app served neither. Production `robots.txt` was only Cloudflare's
  managed content-signal block, with no `User-agent` or `Disallow` lines. Cloudflare
  places that block in front of the origin file, so the origin rules now apply.
- `robots.txt` keeps the login, account, and checkout exclusions and adds
  `Sitemap: https://bds-digitalsolutions.com/sitemap.xml`.
- `sitemap.xml` lists the canonical URL of every page without `noindex`, plus
  `/apps`. `/apps/<slug>` detail pages are not listed: Forge_Command publishes that
  catalog, and a static sitemap would drift from it. A test fails when a page's
  canonical URL and the sitemap disagree, so a new page must be added to both.
- `media.html` carries one `application/ld+json` Organization block: legal name,
  URL, seal logo, media email, Lexington, KY, and founder. These are stable facts
  only. A test pins the allowed keys.

## Homepage Content Blocks

`index.html` currently carries the main brand story:

- authority-driven hero
- product preview cards
- security strip and zone diagram
- licensing preview cards
- founder / company background
- expanded footer navigation
- ambient HUD assistant

## Shared-Asset Boundary

All public pages load the shared style sheets, including `hud.css`. Only the homepage actually instantiates HUD markup and the inline HUD behavior. All pages now load the shared header script from `src/js/site.js`.

## Content Gaps

The site communicates several future capabilities that are not implemented here yet:

- dedicated product detail pages beyond AuthorForge
- contextual HUD intelligence beyond static suggestions

AuthorForge Pro checkout is now live through ForgeCustomer (Stripe-hosted),
replacing the earlier placeholder-only commerce posture.

That gap is acceptable as long as the marketing copy remains explicit about planned versus available functionality.
