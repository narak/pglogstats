# PgLogStats — Design

This file captures implementation-oriented design decisions (UI system, interaction patterns,
and engineering conventions). Product scope and feature requirements live in
`requirements.md`.

---

## 1. Design Principles

- Data-first and legible outdoors (warm, low-glare surfaces; restrained styling).
- Mobile-first layouts with touch-safe controls.
- Read-only interaction model.
- Predictable navigation and filter state persistence.

---

## 2. Visual System

### 2.1 Theme

- Single light/warm theme only; no theme toggle. (Palette defined as CSS custom
  properties in `src/styles.css` — that file is the source of truth for exact values.)
- Core palette:
  - background `#efe9dd`
  - surface `#fffdf8`
  - ink (text) `#1a1814`
  - muted `#78736b`
  - border `#e6dfd0`
  - accent `#1d6fe0` (blue), with green `#2f9e6b` and orange `#e0683a` accents
- Dark "ink" panels (e.g. the lifetime stat grid) are used as deliberate contrast
  blocks against the light background.

### 2.2 Typography

- Display/headings: Bricolage Grotesque (page titles, section titles, wordmark).
- UI text: DM Sans.
- Numeric/stat values: DM Mono.
- Fonts are loaded via a single preconnected `<link>` in `index.html`.
- Target scale:
  - page title ~40px (display)
  - section title ~17px (display)
  - body/table ~13–14px
  - labels/muted ~10–12px

### 2.3 Layout and interaction sizing

- Mobile target width: ~390px.
- Content max width: 760px centered.
- Page padding: 14px mobile, 18px tablet+.
- Minimum tap target: ~40–44px.

### 2.4 Motion and decoration constraints

- Restrained decoration: subtle gradients and soft shadows are allowed on cards
  and notices; avoid glass effects and decorative/looping animation.
- Keep state transitions simple and functional (short hover/toggle transitions only).

---

## 3. Information Architecture

- Routes:
  - `#/` Dashboard
  - `#/flights` Flight Log
  - `#/analytics` Analytics
- Sticky top nav with hash-based routing.
- No Gear page.

---

## 4. Page Interaction Patterns

### 4.1 Dashboard

- Card-based summary sections.
- Expandable site detail rows for dense metadata.
- Actionable notices link into filtered Flight Log state.

### 4.2 Flight Log

- Sortable table with expandable row details.
- Multi-select filters (checkbox dropdown pattern) for mobile usability.
- Active filters shown as removable chips.
- URL query string is the single source of truth for filter state.

### 4.3 Analytics

- Recharts-only visualizations.
- Tooltips carry detailed per-flight context.
- Consistent color semantics for lift categories and muted UI chrome.

---

## 5. Data Display Rules

- Canonical timestamps are stored in UTC in data artifacts.
- UI renders date/time in browser local timezone.
- Lift semantics in UI are derived from site capabilities in `sites.json`, not per-flight flags.

---

## 6. Engineering Conventions

- Shared domain logic lives in `src/shared/`.
- Data loading is centralized in `src/lib/useData.ts`.
- Runtime consumes `flights.json` + `sites.json`; no external runtime fetches.
- Keep CLI enrichment at build time; keep SPA derivation deterministic and side-effect free.
- Ingestion is decoupled from presentation: raw `.igc` files are captured into the
  committed `igc/` folder (via the Telegram poll workflow) and are the single source of
  truth for the build. Flight dedup is by takeoff timestamp in `cli/index.ts`, so
  re-capturing the same log is idempotent. Google Drive is not a build dependency;
  `npm run sync:drive` is only a manual importer for pulling old logs into `igc/`.

---

## 7. Source of Truth Boundary

- `requirements.md`: what the product must do.
- `DESIGN.md`: how the UI/system is implemented to satisfy it.

When conflict occurs, update both in the same change set and keep requirements normative.
