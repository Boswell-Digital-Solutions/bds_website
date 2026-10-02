# BDS-WEB-PR-v0.1: Implementation Verification Report (CP4/WP04)

- Plan: BDS-WEB-PR-v0.1, BDS Website Media Center and Founder-Led Public Relations Surface
- Checkpoint: CP4/WP04. It covers discovery metadata, sitemap, documentation, and full QA.
- Base: `main` @ `f7989214bafdfdce7efe4711d866732798338088`. This includes CP1 (#35), CP2 (#36), the truth corrections (#37, #38), and CP3 (#39).
- Date: 2026-10-02
- Authority: the operator authorized CP4/WP04. This report establishes evidence only. It does not authorize CP5 (production release), deployment, publication, or media outreach.

Evidence classes are kept separate, as plan §07 requires: **source** (file contents), **automated test** (`bun test`), **runtime** (the real local Bun server), **rendered** (Chromium), and **deployment** (production). The local runtime has no ForgeCustomer or intake upstream configured.

## Work merged across the plan

| Checkpoint | PR | Content |
|---|---|---|
| CP1 | #35 | Canonical website domain `bds-digitalsolutions.com`; fixes the checkout and portal redirect allowlist; host, origin, and `render.yaml` allowlists; domain QC scan |
| CP2 | #36 | Static `/media` Media Center; Media in navigation on every public page |
| Truth corrections | #37, #38 | AuthorForge marked pre-release; website checkout paused; Navy and service-disabled-veteran-owned wording; founder service timeline |
| CP3 | #39 | Media inquiry on the governed intake lane; approved WebP press assets |
| CP4 | this PR | `robots.txt` and `sitemap.xml` served; JSON-LD; WCAG AA fixes; docs; this report |

## T0: Source lock and pre-flight

- The planning lock `3e1ef08` was refreshed at every checkpoint. CP4 base: `f798921`.
- All seven protocol provider IDs resolved at CP0 and were unchanged after plan preparation (GATE-00 packet).
- AUTHORITY_GAP-01 (`repo.manifest.yaml`) was dispositioned at CP0 (D-3). The manifest is a separate work package and is still open.

## T1: Unit and server checks (automated test)

`bun test tests`: **45 pass, 0 fail**. `bun run qc:security`: **37 pass, 0 fail**, plus "No server-side network side doors found" and the canonical-domain scan clean.

The suite covers:
- `/media`, `/media/`, and `/media.html` resolve; unlisted `/media/*` paths and traversal are refused.
- The intake accepts the media reason and source; invalid reasons, sources, and unknown keys are refused.
- The domain scan flags former-domain web hosts and exempts email values.
- The press-asset tree equals the approved list.
- `robots.txt` and `sitemap.xml` routes resolve. The sitemap equals the canonical URLs of all indexable pages plus `/apps`. `robots.txt` keeps the customer exclusions. The JSON-LD key set is pinned.

## T2: Component checks

NOT_APPLICABLE. The site has no component framework (plan §07).

## T3: API contract (runtime, real local BFF)

| Request | Result |
|---|---|
| Valid media inquiry (`reason` "Media / press inquiry", `source_page` "media.html") | passes validation, then `503 INTAKE_UNCONFIGURED` (no upstream; fail-closed) |
| Invalid reason | `400 INVALID_REASON` |
| Unknown field (`outlet`) | `400 UNKNOWN_FIELD` |
| Cross-origin | `403 ORIGIN_NOT_ALLOWED` |
| GET | `405` |
| `POST /api/forge/v1/checkout` (checkout pause, #37) | `503 CHECKOUT_PAUSED` |

## T4/T5: Integration and user journeys (rendered, Chromium)

| Journey | Result |
|---|---|
| Desktop header → Media | reaches `/media` |
| Mobile menu → Media (390 px) | reaches `/media`; no horizontal overflow |
| `/media`, `/media/`, `/media.html` | all 200; all carry canonical `https://bds-digitalsolutions.com/media` |
| Media → Founder, AuthorForge, Architecture, Security, White Papers | links present, all 200. Contact is reached through the header navigation. |
| Media inquiry, keyboard only | an empty submit is blocked by native validation; all 7 visible fields are labeled |
| Media inquiry, captured request | sends `reason`, `source_page`, and a message beginning `Outlet: … / Topic: … / Format: … / Deadline: …`, with an `Idempotency-Key` |
| Media inquiry against the real local BFF (503) | visible error that names `charlesboswell@boswelldigitalsolutions.com` |
| Press asset downloads (4) | `200 image/webp` |
| Internal files through the media area | `/src/assets/media/../../server/forge.ts`, `/src/assets/media/`, `/.env`, `/render.yaml`, `/doc/BDSSYSTEM.md`, `/docs/plans/...` all return 404 |
| Real end-to-end submission to an intake service | **UNVERIFIED**: no safe upstream in this environment. The operator should submit one test inquiry after deployment. |

## T6: Performance and asset discipline (rendered)

- The first `/media` load, without scrolling, makes 12 same-origin requests totalling about 394 KB. No full-size press asset loads. Previews are 8–30 KB WebP thumbnails with `loading="lazy"` and explicit dimensions.
- The whole press-asset tree is 728 KB of WebP.
- The repository workflow has no Lighthouse step, so no score is claimed and no numeric target is invented.

## T7: Publication and discovery (runtime)

| Check | Result |
|---|---|
| Explicit allowlist | unchanged in shape; adds only `/robots.txt` and `/sitemap.xml` |
| `/robots.txt` | `200 text/plain`; keeps the login, account, and checkout `Disallow` lines; adds `Sitemap:` |
| `/sitemap.xml` | `200 application/xml`; 23 URLs, all on `bds-digitalsolutions.com`; no customer surfaces |
| `/.well-known/security.txt` | `Contact` email unchanged; `Policy` and `Canonical` on the new host |
| Former-domain web-URL scan | clean (CI step and `qc:security`) |
| Business email and `mailto:` values | unchanged |

**Finding (fixed here):** before CP4 the app served neither `robots.txt` nor `sitemap.xml`; both returned 404 at the origin. The production `robots.txt` was only Cloudflare's managed content-signal comment block, so the login, account, and checkout exclusions were not live. Only the pages' own `noindex` tags protected them.

## T8: Accessibility and human-first review (rendered)

axe-core 4 (WCAG 2.0/2.1 A and AA rules) was run on every sitemap page at 1280 px and 390 px: 46 page renders.

| | Before CP4 | After CP4 |
|---|---|---|
| Homepage | 26 contrast failures, 1 `aria-hidden-focus` | 0 |
| `/media` | 6 contrast failures, 1 `aria-hidden-focus` | 0 |
| All 46 renders | contrast failures site-wide; 2 unfocusable scroll regions on mobile | **0 violations** |

Fixes (the operator approved the visual changes):
- Text on the orange accent is now Deep Navy instead of white: 6.4:1, or 5.0:1 on hover.
- `--text-muted` changed from `#6B7280` to `#8B95A7`: at least 4.9:1 on every navy surface.
- The closed HUD panel is `inert`.
- The scrollable diagram and table are focusable, labeled regions.

The repo HUD browser check (`bun run verify:hud`) passes 7/7 with the change.

Manual checks:
- one H1 with logical H2/H3 order on `/media`;
- landmarks and a skip link;
- descriptive alt text on all press previews;
- status messages are text, not colour alone;
- no horizontal page overflow at 390 px.

**BDS-HFPC-001 nontechnical-reviewer acceptance: UNVERIFIED.** It needs a human reviewer to explain what the Media Center is for, find the company, founder, and product information, and find how to submit a request, all without instructions.

## Truth review

- Each Media Center statement carries a claim class and owning source. The provenance tables are in the descriptions of #36, #37, and #38.
- AuthorForge appears as "in development" on every page; no GitHub release exists. The `/apps` catalog status still shows `live` until it is republished from Forge_Command.
- The Navy and service-disabled-veteran-owned statements rest on operator-supplied VA evidence. That evidence is not stored in this repository, and the page publishes no rating, condition, or identifier.
- Service figures use operator-supplied dates; the homepage says "more than two decades of military and public service".

## Known items not closed by CP4

| Item | Owner |
|---|---|
| Production deployment of #37–#39 and this PR, and production verification (CP5) | operator, separate authorization |
| AuthorForge `/apps` status set to `coming_soon` through Forge_Command → Fleet → Website Publish | operator |
| Full-resolution canonical seal (the published seal is 500 px) | operator to supply the original |
| One real media inquiry through production intake | operator, after deployment |
| Nontechnical-reviewer acceptance (BDS-HFPC-001) | operator |
| `repo.manifest.yaml` (AUTHORITY_GAP-01) | separate work package |
| CSP report-only "inline style" reports from existing scripts | pre-existing; outside this plan |

## Definition-of-done status (plan §07)

| Criterion | Status |
|---|---|
| In-scope T0, T1, and T3 checks pass | met |
| T4/T5 primary journeys exercised or marked | met; real upstream submission UNVERIFIED |
| No S0/S1 finding open | met. The S1 redirect defect was fixed in CP1; the live Pro checkout was paused in #37. |
| No unintended former-domain web URLs | met |
| Business email unchanged | met |
| Public allowlist fail-closed | met |
| Media inquiry proven through the real BFF boundary as far as the environment allows | met, to the `503 INTAKE_UNCONFIGURED` boundary |
| T8 accessibility | met (axe: 0). Human-first acceptance UNVERIFIED. |
| `doc/system` updated and `doc/BDSSYSTEM.md` rebuilt | met |
| Evidence classes separated | met (this report) |

Passing this definition of done does not authorize production deployment or media outreach.
