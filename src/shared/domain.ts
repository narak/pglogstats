// Pure domain logic shared by the CLI and the SPA.
// Site matching, classification, gear matching and stats all live here so the
// CLI snapshot and the runtime SPA derivation never drift.

import type {
  DerivedFlight,
  Flight,
  Site,
} from './types';

export const SITE_MATCH_RADIUS_M = 500;

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Nearest site whose centre is within SITE_MATCH_RADIUS_M of the takeoff. */
export function matchSite(
  lat: number,
  lon: number,
  sites: Site[],
): Site | null {
  let best: Site | null = null;
  let bestDist = Infinity;
  for (const site of sites) {
    if (site.lat == null || site.lon == null) continue;
    const distM = haversineKm(lat, lon, site.lat, site.lon) * 1000;
    if (distM <= SITE_MATCH_RADIUS_M && distM < bestDist) {
      best = site;
      bestDist = distM;
    }
  }
  return best;
}

/** Wrap pre-resolved flight fields for UI convenience. */
export function deriveFlight(
  flight: Flight,
  siteById: Map<string, Site>,
): DerivedFlight {
  const site = flight.siteId ? siteById.get(flight.siteId) ?? null : null;
  const gear = flight.gear ?? null;
  const liftThermal = Boolean(site?.supportsThermals);
  const liftSoaring = Boolean(site?.supportsSoaring);
  const liftTowing = Boolean(site?.supportsWinch);
  const missing: ('site' | 'gear')[] = [];
  if (!site) missing.push('site');
  if (!gear) missing.push('gear');

  return {
    flight,
    site,
    gear,
    liftThermal,
    liftSoaring,
    liftTowing,
    missing,
  };
}

export function deriveAll(
  flights: Flight[],
  sites: Site[],
): DerivedFlight[] {
  const siteById = new Map(sites.map((s) => [s.id, s] as const));
  return flights.map((f) => deriveFlight(f, siteById));
}

/** Single-word lift category for a flight, used by the log and analytics views. */
export function liftLabel(f: DerivedFlight): string {
  if (f.flight.isSledder) return 'Sledder';
  if (f.liftTowing) return 'Towing';
  if (f.liftThermal) return 'Thermal';
  if (f.liftSoaring) return 'Soaring';
  return 'Unknown';
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function hoursFromMinutes(min: number): number {
  return min / 60;
}

export function fmtHours(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
