# 1. Overview & Philosophy

## Purpose

`bds_website` is the public marketing surface for Boswell Digital Solutions. It presents:

- company positioning
- Forge applications and platform framing
- services and advisory work
- systems architecture thought surface
- a security-first posture
- a commerce and account surface for licensed software, backed by ForgeCustomer
- legal pages for terms, privacy, refund, and EULA

## Current Delivery Model

The site is implemented as static HTML/CSS with a minimal vanilla JavaScript
layer. The marketing pages stay simple:

- no framework runtime in production pages
- no client-side state management library

The account surface adds a thin, dependency-light client (`src/js/forge/*`) plus
a server-side BFF proxy (`server/forge.ts`) for ForgeCustomer:

- Stripe Checkout start and a signed-in account area are live (see §7, §9)
- Supabase handles login; the website holds no commercial truth of its own

This keeps the public surface easy to inspect and cheap to ship while the brand, copy, and governance posture are still being refined.

## Information Architecture

The current public IA separates the commercial lanes intentionally:

- `Products` is the buyer entry point for applications
- `Services` is the entry point for consulting and delivery work
- `Forge` explains the platform philosophy behind Forge-branded applications
- `Architecture` is the authority lane for principles, papers, and future-system previews
- `Store` remains available as a licensing surface, but it is not a top-level nav item

## Product Philosophy

The presentation model is consistent across the repo:

- governance-first before feature-first
- dark, controlled visual language instead of trend-driven startup styling
- security claims framed as architecture, not marketing garnish
- accessible, low-complexity public navigation
- clear distinction between what exists now and what is planned

## Scope Boundaries

This repository covers the website shell, supporting documentation, and the
ForgeCustomer customer-surface client (see §9). It now contains:

- Stripe Checkout start via the ForgeCustomer BFF proxy (`server/forge.ts`)
- Supabase-based login and a signed-in account dashboard

It still does not contain (these live in other systems or remain planned):

- passkey registration/authentication (login uses Supabase today)
- server-side Stripe webhook handling (owned by ForgeCustomer, not the website)
- product detail pages beyond `authorforge.html`

The website never holds commercial truth: it renders state ForgeCustomer owns and
forwards the signed-in user's own token through its server-side proxy.
