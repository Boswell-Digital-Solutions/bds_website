# 5. Page Inventory

## Implemented Public Pages

| Page | Path | Status |
|------|------|--------|
| Homepage | `index.html` | Primary authored page; most complete experience |
| Products | `products.html` | Live product-entry page for applications |
| Services | `services.html` | Live services-entry page |
| Forge | `forge.html` | Live platform overview page |
| Meet SMITH | `meet-smith.html` | Live SMITH explainer framing it as the continuous authority HUD |
| Architecture | `architecture.html` | Live public architecture explainer with Mermaid layered-system diagram |
| White Papers | `white-papers/index.html` | Live public research archive with dated metadata and archive-style paper indexing |
| Store | `store.html` | Live licensing surface with placeholder purchase coordination |
| Security | `security.html` | Live security posture and responsible-disclosure page |
| About | `about.html` | Live company identity page |
| Founder | `founder.html` | Live founder background and governance-philosophy page |
| Contact | `contact.html` | Live inquiry and support page wired to the public intake service |
| AuthorForge | `authorforge.html` | Live product detail page |
| AuthorForge Founder | `authorforge-founder.html` | Live supporting detail page |
| AuthorForge Cost Comparison | `authorforge-cost-comparison.html` | Live supporting detail page |

## Legal Pages

| Page | Path | Status |
|------|------|--------|
| Terms | `legal/terms.html` | Live policy page |
| Privacy | `legal/privacy.html` | Live policy page |
| Refund | `legal/refund.html` | Live policy page |
| EULA | `legal/eula.html` | Live multi-product software license page with Pro / ecosystem integration terms |
| Ecosystem Terms | `legal/ecosystem.html` | Live optional ecosystem feature terms page |

## Homepage Content Blocks

`index.html` currently carries the main brand story:

- authority-driven hero
- product preview cards
- security strip and zone diagram
- licensing preview cards
- founder / company background
- expanded footer navigation
- ambient HUD assistant

## Shared-Asset Boundary

All public pages load the shared style sheets, including `hud.css`. Only the homepage actually instantiates HUD markup and the inline HUD behavior. All pages now load the shared header script from `src/js/site.js`.

## Content Gaps

The site communicates several future capabilities that are not implemented here yet:

- live Stripe payment links and automated fulfillment
- dedicated product detail pages beyond AuthorForge
- contextual HUD intelligence beyond static suggestions

That gap is acceptable as long as the marketing copy remains explicit about planned versus available functionality.
