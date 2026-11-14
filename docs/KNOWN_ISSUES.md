# Known Issues

Repository-level concerns and investigation history. Existing component records and plan decisions remain authoritative for their own scope; link them here rather than duplicating them. No comprehensive defect audit is implied by this file.

## Model findings pilot intake

Pilot: `BDS-MODEL-FINDINGS-TOP10-v0.1`. See [the review checklist and evidence rules](MODEL_FINDINGS_PILOT.md) and [session log](model-findings/sessions.yaml).

Initial phase: **`baseline_after_merge`**. During the comparison baseline, continue normal issue handling. During structured intake, record each distinct model-raised concern here or link it to an existing record before closing the review. Untested claims are **unverified**. Keep verification separate from open/deferred/closed disposition, preserve disproven claims, and require relevant evidence for fix closure. Existing entries retain their historical provenance and are not reverified by this addition.

### Pilot findings

New observations go below this heading or into existing linked entries. Setup observations are marked separately and do not count as pilot effectiveness results.

#### MF-BDS-20260906-001 — Documentation build skips the snapshot validator in a clean checkout

- Origin: Codex setup inspection, 2026-09-06; model version unavailable.
- Baseline: `842b63aee2f7b3f31cf88d88e98052f4b334e239`; category: documentation validation; setup observation, excluded from effectiveness metrics.
- Evidence: `doc/system/BUILD.sh` invokes the snapshot validator only when `[ -x "$VALIDATOR" ]` is true. The pinned Git tree records `doc/system/validate_snapshots.sh` with mode `100644`, so that condition is false in a clean checkout. The native build exits successfully without running that check.
- Expected: the documented snapshot validation runs during a normal documentation build, or an unavailable validator is reported explicitly.
- Verification: **confirmed conditional validation gap**. An explicit `bash doc/system/validate_snapshots.sh doc/BDSSYSTEM.md` passed for the pilot candidate; this does not repair the build condition.
- Severity: provisional medium; build success alone can omit the snapshot check.
- Disposition: **closed** 2026-09-25. Owner: Charles Boswell.
- Candidate correction in PR #29: invoke the validator through Bash when the file exists and fail if it is missing. CI also rebuilds the generated reference and rejects drift. Closure requires the corrected commit's verification and merge receipt.
- Closure receipt, 2026-09-25: PR #29 merged at 2026-09-06T12:04:00Z as `ba09bac8c8f4babef88bfe8d40c70b2ad3815882`. Both PR #29 CI jobs passed. On `main` at `43a14d4b97b0fd724ffd2b88697406688a87d1f5`, `doc/system/BUILD.sh` runs the validator through Bash (mode `100644` still applies). A normal build ran the snapshot validation and produced no `doc/BDSSYSTEM.md` drift. A build with the validator removed failed with `BUILD_FAILED: missing validator` and exit 1.
- Verification limit: GitHub Actions did not start CI for `main` at `1cf855f` or `43a14d4`. See KI-BDS-20260925-001. The CI documentation job was run locally on `43a14d4` in its place and passed.

## KI-BDS-20260925-001 — GitHub Actions does not start CI because of an account billing lock

- Found: 2026-09-25, during the closure check for MF-BDS-20260906-001.
- Evidence: the `CI` runs for `main` at `1cf855f` and `43a14d4` show `failure`. Neither job started. The check-run annotation reads: "The job was not started because your account is locked due to a billing issue."
- Root cause: a billing lock on the GitHub account or the `Boswell-Digital-Solutions` organization. The cause is not in this repository.
- Impact: no CI evidence exists for commits after `df2904f`. A red check on `main` does not mean a code failure while the lock applies. The HUD browser job has no local substitute run.
- Local substitute, 2026-09-25, `43a14d4`: `bun test tests` passed 24/24, `tools/qc/no-side-door.ts` passed, `qc:stateforge` passed, and the documentation build produced no drift.
- Fix: clear the billing lock in the GitHub account or organization billing settings, then re-run CI on `main`.
- Disposition: **open**. Owner: Charles Boswell. Close when CI starts and passes on `main`.
- Evidence, 2026-10-02: GitHub Actions CI started and passed on PRs #35–#40 (both jobs, including the HUD browser job). The lock appears cleared. Closure still needs a passing CI run on `main` itself.

## KI-BDS-20261002-001: `/apps` lists AuthorForge as live before release

- Found: 2026-10-02, BDS-WEB-PR-v0.1 CP5 production check.
- Evidence: production `/apps` shows AuthorForge as `live 1.0.0` with a 2026-06-01 go-live date. The Author-Forge repository has no published GitHub release and reports version 0.1.0. Every other public page labels AuthorForge "in development" (#37).
- Root cause: `src/lib/products/products.json` is published by Forge_Command (Fleet → Website Publish), not authored in this repository. It still carries the placeholder `status: "live"`, `version: "1.0.0"`, and `commitSha: "seed-catalog-record"`.
- Fix: republish AuthorForge as `coming_soon` from Forge_Command. `/apps` then shows "About AuthorForge" and "Release not yet announced" (#37).
- Disposition: **open**. Owner: Charles Boswell.

## KI-BDS-20261002-002: First `/api/forge/v1/plans` after idle returns 504

- Found: 2026-10-02, BDS-WEB-PR-v0.1 CP4/CP5 production checks (seen twice).
- Evidence: the first `GET /api/forge/v1/plans` after an idle period returned `504`. The next requests returned `200` in about 0.3 s. `/pricing.html` shows "Request failed (504)" to that first visitor.
- Root cause: likely a ForgeCustomer cold start that exceeds the BFF upstream deadline. Unverified; the cause is not in this repository.
- Fix: keep ForgeCustomer warm or size the instance so it stays up. Optionally show a friendlier retry message on the pricing page.
- Disposition: **open**. Owner: Charles Boswell.

## KI-BDS-20261002-003: Extensionless page aliases use the asset cache policy

- Found: 2026-10-02, BDS-WEB-PR-v0.1 CP5 production check.
- Evidence: `/media` returns `Cache-Control: public, max-age=300`; `/media.html` returns `no-store`.
- Root cause: `cacheControlFor()` in `server/security/publication.ts` reads the request path. Only paths ending in `.html` or `/` get `no-store`.
- Fix: compute the cache policy from the resolved file (`media.html`), not the request path.
- Scope found during the fix: the old rule matched only the exact path `/`, not every path that ends in `/`. So `/media`, `/media/`, `/white-papers`, and `/white-papers/` all returned `public, max-age=300` on the deployed site (checked 2026-11-02, both through Cloudflare and directly at the Render origin).
- Fix applied 2026-11-02: `cacheControlFor()` now takes the resolved relative path. A test in `tests/security.test.ts` fails on the old code and pins `no-store` for `/`, `/media`, `/media/`, `/media.html`, `/white-papers`, and `/white-papers/`. On the local server, all six return `no-store`; assets and `robots.txt` keep their policies.
- Also corrected in the same change: `doc/system/05-page-inventory.md` said that only the homepage mounts the HUD and that Pro checkout is live. The source shows the HUD mounts on every page, and checkout is paused (#37).
- Closure receipt, 2026-11-02: PR #53 merged as `ffcb4aa`. The deployed site returned `no-store` at 00:57Z, about one minute after the merge. `/`, `/media`, `/media/`, `/media.html`, `/white-papers`, `/white-papers/`, and `/.well-known/security.txt` all return `no-store`, both through Cloudflare and directly at the Render origin. Press assets keep `public, max-age=86400`.
- Disposition: **closed** 2026-11-02. Owner: Charles Boswell.

## KI-BDS-20261002-004: A documentation-only push may redeploy the Render service

- Found: 2026-10-02, CI scope rollout.
- Evidence: `render.yaml` sets no `autoDeployTrigger` and no `buildFilter`. Render deploys on each push to the watched branch by default. A GitHub Actions `paths` filter cannot stop this.
- Not verified: the Render dashboard setting for this service. The deploy does not read Markdown, so a documentation-only deploy publishes no new content.
- Mitigation: `render.yaml` now sets `buildFilter.ignoredPaths` for `docs/**`, `doc/**`, `*.md` and `**/*.md`. A push that changes only those paths must not build. Any other path still builds.
- Not observed: no documentation-only push has run since the change. Not verified: the Render service may have been made by hand in the dashboard, and then it ignores `render.yaml`. The owner must confirm that the Blueprint manages the service, or set the same filter in the dashboard.
- Observed, 2026-11-07: the mitigation does not work. PR #57 changed only `docs/KNOWN_ISSUES.md`. Its merge `c521045` still started deploy `dep-dbnqpsp42hec73counq0` (trigger `new_commit`, live at 22:58Z, about 30 s). Render did not apply the `buildFilter` from `render.yaml`.
- Root cause: the Blueprint does not manage this service. The dashboard sets its configuration. Further evidence: the deployed `BDS_ALLOWED_HOSTS` and health check path differ from `render.yaml` (KI-BDS-20261107-001).
- Fix (operator, Render dashboard): in the `bds_website` service settings, set the build filter to ignore `docs/**`, `doc/**`, `*.md` and `**/*.md`. Then confirm that the next documentation-only merge starts no deploy. This entry's own merge will also deploy once.
- Disposition: **open**, low severity. The `render.yaml` mitigation has no effect. Owner: Charles Boswell.

## KI-BDS-20261102-001: Cloudflare raises the browser cache time of `.js` and `.txt` files to 4 hours

- Found: 2026-11-02, during the deployed-site check for KI-BDS-20261002-003.
- Evidence: the Render origin sends `Cache-Control: public, max-age=300` for `/src/js/site.js` and `/robots.txt`. Through Cloudflare, the same files return `public, max-age=14400`. `/sitemap.xml` keeps `max-age=300`, and HTML pages keep `no-store`.
- Root cause: the Cloudflare zone's Browser Cache TTL setting (4 hours). Cloudflare applies it to its default cacheable file types, which include `.js` and `.txt` but not `.xml`. The setting is in the Cloudflare dashboard, not in this repository. Confirmed 2026-11-02: the operator changed only that setting, and the live headers then matched the origin.
- Impact: a returning visitor can run a cached script for up to 4 hours after a deploy. HTML is unaffected.
- Fix, part 1 (code, this repository): pages now load scripts and style sheets from `/v/<asset version>/src/{js,styles}/...`. The version is the first 12 hex characters of a SHA-256 over every file path and its bytes under `src/js/` and `src/styles/`. A deploy that changes a script or style sheet changes the URL, so no browser or CDN can serve a stale copy. Nested module imports and CSS `@import` resolve against the prefixed URL, so they inherit the version with no source change. Versioned URLs return `public, max-age=31536000, immutable`. `bun run assets:stamp` rewrites the stamps; `tools/assets/version.ts --check` fails CI and `qc:security` on a stale stamp.
- Fix, part 2 (operator, Cloudflare dashboard): the operator set the zone's Browser Cache TTL to "Respect Existing Headers" on 2026-11-02.
- Verification (2026-11-02, through Cloudflare): `/robots.txt`, `/src/js/site.js`, and `/sitemap.xml` return `public, max-age=300`. `/v/fd45d9db84a1/src/js/site.js` returns `public, max-age=31536000, immutable`. `/src/assets/media/bds/bds-seal-500.webp` returns `public, max-age=86400`. `/` and `/media` return `no-store`.
- Disposition: **closed** 2026-11-02. Part 1 shipped in #55; part 2 is a dashboard setting. If the dashboard setting reverts, the versioned URLs still protect scripts and style sheets. Owner: Charles Boswell.

## KI-BDS-20261107-001: The deployed host list rejects both `www` hosts

- Found: 2026-11-07, BDS Client Intake WP-00 evidence (Addenda 2 and 4).
- Evidence: the operator copied `BDS_ALLOWED_HOSTS` from the Render dashboard on 2026-11-07. The stored value writes `www\.bds-digitalsolutions.com` and `www\.boswelldigitalsolutions.com`. `isAllowedHost` in `server/security/http.ts` does an exact match after `splitCsv`, so an entry with a backslash never matches. A local run of `validateAllowedHost` at `5be4b75` returned `403 HOST_NOT_ALLOWED` for `www.bds-digitalsolutions.com` and `www.boswelldigitalsolutions.com`.
- Not verified: whether `www` traffic reaches the origin. The apex loads on the operator's phone (2026-11-07 17:38). Cloudflare may redirect `www` to the apex first. That redirect and the Render custom-domain list for `www` were not checked.
- Root cause: a hand-entered dashboard value. `render.yaml` writes the `www` hosts without a backslash. The difference also shows that the dashboard, not the Blueprint, sets this service's environment. See KI-BDS-20261002-004.
- Fix (operator, Render dashboard): replace the value with `bds-website.onrender.com,bds-digitalsolutions.com,www.bds-digitalsolutions.com,127.0.0.1,localhost,[::1],::1`. No quotes and no backslashes. Then request `https://www.bds-digitalsolutions.com/` and confirm it does not return 403.
- Disposition: **open**. Owner: Charles Boswell.

## KI-BDS-20261107-002: The deployed host list allows the former domain

- Found: 2026-11-07, with KI-BDS-20261107-001.
- Evidence: the stored `BDS_ALLOWED_HOSTS` contains `boswelldigitalsolutions.com`, the former domain. `tests/security.test.ts` names that domain as FORMER and requires the default allowlist to refuse it. `render.yaml` does not list it.
- Root cause: unknown. Either the operator intends to serve the former domain again, which the repository does not reflect, or the stored value is stale.
- Fix: the operator decides. To refuse the former domain, apply the value in KI-BDS-20261107-001. To serve it, keep it in the dashboard and update `render.yaml` and the tests in the same change.
- Disposition: **open**, awaiting an operator decision. Owner: Charles Boswell.

## KI-BDS-20261107-003: The Render origin accepts requests that bypass Cloudflare

- Found: 2026-11-07, BDS Client Intake WP-00 evidence (Addendum 1, CF-01).
- Evidence: the allowlist includes `bds-website.onrender.com`. `validateEdgeToken` in `server/security/http.ts` runs only when `BDS_EDGE_TOKEN` is set or `BDS_REQUIRE_EDGE_TOKEN=true`. The operator confirmed on 2026-11-07 that neither is set on the Render service. The complete list has four variables.
- Impact: a client can call the origin directly and skip every Cloudflare control: WAF rules, rate limits and any future Turnstile check. Origin rate limiting would also see Cloudflare's address unless `CF-Connecting-IP` is trusted, and that header is trustworthy only behind the edge token.
- Fix: the mechanism already exists. Set a Cloudflare request-header rule that adds `x-bds-edge-token`, set the same value as `BDS_EDGE_TOKEN` on Render, then set `BDS_REQUIRE_EDGE_TOKEN=true`. The edge plan in `docs/plans/BDS_Website_CSSA_Sentinel_Security_Plan_Set_2026-06-12/`, component 04, covers this. Its status was not checked.
- Related: `BDS_INTAKE_URL` is also not set, so `/api/intake/consultation` returns 503 and every form falls back to email. The BDS Client Intake plan set tracks that gap.
- Disposition: **open**. Owner: Charles Boswell.

## KI-BDS-20261114-001: Render gates no deploy on configuration

- Found: 2026-11-14, guardrail review after the ForgeCustomer auth-key incident of the same day.
- Evidence: the Render dashboard shows no health check path for `bds_website`. `render.yaml` sets `healthCheckPath: /healthz`, but the Blueprint does not manage this service (KI-BDS-20261002-004). `/healthz` returns 200 whatever the configuration is. On 2026-11-14 the deployed `/readyz` returned `503` with only `["configuration_required"]`. It checked presence only, and it required `BDS_INTAKE_URL`, which is deliberately unset (KI-BDS-20261107-003). It was therefore red every day and could not serve as a gate.
- Fix, part 1 (code, PR on branch `claude/relaxed-johnson-iyd1jp`): `/readyz` now checks that `FORGECUSTOMER_API_BASE`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` are present and usable. It reports `BDS_INTAKE_URL` as advisory only. The 503 body names each failed setting and a reason code, never a value. `/api/public-config` and the HUD proxy withhold an anon key that has a secret shape. `docs/operations/render_probe.json` is the post-change probe. Reference: §9 "Liveness and Readiness".
- Expected result for today's deployed values: 200. Checked from outside on 2026-11-14 without reading any secret: the public Supabase URL is HTTPS on `*.supabase.co` with no path, the anon key has the `sb_publishable_` shape, and the BFF reaches ForgeCustomer (a dummy bearer returns `401 INVALID_TOKEN`). Not verified: the scheme of `FORGECUSTOMER_API_BASE`. The BFF accepts plain HTTP while `NODE_ENV` is unset (KI-BDS-20261114-003), and readiness rejects it.
- Fix, part 2 (operator, Render dashboard): after the merge deploys, request `https://bds-website.onrender.com/readyz` and confirm 200. Then set the service health check path to `/readyz`. Readiness depends only on the environment, and Render changes the environment only through a new deploy. So a bad value fails that deploy and the previous instance keeps serving. A running instance does not change state.
- Before part 2: confirm that the host Render uses for its internal health check is in the deployed `BDS_ALLOWED_HOSTS`. If it is not, the check gets `403 HOST_NOT_ALLOWED` for every configuration.
- Disposition: **open**. Owner: Charles Boswell. Close when the dashboard health check path is `/readyz` and a deploy passes it.

## KI-BDS-20261114-002: Edge authentication would block Render's health check

- Found: 2026-11-14, with KI-BDS-20261114-001.
- Evidence: `dev-server.ts` runs `validateEdgeToken()` before it routes `/healthz` and `/readyz`. Render's internal health check does not pass through Cloudflare, so it carries no `x-bds-edge-token` header. When the operator sets `BDS_REQUIRE_EDGE_TOKEN=true` (KI-BDS-20261107-003), both paths return `403 EDGE_TOKEN_INVALID` to Render. With a health check path set, every deploy then fails.
- Not changed: exempting the health paths from the edge token is a security-boundary change and needs its own review.
- Fix: before enabling the edge token, decide one of these: exempt only `/healthz` and `/readyz` from the edge check, or remove the Render health check path. Then enable the token.
- Disposition: **open**, latent; the edge token is not enabled today. Owner: Charles Boswell.

## KI-BDS-20261114-003: The BFF accepts a plain-HTTP ForgeCustomer base on Render

- Found: 2026-11-14, with KI-BDS-20261114-001.
- Evidence: `parseConfiguredBaseUrl()` in `server/security/http.ts` refuses plain HTTP only when `NODE_ENV=production`. Render does not set `NODE_ENV` for this service (see the `render.yaml` comment). An `http://` value in `FORGECUSTOMER_API_BASE`, `SUPABASE_URL` or `BDS_INTAKE_URL` is therefore proxied over plain HTTP. The forwarded customer bearer token is in that request.
- Mitigation: `/readyz` now treats `RENDER=true` as deployed mode and reports `insecure_scheme` for such a value.
- Fix: make `parseConfiguredBaseUrl()` use the same deployed-mode rule (`isDeployed()` in `server/readiness.ts`). This is left to its own reviewed change, as `render.yaml` asks for `NODE_ENV`.
- Disposition: **open**. Owner: Charles Boswell.
