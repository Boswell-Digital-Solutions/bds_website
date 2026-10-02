# 8. Quality & Handover

## Local Commands

```bash
bun run dev
bun test tests
bun run tools/qc/no-side-door.ts
bun run qc:stateforge
bun run verify:hud
bash doc/system/BUILD.sh
```

## Current Quality Posture

`.github/workflows/ci.yml` runs on every pull request and push to `main`
that changes code, with read-only repository permission. A change that
touches only documentation does not run it (see "Which CI runs for which
change"). One
Ubuntu job runs the app-route/security tests, governed egress guard, and the
StateForge verifier (which runs its unit suite from its own directory plus
positive and negative fixtures). It rebuilds `doc/BDSSYSTEM.md` and fails on
generated drift. The builder always runs its snapshot validator through Bash
and rejects a missing validator, regardless of its executable permission.

A separate Ubuntu job starts the local website and exercises the desktop and
mobile HUD with Chromium. Playwright 1.58.2 is installed for CI only; screenshots
are retained for seven days. Bun 1.3.11 matches the deployment configuration.
All commands are blocking. The jobs use no live integration credentials, make
no live commerce claims, and do not publish or deploy the website.

What exists now:

- deterministic static page rendering
- shared mobile-navigation behavior via `src/js/site.js`
- contact-page intake submission via `src/js/contact-form.js`
- shared CSS tokens and layout styles
- shared content-page styling for services, forge, architecture, security, about, contact, and store routes
- published legal policy pages for privacy, terms, refund, and EULA
- contact and legal surfaces now consistently point to the same business email address
- lightweight homepage HUD interaction script
- StateForge QC wiring in-repo
- checked-in StateForge evidence and report artifacts under `out/` and `tools/stateforge/out/`
- legal and content planning docs

What does not exist yet:

- broader frontend coverage beyond the existing desktop/mobile HUD harness
- broken-link enforcement
- templating to remove duplicated layout markup
- production commerce integration tests

## Which CI runs for which change

A change that touches only documentation runs the Documentation CI and no code CI.
A change that touches any other file runs the code CI.
A change that touches both runs both.
The code CI runs only when code changes. No schedule starts a full run.

The `CI` workflow (`.github/workflows/ci.yml`) has a workflow-level `paths` filter on `pull_request` and `push`.
The filter includes `**` and then excludes `docs/**`, `doc/**` and `**/*.md`.
The last matching pattern wins.
A change to `.github/workflows/**` is code, so it runs the code CI.

No documentation path is re-included.
The route tests, the egress guard, the canonical-domain check, the StateForge verifier and the HUD browser check read HTML, TypeScript, JavaScript, JSON, YAML, XML and CSS files.
The canonical-domain check skips `docs/`.
No test or tool reads a Markdown file.
The server publishes only `*.html`, `src/`, `legal/`, `account/`, `checkout/`, `white-papers/`, `favicon.svg`, `robots.txt` and `sitemap.xml`.
The site build does not read Markdown, so a Markdown change publishes no content.
Render builds follow the same rule: `buildFilter.ignoredPaths` in `render.yaml` skips a build for a documentation-only push.

The `Documentation CI` workflow (`.github/workflows/documentation.yml`) runs for `docs/**`, `doc/**`, `**/*.md` and its own file.
It runs `bash doc/system/BUILD.sh` and fails if `git diff --exit-code -- doc` shows a difference.

The repo has no secret scanner workflow today.
A secret scanner must run on every change, because a documentation file can hold a secret.

Render deploys the service from `render.yaml`.
Render starts a deploy on each push to the branch it watches. This is Render configuration, not a GitHub workflow.
The path filter does not stop it.

Do not add a required status check on a path-filtered workflow.
When the filter skips the workflow, the required check stays pending and blocks the merge.

## Known Risks

1. AuthorForge Pro checkout is **paused** until AuthorForge is released (operator decision, 2026-10-02). `src/js/forge/pricing.js` `PURCHASES_OPEN` hides the Upgrade action, and `server/forge.ts` `CHECKOUT_OPEN` makes the BFF refuse `POST /v1/checkout` with `503 CHECKOUT_PAUSED`. To reopen, set both to `true`. The plans themselves stay in ForgeCustomer and Stripe. Before the pause the flow ran through ForgeCustomer (Stripe-hosted) via `pricing.html`; the one-time Standard license still uses contact-based coordination. Checkout correctness depends on a reachable ForgeCustomer and the webhook-driven subscription projection (the success page polls rather than trusting the redirect).
2. Only AuthorForge has a dedicated detail page today; additional product pages will need the same treatment as the portfolio expands.
3. The contact form now depends on public intake-service availability; if that service is down, users fall back to business email.
4. Security and ecosystem claims can outpace implementation if future copy is not kept precise.
5. Repeated header/footer markup increases drift risk across pages.

## Maintenance Rule

When the website structure or system claims change:

1. update the relevant `doc/system/*.md` part files
2. rebuild the assembled `doc/BDSSYSTEM.md` with `bash doc/system/BUILD.sh`
3. keep architectural claims aligned with implemented behavior
