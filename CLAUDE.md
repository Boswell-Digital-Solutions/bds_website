# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

bds_website is the public marketing and commerce site for Boswell Digital Solutions — static HTML/CSS/JS pages (homepage, products, store, security, about, contact, account) served by a Bun server, with a path toward a SolidStart migration. It is a pure customer-surface client: all commercial truth (identity, billing, licensing, entitlements, installations, usage) is owned by ForgeCustomer (Rust/Axum) and reached only through a server-side BFF proxy — the browser never calls ForgeCustomer directly.

## Common Commands

- `bun run dev` / `bun run start` — serve the site plus the ForgeCustomer BFF proxy locally (default `http://localhost:3000`, configured via `.env`)
- `bun run qc:security` (`bun test tests/security.test.ts && bun run tools/qc/no-side-door.ts`) — security QC
- `bun run qc:stateforge` — stateforge QC
- `bun run verify:hud` — verify the support HUD

## Architecture

- Root `*.html` pages (index, products, store, security, about, contact) plus `src/styles/` (design tokens, global, header/footer, HUD, per-page) and `src/js/`.
- `server/forge.ts` is the server-side BFF proxy to ForgeCustomer, wired into `dev-server.ts` — it forwards the signed-in user's own Supabase access token, and `/v1/admin/*` is blocked by an allowlist.
- Login/session reuse Supabase; public non-secret config is served from `/api/public-config` — secrets never reach the client.
- The BDS Support HUD (`src/js/hud.js`, imported by `src/js/site.js`) self-mounts on any page that links `hud.css`. It never mutates business state, and falls back to a governed intake lane (`/api/intake/consultation`) when the signed-in threading path (Supabase schema + Forge_Command operator inbox) isn't configured.
- The server only exposes the public surface (`*.html`, `src/`, `legal/`, `account/`, `checkout/`, `white-papers/`, `favicon.svg`, `robots.txt`). Server code, `doc/`, `docs/`, and `tools/` are never served.
- Deploys to Render as a single Web Service (not a Static Site — the BFF proxy has to run server-side); `render.yaml` is the Blueprint.

## Notes

- Config: copy `.env.example` and set `FORGECUSTOMER_API_BASE`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`. Until those are set, the static site still serves, but the commerce surface fails closed (503 `INTEGRATION_UNCONFIGURED` from the BFF, "Supabase is not configured" on login).
- Full ForgeCustomer integration reference: `doc/system/09-forgecustomer-integration.md`.
- Boswell Digital Solutions LLC is a Service-Disabled Veteran-Owned Small Business (SDVOSB).
