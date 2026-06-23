# PgLogStats

A personal paragliding flight-statistics report. A TypeScript CLI parses IGC files
(from Google Drive or a local folder) into JSON, and a React + Vite SPA renders the
report. Site and lift signals are resolved at parse time and stored in
`sites.json` + `flights.json` (`siteId` references), so the frontend has no
runtime lookup/config dependency.

See [`requirements.md`](./requirements.md) and [`DESIGN.md`](./DESIGN.md) for the spec.

## Architecture

```
Google Drive (IGC)  ──►  CLI (cli/)  ──►  public/data/sites.json + public/data/flights.json  ──►  Vite SPA  ──►  GitHub Pages
                          resolves site + lift signals and writes site references
```

- `cli/` — Node/TypeScript pipeline (Drive fetch, IGC parse, ParaglidingEarth GeoJSON lookup, JSON output).
- `src/shared/` — shared helpers and stats over already-resolved flights.
- `src/` — React SPA with hash routing: Dashboard, Flight Log, Analytics.

## Develop

```bash
npm install

# Generate data from a local folder of .igc files
npm run data:local -- /absolute/path/to/your-real-igc-logs

# Run the SPA
npm run dev
```

## Production data (Google Drive)

Set the following environment variables (or repo secrets) and run `npm run data:drive`:

- `GDRIVE_SERVICE_ACCOUNT` — service-account key JSON (Drive read-only).
- `GDRIVE_FOLDER_ID` — the Drive folder containing `.igc` files.

## Build

```bash
npm run build      # tsc -b && vite build  ->  dist/
npm run preview
```

## Site and Gear Resolution

- The CLI refuses to ingest known fixture folders (for example `igccli/test-flights`) to avoid polluting real logs.
- For unknown coordinates, the CLI queries ParaglidingEarth GeoJSON around-lat/lng API and stores
  the nearest site snapshot in `sites.json`, with each flight referencing it via `siteId`.
- Glider metadata is read directly from IGC headers (`HFGTY` / `HFGID`) and embedded in each flight.

## Deploy

`.github/workflows/build.yml` runs the CLI against Drive, commits updated data, builds
the SPA, and deploys `dist/` to GitHub Pages on push to `main` (or manual dispatch).
