// PgLogStats pipeline CLI (requirements §3).
//
//   tsx cli/index.ts --local <dir>      parse a local folder of .igc files (default: ./igc)
//
// The committed igc/ folder is the source of truth. To pull logs out of Google
// Drive into igc/, use `npm run sync:drive`.
//
// Options:
//   --config <path>   config.yaml path        (default: ./config.yaml)
//   --out <dir>       output data dir         (default: ./public/data)

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { loadConfig } from './config';
import type { IgcSource } from './drive';
import { IgcParseError, parseIgc } from './igc';
import { lookupNearestParaglidingSite } from './site-lookup';
import { isIgnoredGearHint, matchGearCatalog } from './gear-catalog';
import { matchSite } from '../src/shared/domain';
import type { Config, Flight, Gear, Site } from '../src/shared/types';

dotenv.config();

interface Args {
  localDir: string;
  configPath: string;
  outDir: string;
}

type LegacyFlight = Flight & { site?: Site | null };

function isBlockedFixturePath(dirPath: string): boolean {
  const normalized = path.resolve(dirPath).replace(/\\/g, '/').toLowerCase();
  return (
    normalized.includes('/igccli/test-flights') ||
    normalized.endsWith('/test-flights') ||
    normalized.includes('/test-fixtures/')
  );
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    localDir: 'igc',
    configPath: path.resolve('config.yaml'),
    outDir: path.resolve('public/data'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--local') {
      args.localDir = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'igc';
    } else if (a === '--config') {
      args.configPath = path.resolve(argv[++i]);
    } else if (a === '--out') {
      args.outDir = path.resolve(argv[++i]);
    }
  }
  return args;
}

function findLocalIgc(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findLocalIgc(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.igc')) out.push(full);
  }
  return out;
}

function localSources(dir: string): IgcSource[] {
  return findLocalIgc(dir).map((file) => ({
    name: path.basename(file),
    read: async () => fs.readFileSync(file, 'utf8'),
  }));
}

function loadExistingFlights(file: string): LegacyFlight[] {
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? (data as LegacyFlight[]) : [];
  } catch {
    return [];
  }
}

function loadExistingSites(file: string): Site[] {
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? (data as Site[]) : [];
  } catch {
    return [];
  }
}

function flightId(takeoffTimeUtc: string): string {
  return takeoffTimeUtc;
}

function toIsoUtcFromDateTime(date: string, time: string): string | null {
  const m = time.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, hh, mm, ss] = m;
  return `${date}T${hh}:${mm}:${ss}Z`;
}

function normalizeUtcTimestamp(
  value: string,
  dateHint: string,
): string {
  if (value.includes('T')) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 19) + 'Z';
  }
  return toIsoUtcFromDateTime(dateHint, value) ?? `${dateHint}T00:00:00Z`;
}

function computeLandingUtcFromDuration(takeoffUtc: string, durationMinutes: number): string {
  const takeoffMs = Date.parse(takeoffUtc);
  if (Number.isNaN(takeoffMs)) return takeoffUtc;
  const landingMs = takeoffMs + Math.round(durationMinutes * 60 * 1000);
  return new Date(landingMs).toISOString().slice(0, 19) + 'Z';
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function gearFromCatalogEntry(entry: ReturnType<typeof matchGearCatalog>): Gear | null {
  if (!entry) return null;
  const name = `${entry.manufacturer} ${entry.model}`.trim();
  return {
    id: `gear-${slug(name)}`,
    name,
    type: entry.type ?? 'Glider',
    manufacturer: entry.manufacturer || undefined,
    model: entry.model || undefined,
  };
}

function parseGearFromHint(gliderHint: string | null): Gear | null {
  if (isIgnoredGearHint(gliderHint)) return null;
  // Prefer the canonical catalog so spelling variants collapse to one glider.
  const fromCatalog = gearFromCatalogEntry(matchGearCatalog(gliderHint));
  if (fromCatalog) return fromCatalog;
  // Fallback heuristic for gliders not yet in the catalog.
  const tokens = (gliderHint as string).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const manufacturer = tokens[0] ?? '';
  const sizeCandidate = tokens.at(-1) ?? '';
  const hasSize = /^[A-Za-z]$/.test(sizeCandidate) || /^\d{2,3}$/.test(sizeCandidate);
  const modelTokens = hasSize ? tokens.slice(1, -1) : tokens.slice(1);
  const model = modelTokens.join(' ').trim() || undefined;
  const normalizedName = (gliderHint as string).replace(/\s+/g, ' ').trim();
  return {
    id: `gear-${slug(normalizedName)}`,
    name: normalizedName,
    type: 'Glider',
    manufacturer: manufacturer || undefined,
    model,
  };
}

function liftSignalsFromLookup(
  lookedUp: Awaited<ReturnType<typeof lookupNearestParaglidingSite>>,
): { thermal: boolean; soaring: boolean; towing: boolean } {
  if (!lookedUp) return { thermal: false, soaring: false, towing: false };
  return {
    thermal: Boolean(lookedUp.supportsThermals),
    soaring: Boolean(lookedUp.supportsSoaring),
    towing: Boolean(lookedUp.supportsWinch),
  };
}

async function resolveSite(
  takeoffLat: number,
  takeoffLon: number,
  config: Config,
): Promise<{ site: Site | null }> {
  const knownSite = matchSite(takeoffLat, takeoffLon, config.sites);
  const lookedUp = await lookupNearestParaglidingSite(takeoffLat, takeoffLon);
  const lift = liftSignalsFromLookup(lookedUp);
  if (knownSite) {
    return {
      site: {
        ...knownSite,
        supportsThermals: lift.thermal,
        supportsSoaring: lift.soaring,
        supportsWinch: lift.towing,
      },
    };
  }
  if (!lookedUp) {
    return { site: null };
  }
  const site: Site = {
    id: `lookup-${slug(lookedUp.name)}-${slug(`${lookedUp.lat ?? takeoffLat}-${lookedUp.lon ?? takeoffLon}`)}`.slice(0, 80),
    name: lookedUp.name,
    lat: lookedUp.lat ?? takeoffLat,
    lon: lookedUp.lon ?? takeoffLon,
    elevationM: null,
    country: lookedUp.countryCode ?? '',
    region: '',
    notes: `Lookup source=${lookedUp.source ?? 'unknown'}${lookedUp.distanceKm != null ? ` distanceKm=${lookedUp.distanceKm.toFixed(1)}` : ''}${lookedUp.sourceUrl ? ` url=${lookedUp.sourceUrl}` : ''}`,
    supportsThermals: lift.thermal,
    supportsSoaring: lift.soaring,
    supportsWinch: lift.towing,
    apiDetails: lookedUp.apiDetails,
    timeWindows: [],
  };
  return { site };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config: Config = loadConfig(args.configPath);

  const flightsFile = path.join(args.outDir, 'flights.json');
  const sitesFile = path.join(args.outDir, 'sites.json');
  const existing = loadExistingFlights(flightsFile);
  const existingSites = loadExistingSites(sitesFile);
  const existingIds = new Set(
    existing.map((f) => flightId(normalizeUtcTimestamp(f.takeoffTime, f.date))),
  );

  const dir = args.localDir;
  if (!fs.existsSync(dir)) throw new Error(`Local IGC dir not found: ${dir}`);
  if (isBlockedFixturePath(dir)) {
    throw new Error(
      `Refusing to ingest fixture logs from "${dir}". Use your real local logs folder.`,
    );
  }
  const sources: IgcSource[] = localSources(dir);
  console.log(`Found ${sources.length} IGC file(s).`);

  const newFlights: Flight[] = [];
  let skipped = 0;
  let failed = 0;

  for (const source of sources) {
    try {
      const content = await source.read();
      const parsed = parseIgc(content);
      if (!parsed.date) {
        console.warn(`  skip ${source.name}: no date in header`);
        failed += 1;
        continue;
      }
      if (parsed.durationMinutes < 1) {
        console.warn(
          `  skip ${source.name}: near-zero duration (${parsed.durationMinutes.toFixed(1)} min)`,
        );
        failed += 1;
        continue;
      }
      const id = flightId(parsed.takeoffTime);
      if (existingIds.has(id)) {
        skipped += 1;
        continue;
      }
      existingIds.add(id);
      const resolved = await resolveSite(
        parsed.takeoffLat,
        parsed.takeoffLon,
        config,
      );
      const gear = parseGearFromHint(parsed.gliderHint);
      const isSledder = parsed.durationMinutes < 8;
      newFlights.push({
        id,
        sourceFileName: source.name,
        date: parsed.takeoffTime.slice(0, 10),
        takeoffTime: parsed.takeoffTime,
        landingTime: parsed.landingTime,
        durationMinutes: parsed.durationMinutes,
        takeoffLat: parsed.takeoffLat,
        takeoffLon: parsed.takeoffLon,
        maxAltitudeAmsl: parsed.maxAltitudeAmsl,
        maxClimbRate: parsed.maxClimbRate,
        maxSinkRate: parsed.maxSinkRate,
        radialDistanceKm: parsed.radialDistanceKm,
        longestXcKm: parsed.longestXcKm,
        totalDistanceKm: parsed.totalDistanceKm,
        gliderHint: parsed.gliderHint,
        siteId: resolved.site?.id ?? null,
        gear,
        isSledder,
        metadataComplete: Boolean(resolved.site) && Boolean(gear),
      });
    } catch (err) {
      const reason = err instanceof IgcParseError ? err.message : (err as Error).message;
      console.warn(`  skip ${source.name}: ${reason}`);
      failed += 1;
    }
  }

  const siteById = new Map<string, Site>(
    existingSites.map((site) => [site.id, site] as const),
  );
  const allFlights = [...existing, ...newFlights]
    .filter((f) => f.durationMinutes >= 1)
    .sort((a, b) =>
    b.id.localeCompare(a.id),
    );

  const sourceByName = new Map<string, IgcSource>(sources.map((s) => [s.name, s]));

  // Backfill legacy rows and normalize into flight.siteId + sites.json.
  for (const f of allFlights) {
    const legacy = f as LegacyFlight;
    if (legacy.site) siteById.set(legacy.site.id, legacy.site);
    if ((f as Partial<Flight>).totalDistanceKm == null) {
      const source = f.sourceFileName ? sourceByName.get(f.sourceFileName) : undefined;
      if (source) {
        try {
          const reparsed = parseIgc(await source.read());
          f.totalDistanceKm = reparsed.totalDistanceKm;
        } catch {
          f.totalDistanceKm = 0;
        }
      } else {
        f.totalDistanceKm = 0;
      }
    }
    delete (f as unknown as Record<string, unknown>).classification;
    delete (f as unknown as Record<string, unknown>).matchedWindow;
    if ((f as { sourceFileName?: string | null }).sourceFileName == null) {
      (f as { sourceFileName?: string | null }).sourceFileName = 'unknown-prechange';
    }
    f.takeoffTime = normalizeUtcTimestamp(f.takeoffTime, f.date);
    if (f.landingTime.includes('T')) {
      f.landingTime = normalizeUtcTimestamp(f.landingTime, f.date);
    } else {
      f.landingTime = computeLandingUtcFromDuration(f.takeoffTime, f.durationMinutes);
    }
    f.date = f.takeoffTime.slice(0, 10);
    f.id = flightId(f.takeoffTime);
    delete (f as unknown as Record<string, unknown>).liftThermal;
    delete (f as unknown as Record<string, unknown>).liftSoaring;
    delete (f as unknown as Record<string, unknown>).liftTowing;
    if ((f as Partial<Flight>).isSledder == null) f.isSledder = false;
    if (f.siteId == null && legacy.site?.id) {
      f.siteId = legacy.site.id;
    }
    const knownSite = f.siteId ? siteById.get(f.siteId) ?? null : null;
    if (!knownSite) {
      const resolved = await resolveSite(f.takeoffLat, f.takeoffLon, config);
      if (resolved.site) {
        siteById.set(resolved.site.id, resolved.site);
      }
      f.siteId = resolved.site?.id ?? null;
    } else if (!knownSite.apiDetails || Object.keys(knownSite.apiDetails).length === 0) {
      const lookedUp = await lookupNearestParaglidingSite(knownSite.lat, knownSite.lon);
      if (lookedUp) {
        siteById.set(knownSite.id, {
          ...knownSite,
          supportsThermals: lookedUp.supportsThermals ?? knownSite.supportsThermals,
          supportsSoaring: lookedUp.supportsSoaring ?? knownSite.supportsSoaring,
          supportsWinch: lookedUp.supportsWinch ?? knownSite.supportsWinch,
          apiDetails: lookedUp.apiDetails ?? knownSite.apiDetails,
          country: lookedUp.countryCode ?? knownSite.country,
        });
      }
    }
    // Re-derive gear from the raw hint every run so catalog/alias changes apply
    // to the whole dataset (gear is a pure function of gliderHint).
    f.gear = parseGearFromHint(f.gliderHint);
    f.isSledder = f.durationMinutes < 8;
    f.metadataComplete = Boolean(f.siteId) && Boolean(f.gear);
    delete (f as unknown as Record<string, unknown>).site;
  }

  const allSites = Array.from(siteById.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  fs.mkdirSync(args.outDir, { recursive: true });
  fs.writeFileSync(flightsFile, JSON.stringify(allFlights, null, 2));
  fs.writeFileSync(sitesFile, JSON.stringify(allSites, null, 2));

  console.log(
    `Wrote ${allFlights.length} flight(s) (${newFlights.length} new, ${skipped} already present, ${failed} failed).`,
  );
  console.log(`  ${flightsFile}`);
  console.log(`  ${sitesFile}`);
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
