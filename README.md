# PgLogStats

A personal paragliding flight-statistics report. Flight logs are captured by
sending the `.igc` to a Telegram bot; a TypeScript CLI parses committed IGC
files into JSON, and a React + Vite SPA renders the report. Site and lift
signals are resolved at parse time and stored in `sites.json` + `flights.json`
(`siteId` references), so the frontend has no runtime lookup/config dependency.

See [`requirements.md`](./requirements.md) and [`DESIGN.md`](./DESIGN.md) for the spec.

## Architecture

```
Telegram bot  ──►  telegram.yml (poll)  ──►  commit igc/*.igc  ──►  build.yml  ──►  Vite SPA  ──►  GitHub Pages
   (send .igc)                                                     CLI (cli/) parses igc/ → public/data/*.json
```

The committed `igc/` folder is the single source of truth.

- `cli/telegram.ts` — polls the bot, downloads new `.igc` into `igc/`.
- `cli/sync-drive.ts` — optional one-shot importer to pull existing logs out of a Drive folder into `igc/` (`npm run sync:drive`).
- `cli/` — Node/TypeScript pipeline (IGC parse, ParaglidingEarth GeoJSON lookup, JSON output).
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

## Capture (Telegram)

Send a `.igc` as a document to your bot — even offline, Telegram queues it and
uploads when the phone regains signal. A scheduled workflow does the rest:

1. `.github/workflows/telegram.yml` polls the bot (~every 10 min, or manual dispatch),
   runs `npm run telegram:poll`, and commits new files into `igc/`.
2. That commit triggers `build.yml`, which parses, builds, and deploys, then
   replies in the chat with the deploy result.

Required secrets (repo **and** local `.env`):

- `TELEGRAM_BOT_TOKEN` — bot token from @BotFather.
- `TELEGRAM_CHAT_ID` — the only chat the bot accepts `.igc` files from.

The bot must use polling (no webhook set on it). The build reads only from the
committed `igc/` folder — no Google Drive dependency.

## Import from Google Drive (optional, one-shot)

To pull existing `.igc` logs out of a Drive folder into `igc/` (e.g. a one-time
migration), set `GDRIVE_FOLDER_ID` + `GDRIVE_SERVICE_ACCOUNT` (read-only is fine,
service account needs read access to the folder) and run:

```bash
npm run sync:drive     # downloads Drive .igc files into igc/
```

Then commit the new files in `igc/` and push to trigger a build. This is a
manual convenience only; the live pipeline never touches Drive.

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

`.github/workflows/build.yml` parses the committed `igc/` folder (`npm run data:local`),
commits updated data, builds the SPA, deploys `dist/` to GitHub Pages on push to `main`
(or manual dispatch), and reports the result back to Telegram.
