# 4. Project Structure

## Top-Level Map

```text
bds_website/
├── AUDIT_REPORT.md
├── .env.example
├── bun.lock
├── dev-server.ts
├── server/
│   └── forge.ts            # ForgeCustomer BFF proxy (allowlist + token forwarding)
├── about.html
├── account.html
├── architecture.html
├── white-papers/
│   ├── Forge_White_Paper_AI_Accountability.docx
│   ├── Forge_White_Paper_Academic_v2.docx
│   ├── Leopold Ecology Stack — Source-locked Research Justification.docx
│   ├── Leopold_Complete_Technical_Specification.docx
│   ├── Leopold_Research_Validation_Analysis.docx
│   ├── Leopold_Strategic_Positioning.docx
│   ├── RIT_IEEE_White_Paper.docx
│   └── index.html
├── authorforge-cost-comparison.html
├── authorforge-founder.html
├── authorforge.html
├── contact.html
├── founder.html
├── forge.html
├── meet-smith.html
├── out/
│   └── stateforge.evidence.bundle.json
├── index.html
├── login.html
├── media.html              # Media Center (BDS-WEB-PR-v0.1)
├── pricing.html
├── products.html
├── security.html
├── services.html
├── store.html
├── checkout/
│   ├── success.html        # polls subscriptions; never trusts the redirect
│   └── cancel.html
├── account/
│   ├── suspended.html      # 403 CUSTOMER_SUSPENDED landing
│   └── closed.html         # closed / deleted account landing
├── legal/
│   ├── ecosystem.html
│   ├── eula.html
│   ├── privacy.html
│   ├── refund.html
│   └── terms.html
├── src/
│   ├── assets/images/
│   │   ├── bds-logo.png
│   │   ├── products/
│   │   │   ├── AuthorForge.webp
│   │   │   └── VibeForge.webp
│   │   └── site/
│   │       ├── Profimage.JPG
│   │       ├── Profimage.webp
│   │       └── SMITH_icon.png
│   ├── js/
│   │   ├── contact-form.js
│   │   ├── site.js
│   │   └── forge/              # ForgeCustomer client modules (see §9)
│   │       ├── account.js
│   │       ├── api.js
│   │       ├── checkout-success.js
│   │       ├── config.js
│   │       ├── deletion.js
│   │       ├── errors.js
│   │       ├── login.js
│   │       ├── pricing.js
│   │       ├── session.js
│   │       └── supabase.js
│   └── styles/
│       ├── footer.css
│       ├── global.css
│       ├── header.css
│       ├── hud.css
│       ├── tokens.css
│       └── pages/
│           ├── account.css
│           ├── home.css
│           ├── product-detail.css
│           ├── products.css
│           └── site-pages.css
├── docs/
│   ├── bds_design_system_color_tokens_v_1.md
│   ├── bds_homepage_wireframe_with_hud_v_1.md
│   ├── bds_website_pages_wireframes_v_1.md
│   ├── page-content-v1.md
│   └── store_security_architecture_v_1.md
├── doc/
│   ├── bwSYSTEM.md
│   └── system/
└── tools/
    ├── qc/
    │   ├── perf_budgets.json
    │   └── stateforge.ts
    └── stateforge/
        ├── fixtures/
        ├── out/
        ├── src/
        └── package.json
```

## Folder Roles

- `src/styles/` holds the actual reusable presentation system.
- `src/js/` holds the small shared/browser-side behaviors for navigation and contact-form submission.
- `src/js/forge/` holds the ForgeCustomer customer-surface client (auth, BFF calls, account/checkout/deletion controllers).
- `server/forge.ts` is the server-side BFF proxy to ForgeCustomer, wired into `dev-server.ts`.
- `src/assets/images/site/` holds shared public-page imagery such as the founder portrait and SMITH icon.
- `docs/` contains planning and reference material that informed the implementation.
- `white-papers/` holds the public white-paper landing page plus the current downloadable paper files.
- `doc/system/` is the maintained modular system reference.
- `out/` holds generated evidence artifacts already checked into the repo.
- `tools/` contains governance and QC support code, including a vendored StateForge workspace.

## Structural Observations

- Public IA now includes dedicated `services.html`, `forge.html`, `meet-smith.html`, and `architecture.html` routes in addition to the original marketing shell.
- Homepage product links now route into real public pages such as `authorforge.html`, `products.html#vibeforge`, and `services.html`.
- There is no `public/` directory in the checked-in structure despite the README describing one as a future/static asset area.
- Shared page chrome is repeated directly in HTML files rather than abstracted behind includes or templates.
