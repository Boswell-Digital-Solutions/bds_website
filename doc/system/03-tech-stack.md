# 3. Tech Stack

## Runtime Stack

| Layer | Technology | Notes |
|------|------------|-------|
| Public pages | HTML5 | Static multi-page site |
| Styling | CSS | Shared tokens plus page-specific styles |
| Interaction | Vanilla JavaScript | Shared `src/js/site.js`, homepage HUD inline script, plus `src/js/forge/*` ES modules for the account surface |
| Auth | Supabase JS (CDN ESM) | Client-side login; access token forwarded to the BFF |
| Customer/commerce API | ForgeCustomer (Rust/Axum) | Reached only through the server-side BFF proxy `server/forge.ts` (see §9) |
| Dev server / BFF | Bun + local TypeScript server | `bun run dev` executes `dev-server.ts`, which also serves `/api/forge/*` and `/api/public-config` |
| Package manager | Bun | Minimal `package.json`; no client bundler (modules load directly) |

## Design Stack

| Concern | Implementation |
|--------|----------------|
| Heading font | `DM Sans` |
| Body font | `Source Sans 3` |
| Token source | `src/styles/tokens.css` |
| Shared layout styles | `src/styles/global.css`, `header.css`, `footer.css`, `hud.css` |
| Homepage styles | `src/styles/pages/home.css` |
| Shared behavior | `src/js/site.js` |

## Quality / Governance Tooling

The repo also contains StateForge QC wiring:

- `tools/qc/stateforge.ts`
- `tools/stateforge/`
- `bun run qc:stateforge`

That tooling is part of the broader Forge governance workflow, not the website runtime itself.

## Practical Consequences

This stack is optimized for:

- low operational complexity
- easy inspection of shipped markup
- fast edits to copy and presentation
- simple hosting on any static-capable platform

Commerce and auth are now integrated through ForgeCustomer (server-side BFF) and
Supabase login; see §7 and §9.

It is not yet optimized for:

- component reuse through templates
- typed frontend logic
- automated content generation pipelines
