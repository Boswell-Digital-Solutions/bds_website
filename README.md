# BDS Website — Boswell Digital Solutions

**Status:** Initial scaffold  
**Stack:** Static HTML/CSS/JS → SolidStart migration path  
**Design System:** BDS Design System v1 (Dark Navy Dominant)

## Structure

```
bds_website/
├── index.html              # Homepage
├── products.html           # Products overview
├── store.html              # Store overview
├── security.html           # Security architecture
├── about.html              # About BDS
├── contact.html            # Contact
├── src/
│   ├── styles/
│   │   ├── tokens.css      # Design system tokens
│   │   ├── global.css      # Base styles + components
│   │   ├── header.css      # Site header/nav
│   │   ├── footer.css      # Site footer
│   │   ├── hud.css         # HUD assistant dock
│   │   └── pages/
│   │       └── home.css    # Homepage sections
│   ├── components/         # Component JS (future)
│   ├── layouts/            # Layout templates (future)
│   ├── pages/              # Page modules (future)
│   └── assets/
│       └── images/
├── public/                 # Static assets
└── docs/                   # Design system docs
```

## Design Principles

- **Navy = Structure** — Deep navy backgrounds, surface elevation via lighter navy
- **Orange = Action** — Sparingly used for CTAs and interactive emphasis
- **Fail-closed governance** — HUD never mutates state, always ambient
- **WCAG 2.1 AA** — Minimum 4.5:1 contrast, keyboard navigation throughout
- **No AI aesthetic slop** — No gradients, no glow, no purple tech tones

## HUD System

The BDS Support HUD is a bottom-right messenger widget (structure modeled on
the Render help widget). It self-mounts on every page that links `hud.css` —
`src/js/hud.js` injects the markup and is imported by `src/js/site.js`, so no
per-page markup is required.

- **Home tab** — live system status (`/healthz`), quick links, and a
  "Send us a message" action.
- **Messages tab** — a composer that posts to the governed intake lane
  (`/api/intake/consultation`, `source_page: "hud"`) plus the receipts of
  messages sent during the current browser session.
- Never auto-expands · keyboard navigable with focus trapping · reads only,
  never mutates business state.

> Two-way conversation threads (persistent history + agent replies) are a
> deliberate follow-on: they need a message store (Supabase/ForgeCustomer) and
> an operator reply path, which belongs in **Forge_Command**, not the
> marketing surface.

## Pages (Build Sequence)

1. ✅ Layout shell + design tokens
2. ✅ Homepage
3. ✅ Products overview + product detail template
4. ✅ Store + SKU page
5. ✅ Stripe Checkout integration (via ForgeCustomer BFF)
6. ✅ Security page
7. ✅ About + Contact + Legal
8. ✅ Account area (ForgeCustomer customer surface)
9. ⬜ HUD contextual intelligence

## ForgeCustomer Integration

Customer identity, commerce, licensing, entitlements, installations, and usage
are owned by **ForgeCustomer** (Rust/Axum). This site is a pure customer-surface
client: it renders ForgeCustomer state and never holds commercial truth.

- All ForgeCustomer calls route through the server-side BFF proxy in
  `server/forge.ts` (wired into `dev-server.ts`), which forwards the signed-in
  user's own Supabase access token. The browser never calls ForgeCustomer
  directly (it has no CORS layer), and `/v1/admin/*` is blocked by an allowlist.
- Login reuses Supabase. Public, non-secret config is served at
  `/api/public-config`; secrets are never exposed to the client.
- Config: copy `.env.example` and set `FORGECUSTOMER_API_BASE`, `SUPABASE_URL`,
  and `SUPABASE_ANON_KEY`.
- Full reference: `doc/system/09-forgecustomer-integration.md`.

## Run

- `bun run dev` — serves the site plus the BFF proxy locally (default
  `http://localhost:3000`; configure via `.env`, see `.env.example`).
- `bun run start` — same entry point; this is the production start command.

The server only exposes the public surface: root `*.html` pages, `src/`,
`legal/`, `account/`, `checkout/`, `white-papers/`, `favicon.svg`, and
`robots.txt`. Server code, internal docs (`doc/`, `docs/`), and tooling
(`tools/`) are never served.

## Deployment (Render)

The site deploys as a single Render **Web Service** — a Static Site won't do
because the ForgeCustomer BFF proxy must run server-side. `render.yaml` is a
Blueprint describing the service:

- **Runtime:** Node (Bun is preinstalled on Render; pinned via `BUN_VERSION`).
- **Build:** `bun install` — **Start:** `bun run start`
- **Health check:** `/healthz`
- **Environment:** `FORGECUSTOMER_API_BASE`, `SUPABASE_URL`, and
  `SUPABASE_ANON_KEY` are declared with `sync: false`; set their values in the
  Render dashboard. Until they are set, the static site serves normally and
  the commerce surface fails closed (503 `INTEGRATION_UNCONFIGURED` from the
  BFF, "Supabase is not configured" on login).

To deploy: Render Dashboard → **New → Blueprint** → select this repository.
The `free` plan spins down when idle; switch `plan` to `starter` in
`render.yaml` for an always-on production site.

## SDVOSB

Boswell Digital Solutions LLC is a Service-Disabled Veteran-Owned Small Business.
