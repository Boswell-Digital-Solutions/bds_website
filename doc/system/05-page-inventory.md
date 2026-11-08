# 5. Page Inventory

## Implemented Public Pages

| Page | Path | Status |
|------|------|--------|
| Homepage | `index.html` | Primary authored page; most complete experience |
| Products | `products.html` | Live product-entry page for applications. **Under construction while `SALES_OPEN` is `false`.** |
| Services | `services.html` | Live services-entry page |
| Forge | `forge.html` | Live platform overview page |
| Meet SMITH | `meet-smith.html` | Live SMITH explainer framing it as the continuous authority HUD |
| Architecture | `architecture.html` | Live public architecture explainer with Mermaid layered-system diagram |
| White Papers | `white-papers/index.html` | Live public research archive with dated metadata and archive-style paper indexing |
| Store | `store.html` | Live licensing surface; Pro lane links to `pricing.html`. **Under construction while `SALES_OPEN` is `false`.** |
| Pricing | `pricing.html` | Live catalog + Stripe Checkout start (ForgeCustomer). **Under construction while `SALES_OPEN` is `false`.** |
| Security | `security.html` | Live security posture and responsible-disclosure page |
| About | `about.html` | Live company identity page |
| Founder | `founder.html` | Live founder background and governance-philosophy page |
| Media Center | `media.html` (served at `/media`, `/media/`, `/media.html`) | Static press page: company snapshot, three boilerplates, founder profile, AuthorForge press section (status: in development), story angles, technical-resource links, news state, media contact. In the main navigation before Contact and in the homepage Company footer group. It also has press-asset downloads and a media inquiry form on the governed intake lane (BDS-WEB-PR-v0.1 CP3). |
| Contact | `contact.html` | Live inquiry and support page wired to the public intake service |
| AuthorForge | `authorforge.html` | Live product detail page. **Under construction while `SALES_OPEN` is `false`.** |
| AuthorForge Founder | `authorforge-founder.html` | Live supporting detail page. **Under construction while `SALES_OPEN` is `false`.** |
| AuthorForge Cost Comparison | `authorforge-cost-comparison.html` | Live supporting detail page. **Under construction while `SALES_OPEN` is `false`.** |

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
| Sign in | `login.html` | Supabase login / sign-up / magic link. **Under construction while `SALES_OPEN` is `false`.** |
| Account dashboard | `account.html` | Subscription, licenses, installations/devices, usage, deletion controls. **Under construction while `SALES_OPEN` is `false`.** |
| Checkout success | `checkout/success.html` | Polls `GET /v1/subscriptions` until `grants_cloud: true`. **Under construction while `SALES_OPEN` is `false`.** |
| Checkout canceled | `checkout/cancel.html` | No-charge return page. **Under construction while `SALES_OPEN` is `false`.** |
| Account suspended | `account/suspended.html` | Landing page for `403 CUSTOMER_SUSPENDED`. **Under construction while `SALES_OPEN` is `false`.** |
| Account closed | `account/closed.html` | Landing page for closed/deleted accounts. **Under construction while `SALES_OPEN` is `false`.** |

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
  `/apps`. While `SALES_OPEN` is `false`, it omits the sales pages and `/apps`
  (see Sales Launch Switch). `/apps/<slug>` detail pages are not listed: Forge_Command publishes that
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

All public pages load the shared style sheets, including `hud.css`, and the shared script `src/js/site.js`. The HUD (`src/js/hud.js`, imported by `site.js`) mounts itself on every page that links `hud.css` (see §6).

## Static Cache Policy

`server/security/publication.ts` sets `Cache-Control` from the resolved file, not the request path:

| Resolved file | `Cache-Control` |
|---|---|
| A versioned script or style sheet, requested as `/v/<asset version>/src/{js,styles}/...` | `public, max-age=31536000, immutable` |
| Any `.html` page, and `.well-known/security.txt` | `no-store` |
| Anything under `src/assets/` | `public, max-age=86400` |
| Everything else (`src/js/`, `src/styles/`, `robots.txt`, `sitemap.xml`, white papers) | `public, max-age=300` |

An alias therefore gets the same policy as the page it serves. For example, `/media` and `/white-papers` are `no-store`, like `/media.html` and `/white-papers/`.

### Versioned asset URLs (KI-BDS-20261102-001)

Every page loads scripts and style sheets through the `/v/<asset version>/` prefix. The asset version is the first 12 hex characters of a SHA-256 over every file path and its bytes under `src/js/` and `src/styles/`. The browser resolves relative module imports, dynamic `import()`, and CSS `@import` against the importing URL. Nested files therefore inherit the prefix, and no JS or CSS source carries a version.

- The server strips the prefix and serves the file from `src/js/` or `src/styles/` only. Any other path under `/v/` returns 404.
- The server does not check the version value. An old version URL serves the current file, so a page cached before a deploy still loads.
- A change to any script or style sheet changes the version. Run `bun run assets:stamp` to rewrite the stamps in every page and in `server/apps.ts`. CI and `bun run qc:security` run `bun run tools/assets/version.ts --check`, which fails on a stale stamp.
- Unversioned `/src/js/` and `/src/styles/` URLs still resolve with `public, max-age=300`.

## Sales Launch Switch: Under-Construction Page

The app-sales surface is closed until the operator rolls it out (operator decision, 2026-11-08). `server/launch.ts` holds one flag, `SALES_OPEN`, which is `false`. While it is `false`, the server returns `under-construction.html` in place of each sales page. The response is `200`, `Cache-Control: no-store`, and `X-Robots-Tag: noindex`. The URL does not change, so links into the sales pages still work.

The gate covers these request paths:

- `/apps`, `/apps/`, and every `/apps/<slug>` page;
- `products.html`, `store.html`, and `pricing.html`;
- `authorforge.html`, `authorforge-founder.html`, and `authorforge-cost-comparison.html`;
- `login.html`, `account.html`, `account/closed.html`, and `account/suspended.html`;
- `checkout/success.html` and `checkout/cancel.html`.

All other pages stay open, including the homepage, Media Center, Contact, white papers, and legal pages. The gate keys on the resolved file, so every alias of a sales page is covered. A non-GET request to a gated path returns `405`. The BFF and intake APIs are not gated. Checkout stays refused separately by `CHECKOUT_OPEN` (§8).

- `under-construction.html` is not in the route map. It is reachable only through the gate.
- The page is served at nested paths such as `/account/closed.html`, so every link in it is absolute. It links no sales page.
- While the gate is closed, `sitemap.xml` does not list the sales pages or `/apps`. A test checks the sitemap against `SALES_OPEN`.
- The original sales pages stay in the repository unchanged. Other pages still link to them, and those links lead to the under-construction page.

To roll out the sales surface:

1. Set `SALES_OPEN` to `true` in `server/launch.ts`.
2. Add the sales pages and `/apps` back to `sitemap.xml`.
3. When checkout opens, set `PURCHASES_OPEN` and `CHECKOUT_OPEN` (§8).
4. Run `bun test tests` and merge through a reviewed pull request.

## Content Gaps

The site communicates several future capabilities that are not implemented here yet:

- dedicated product detail pages beyond AuthorForge
- contextual HUD intelligence beyond static suggestions

AuthorForge Pro checkout runs through ForgeCustomer (Stripe-hosted), but it is
paused until AuthorForge is released (§8: `PURCHASES_OPEN` and `CHECKOUT_OPEN`).

That gap is acceptable as long as the marketing copy remains explicit about planned versus available functionality.
