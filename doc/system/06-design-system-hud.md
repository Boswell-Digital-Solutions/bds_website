# 6. Design System & HUD

## Visual Direction

The design system is defined primarily in `src/styles/tokens.css`:

- deep navy backgrounds for authority and restraint
- orange reserved for calls to action and focus states; text on orange is Deep Navy (`--bg-primary`), not white, for WCAG AA contrast (6.4:1, or 5.0:1 on the hover shade)
- light neutral text for readability against dark surfaces; `--text-muted` is `#8B95A7`, at least 4.9:1 on every navy surface
- compact border radius and restrained elevation

The stated tone is engineered, calm, authoritative, and controlled.

## Typography

- headings use `DM Sans`
- body copy uses `Source Sans 3`
- type scale is declared with explicit token variables

This gives the repo a consistent, non-default visual language without requiring a component framework.

## Interaction System

The HUD is the most opinionated interaction element in the site:

- docked on the right edge
- never auto-expands
- opens into a dialog-like side panel
- offers static suggested prompts
- supports overlay click dismissal and `Escape`
- traps keyboard focus while open on the homepage

The HUD (`src/js/hud.js`, imported by `src/js/site.js`) mounts itself on every page that links `hud.css`. While closed, the panel is `aria-hidden` and `inert`, so its controls are out of the tab order.

## Accessibility Intent

The implementation already signals several accessibility priorities:

- skip link
- labeled navigation
- button semantics for toggles
- focus-visible styling
- dialog-like HUD affordances
- homepage HUD focus trapping
- horizontally scrollable regions (`.page-diagram`, `.product-table-wrap`) are focusable, labeled regions

BDS-WEB-PR-v0.1 CP4 ran axe-core (WCAG 2.0/2.1 A and AA rules) against every
sitemap page at 1280 px and 390 px. Before CP4 the homepage alone had 26
contrast failures. After CP4 there are 0 violations. The repo should preserve
these patterns if the site later migrates to a framework implementation.
