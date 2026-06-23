# PgLogStats — Design

This file captures implementation-oriented design decisions (UI system, interaction patterns,
and engineering conventions). Product scope and feature requirements live in
`requirements.md`.

---

## 1. Design Principles

- Data-first and legible outdoors (high contrast, restrained styling).
- Mobile-first layouts with touch-safe controls.
- Read-only interaction model.
- Predictable navigation and filter state persistence.

---

## 2. Visual System

### 2.1 Theme

- Dark-first only; no light-mode toggle.
- Core palette:
  - background `#09090b`
  - surface `#18181b`
  - elevated `#27272a`
  - border `#3f3f46`
  - text `#fafafa`
  - muted `#a1a1aa`
  - accent `#38bdf8`

### 2.2 Typography

- UI text: DM Sans.
- Numeric/stat values: DM Mono.
- Target scale:
  - page title ~24px
  - section title ~18px
  - body/table ~14px
  - labels/muted ~12px

### 2.3 Layout and interaction sizing

- Mobile target width: 390px.
- Content max width: 768px centered.
- Page padding: 16px mobile, 24px tablet+.
- Minimum tap target: 44x44.

### 2.4 Motion and decoration constraints

- Avoid gradients, glass effects, and decorative animation.
- Keep state transitions simple and functional.

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

---

## 7. Source of Truth Boundary

- `requirements.md`: what the product must do.
- `DESIGN.md`: how the UI/system is implemented to satisfy it.

When conflict occurs, update both in the same change set and keep requirements normative.
