# BDS-WEB-PR-v0.1: Production Release Receipt (CP5/WP05)

- Plan: BDS-WEB-PR-v0.1, BDS Website Media Center and Founder-Led Public Relations Surface
- Checkpoint: CP5/WP05, production release and production verification
- Verified: 2026-10-02, against `https://bds-digitalsolutions.com`
- Released revision: `main` @ `1149415` (#40). Production served the CP4 markers, so this revision was live.
- Deploy path: the existing Render Web Service from `main`, operated by the operator. Claude Code did not trigger, change, or roll back any deployment.
- Authority: the operator authorized CP5/WP05. Production verification does **not** authorize outbound media pitching, a press release, or automated outreach (plan §08).

All checks below are **deployment evidence**: read-only requests to production, or requests built to be rejected so that no record is created.

## GATE-05 checks

| Check | Result |
|---|---|
| `/media`, `/media/`, `/media.html` | 200; all carry canonical `https://bds-digitalsolutions.com/media` |
| Media JSON-LD | present (one Organization block) |
| Press assets (4) | `200 image/webp`; byte sizes match the repository files |
| `/robots.txt` | 200. Origin rules are now live behind Cloudflare's managed block: `Disallow` for `/login.html`, `/account.html`, `/account/`, `/checkout/`, plus `Sitemap:` |
| `/sitemap.xml` | `200 application/xml`; 23 URLs, all on `bds-digitalsolutions.com` |
| `/.well-known/security.txt` | `Contact` unchanged (`charlesboswell@boswelldigitalsolutions.com`); `Policy` and `Canonical` on the new host |
| Former-domain web references | **0** across all 23 live sitemap pages |
| Business email | present and unchanged (9 `@boswelldigitalsolutions.com` references across the live pages) |
| Private artifact exposure | `/server/forge.ts`, `/.env`, `/render.yaml`, `/package.json`, `/.git/config`, `/doc/BDSSYSTEM.md`, `/docs/plans/…`, `/tests/…`, `/src/assets/media/`, and media-tree traversal all return **404** |
| Checkout pause (#37) | `POST /api/forge/v1/checkout` returns **`503 CHECKOUT_PAUSED`**, refused before any upstream call. Live `pricing.js` has `PURCHASES_OPEN = false`. |
| Intake contract | an invalid reason returns `400 INVALID_REASON`; an unknown field returns `400 UNKNOWN_FIELD` (no record created) |
| Security headers on `/media` | HSTS (preload), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, report-only CSP |
| `/healthz` | `{"status":"ok"}` |
| Accessibility (axe-core, WCAG 2.0/2.1 A and AA) on production HTML and CSS | **0 violations** on `/media`, `/`, `/pricing.html`, `/founder.html`, `/contact.html` at 1280 px and 390 px; `/media` has no overflow at 390 px |

Tooling note: production pages were loaded into Chromium through `curl`, because the sandbox network proxy blocks Chromium's direct connection. External font requests were blocked; colour contrast does not depend on fonts.

## Findings recorded at release

| # | Finding | Severity | Owner / disposition |
|---|---|---|---|
| R-1 | `/apps` still lists AuthorForge as `live 1.0.0`. `products.json` is published by Forge_Command, not authored here. | S2 (public truth) | Operator: republish AuthorForge as `coming_soon` through Forge_Command → Fleet → Website Publish |
| R-2 | The first `GET /api/forge/v1/plans` after idle returned **504** (ForgeCustomer cold start); the next two returned 200 in about 0.3 s. The pricing page shows "Request failed (504)" to the first visitor after idle. | S3 | ForgeCustomer hosting (keep-warm or instance sizing); outside this plan |
| R-3 | `/media` (extensionless) is served `Cache-Control: public, max-age=300`, but `/media.html` is `no-store`. The cache rule reads the request path, not the resolved file. | S4 (consistency) | Follow-up: compute the cache policy from the resolved file in `server/security/publication.ts` |
| R-4 | A real media inquiry has not been submitted through production intake. | Verification gap | Operator: submit one test inquiry from `/media` and confirm it arrives |
| R-5 | Nontechnical-reviewer acceptance (BDS-HFPC-001) has not been done. | Verification gap | Operator |
| R-6 | The canonical seal is published at 500 px. | Asset quality | Operator to supply the full-resolution original |

## Rollback state

Each checkpoint is one squash commit on `main`. Rollback is per checkpoint: a `git revert` of the commit through a reviewed PR, or a Render redeploy of an earlier deploy.

| Commit | PR | Change |
|---|---|---|
| `1149415` | #40 | CP4: robots, sitemap, JSON-LD, WCAG AA |
| `f798921` | #39 | CP3: media inquiry and press assets |
| `85d9516` | #38 | Founder service timeline |
| `f9452f0` | #37 | AuthorForge pre-release, checkout pause, Navy/SDVO wording |
| `896cd5d` | #36 | CP2: Media Center and navigation |
| `70deca2` | #35 | CP1: canonical domain and redirect fix |
| `3e1ef08` | #34 | Pre-plan baseline |

Do not revert #37 without first re-checking AuthorForge release status: a revert re-opens the Pro checkout.

## Plan status

GATE-05 production checks pass, with findings R-1 to R-6 recorded. The plan's implementation scope (CP0 to CP5) is complete. External media publication, press releases, and outreach remain human-controlled and are not authorized by this receipt.
