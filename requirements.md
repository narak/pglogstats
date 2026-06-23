# PgLogStats — Requirements

**Version:** 0.3  
**Date:** 2026-06-23  
**Scope:** Single-user paragliding flight report, statically generated SPA

---

## 1. Purpose

Generate a personal paragliding flight statistics report from IGC files stored in Google Drive or a local folder.  
The pipeline produces static JSON artifacts consumed by a read-only SPA.

---

## 2. Architecture Requirements

### 2.1 Build-time pipeline

- A TypeScript CLI must:
  - fetch or read `.igc` sources,
  - parse flight metrics,
  - resolve site metadata,
  - resolve gear hints,
  - write normalized data artifacts to `public/data/`.

### 2.2 Runtime app

- The SPA must be React + Vite + TypeScript + Recharts with hash routing.
- The SPA must load data at startup from:
  - `public/data/flights.json`
  - `public/data/sites.json`
- No runtime site lookup or external API calls are allowed.

---

## 3. CLI Requirements

### 3.1 Input and ingestion

- Support `--drive` mode (Google Drive service account) and `--local` mode.
- Process files independently; one bad file must not abort the run.
- Skip logs shorter than 1 minute as invalid.
- Mark flights shorter than 8 minutes as `isSledder`.
- Prevent known test-fixture paths from being ingested.

### 3.2 Parsing

For each accepted IGC file, extract:

- date
- takeoff and landing timestamps
- duration
- takeoff coordinates
- max altitude AMSL
- max climb and sink rates
- radial distance
- straight-line XC distance
- glider hint from IGC header fields

### 3.3 Time handling

- `takeoffTime` and `landingTime` must be stored as UTC timestamps (`YYYY-MM-DDTHH:MM:SSZ`).
- IDs must be stable and based on UTC takeoff timestamp.
- UI display may localize timestamps to browser timezone.

### 3.4 Site resolution

Site must be resolved at parse time in this order:

1. known site match from `config.yaml` within a match radius,
2. ParaglidingEarth around-lat/lng lookup,
3. unknown (`siteId: null`) when unresolved.

Resolved sites are stored in `sites.json`; flights store only `siteId`.

### 3.5 Lift semantics

- Lift semantics are derived from site capabilities (`supportsThermals`, `supportsSoaring`, `supportsWinch`) in `sites.json`.
- Lift flags must not be stored in `flights.json`.

### 3.6 Gear resolution

- Gear is inferred from IGC glider headers and stored per flight as a gear snapshot (or `null`).

---

## 4. Data Contract Requirements

### 4.1 `public/data/flights.json`

Array of flight rows containing:

- identity and source info (`id`, `sourceFileName`)
- parsed metrics
- UTC timestamps (`takeoffTime`, `landingTime`)
- `siteId` reference (nullable)
- gear snapshot (nullable)
- `isSledder`
- `metadataComplete`

Must not contain embedded site objects or per-flight lift flags.

### 4.2 `public/data/sites.json`

Array of unique site objects containing:

- location identity
- descriptive metadata
- site capability flags (`supportsThermals`, `supportsSoaring`, `supportsWinch`)
- optional raw API details

---

## 5. SPA Feature Requirements

### 5.1 Routes

- `#/` Dashboard
- `#/flights` Flight Log
- `#/analytics` Analytics

No Gear route.

### 5.2 Dashboard

- lifetime summaries (flights, airtime, unique sites),
- lift summary derived from site capability flags,
- recent activity,
- personal records,
- site list with expandable details and external API reference link,
- metadata-incomplete notice linking to filtered log view.

### 5.3 Flight Log

- sortable/filterable table,
- multi-select filters for site, glider, and lift type,
- filter chips and URL query persistence,
- expandable row details including source filename and key metrics,
- local-time display for UTC timestamps.

### 5.4 Analytics

- airtime by month (with breakdown toggle),
- lift breakdown over time,
- per-site and per-glider rankings,
- duration vs altitude scatter plot with rich tooltip context,
- top-10 duration and altitude tables.

---

## 6. CI/CD Requirements

- GitHub Actions must run data generation and SPA build on push/manual dispatch.
- Workflow must commit updated `public/data/flights.json` and `public/data/sites.json` when changed.
- Required secrets:
  - `GOOGLE_SERVICE_ACCOUNT_JSON` or `GDRIVE_SERVICE_ACCOUNT`
  - `DRIVE_FOLDER_ID` or `GDRIVE_FOLDER_ID`

---

## 7. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| Privacy | No telemetry and no external runtime calls |
| Mobile | Dashboard, Flight Log, and Analytics usable on mobile |
| Routing | Hash-based routing for GitHub Pages |
| Reliability | Per-file parse failures are non-fatal |
