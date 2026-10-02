# BDS Design System — Color & Visual Tokens v1

Status: Foundation System
Theme: Dark Navy Dominant
Tone: Engineered • Calm • Authoritative • Controlled

---

# 1. Core Color Philosophy

BDS uses a restrained palette.

Navy = Structure
Orange = Action
Gray = Hierarchy
White = Clarity

No gradients as primary surfaces.
No neon.
No glow-heavy accents.

---

# 2. Primary Color Palette

## 2.1 Base Background

Primary Background (Deep Navy)
HEX: #0F172A
Usage: Main page background

Secondary Background (Surface Navy)
HEX: #162033
Usage: Cards, panels, section alternation

Elevated Surface
HEX: #1C2740
Usage: Hover states, HUD panel background

---

## 2.2 Text Colors

Primary Text
HEX: #E5E7EB
Usage: Headlines, primary body text

Secondary Text
HEX: #9CA3AF
Usage: Subtext, metadata, secondary content

Muted Text
HEX: #8B95A7 (was #6B7280, which failed WCAG AA on navy; changed by BDS-WEB-PR-v0.1 CP4, 2026-10-02)
Usage: Labels, small UI text. At least 4.9:1 on every navy surface.

Divider Line
HEX: #273449
Usage: Section separation, subtle borders

---

## 2.3 Accent (Logo Orange)

Primary Accent
HEX: #F97316
Usage: Primary buttons, highlights, interactive emphasis

Accent Hover
HEX: #EA580C
Usage: Button hover state

Accent Subtle Background
HEX: rgba(249,115,22,0.08)
Usage: Badge backgrounds, subtle highlights

Accent Border
HEX: rgba(249,115,22,0.35)
Usage: Focus outlines

Orange must be used sparingly.
It signals action, not decoration.

---

# 3. Functional UI States

Success
HEX: #22C55E
Usage: Success badges, confirmations

Warning
HEX: #F59E0B
Usage: Alert notices

Error
HEX: #EF4444
Usage: Form errors, critical states

Info
HEX: #3B82F6
Usage: Informational indicators

These are utility colors only, not branding.

---

# 4. HUD Assistant Color System

HUD Background
HEX: #162033
Opacity: 96%

HUD Border
HEX: #273449

HUD Text Primary
HEX: #E5E7EB

HUD Text Secondary
HEX: #9CA3AF

HUD Accent Highlight
HEX: #F97316

HUD Input Field Background
HEX: #1C2740

HUD Focus Ring
HEX: rgba(249,115,22,0.5)

HUD must feel integrated, not separate.
No glowing AI effects.
No purple tech tones.

---

# 5. Typography System

## 5.1 Font Direction

Headings:
Modern geometric sans-serif
Weight range: 500–700
Letter spacing: -0.01em to -0.02em

Body:
Humanist sans-serif
Weight: 400–500
Line height: 1.6–1.75

No playful fonts.
No serif on BDS site.

---

## 5.2 Type Scale

H1: 48px
H2: 36px
H3: 28px
H4: 22px
Body Large: 18px
Body: 16px
Small: 14px

Consistent 8px spacing increments.

---

# 6. Spacing System

Base Unit: 8px

Section Spacing: 96px
Component Spacing: 24px
Card Padding: 24px–32px
Button Padding: 12px 20px

Large whitespace reinforces authority.

---

# 7. Radius & Elevation

Global Border Radius: 6px

Card Hover Lift:
TranslateY: -3px
Transition: 180ms ease

Shadow (minimal):
rgba(0,0,0,0.25)
Blur: 12px
Used sparingly.

No heavy drop shadows.

---

# 8. Motion Guidelines

Duration: 150–200ms
Easing: cubic-bezier(0.4, 0, 0.2, 1)

No bouncing.
No dramatic animation.

Motion should reinforce clarity, not draw attention.

---

# 9. Accessibility Targets

Contrast ratio minimum: 4.5:1
Primary text on navy must exceed 7:1

Focus states must always be visible.

Keyboard navigation required for HUD.

---

# 10. Visual Guardrails

Avoid:
- Black (#000000) primary backgrounds
- Purple/blue AI glow themes
- Overuse of orange
- Large gradients
- Decorative noise

Emphasize:
- Precision
- Hierarchy
- Calm authority
- Controlled interaction

---

End of BDS Design System v1

