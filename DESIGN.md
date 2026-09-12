# Design System: Liquid Glass (Ported for Antigravity)

## 1. Visual Philosophy

* **Aesthetic:** Editorial High-Density Glassmorphism.
* **Atmosphere:** Clinical, authoritative, yet warm. Uses warm dark charcoal surfaces as the default canvas, paired with crisp 1px "Frosted Silver" structural borders and "Sapphire Glow" interactive highlights.
* **Information Density:** High throughput (7/10), compact padding, tabular figures, and split-pane document validation workflows.

---

## 2. Color Palette (Eminence Noir Base)

* **Canvas Background:** `#0f0f11` — Eminence Noir (Deep warm charcoal)
* **Secondary Surface:** `#161618` — Sidebar / Topbar surface fill
* **Glass Surface:** `bg-glass-fill` — Translucent container fill (`rgba(28, 28, 31, 0.65)`) with `backdrop-blur-md` (20px)
* **Primary Accent:** `#007bff` — Sapphire Glow (strictly reserved for CTAs, active selection states, and focus indicators)
* **Text Primary:** `#f0f0f2` — Crisp silver-white for titles and primary content
* **Text Secondary:** `#8e8e93` — Slate metadata and descriptions
* **Muted Text:** `#636366` — Timestamps and low-contrast labels
* **Border:** `rgba(255, 255, 255, 0.08)` — Frosted Silver 1px structural lines (`rgba(255, 255, 255, 0.24)` on hover)

### Semantic Spot-Pastel Palette
* **Success Tag (Emerald):** `#346538` (Fill: `rgba(52, 101, 56, 0.15)`, Text: `#4ade80`) — Validated documents, 100% OCR match
* **Warning Tag (Amber):** `#956400` (Fill: `rgba(149, 100, 0, 0.15)`, Text: `#fbbf24`) — Discrepancy flagged, OCR confidence < 85%
* **Error Tag (Crimson):** `#9f2f2d` (Fill: `rgba(159, 47, 45, 0.15)`, Text: `#f87171`) — Rejected submission
* **Info Tag (Azure):** `#1f6c9f` (Fill: `rgba(31, 108, 159, 0.15)`, Text: `#60a5fa`) — In progress

---

## 3. Typography Architecture

* **Editorial Serif:** `'Instrument Serif'`, `'Newsreader'`, `serif`
  * *Usage:* Hero titles, page headers, stat numerical highlights. Injects administrative prestige.
* **UI Sans-Serif:** `'Plus Jakarta Sans'`, `-apple-system`, `sans-serif`
  * *Usage:* Navigation bars, form inputs, buttons, field labels, high-density body text.
* **Monospace:** `'JetBrains Mono'`, `'SF Mono'`, `monospace`
  * *Usage:* Technical IDs, employee numbers, timestamps, system logs, OCR confidence percentages.

### Type Scale Hierarchy
* **Hero Title / Stat Value (`--text-4xl`):** `2.25rem` (36px) | `Instrument Serif` | Line-height: `1.2`
* **Page Title (`--text-3xl`):** `1.875rem` (30px) | `Plus Jakarta Sans` | Semi-Bold (`600`) | Line-height: `1.25`
* **Section Header (`--text-2xl`):** `1.5rem` (24px) | `Plus Jakarta Sans` | Medium (`500`) | Line-height: `1.3`
* **Body Text (`--text-base`):** `1.0rem` (16px) | `Plus Jakarta Sans` | Regular (`400`) | Line-height: `1.6`
* **Metadata / Badges / Mono (`--text-xs`):** `0.75rem` (12px) | `JetBrains Mono` | Medium (`500`)

---

## 4. Components & Motion

* **Bento Grids:** Asymmetric 2:1 column ratios (e.g., 2-part primary workflow pane + 1-part stat queue) to eliminate rigid visual monotony.
* **Interactive Triggers:** Tactile 1px Y-axis shift (`transform: translateY(-1px)`) on hover, compressing to `translateY(0)` on active press (`:active`).
* **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` for all layout shifts, hover states, and drawer transitions.
* **Split-Pane Validation Workspace:** Dual 50/50 vertical pane split on desktop (`min-width: 1024px`) with live document preview on the left and extracted data review on the right.

---

## 5. Accessibility & Banned Patterns

* **WCAG 2.1 AA Compliance:** Minimum 4.5:1 text contrast ratio, visible `:focus-visible` ring (`2px solid #007bff` with 2px offset).
* **Banned Patterns:** Emojis as UI icons are BANNED; outer neon glow drop shadows are BANNED; raw un-styled Inter font is BANNED; generic AI copywriting ("Seamless", "Next-Gen") is BANNED; fake placeholder names ("John Doe") are BANNED.