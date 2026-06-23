// IGC parsing. Ported and adapted from the original igccli analyzer.
// Produces the per-flight metrics described in requirements §3.2.

import { haversineKm } from '../src/shared/domain';

export interface ParsedFix {
  seconds: number; // absolute seconds since first fix (handles midnight crossover)
  lat: number;
  lon: number;
  altGps: number | null;
  altBaro: number | null;
}

export interface ParsedFlight {
  date: string | null;
  gliderHint: string | null;
  takeoffTime: string;
  landingTime: string;
  durationMinutes: number;
  takeoffLat: number;
  takeoffLon: number;
  maxAltitudeAmsl: number;
  maxClimbRate: number;
  maxSinkRate: number;
  radialDistanceKm: number;
  longestXcKm: number;
  fixCount: number;
}

export class IgcParseError extends Error {}

function parseHeaderValue(line: string): string | null {
  const idx = line.indexOf(':');
  if (idx === -1) return null;
  const v = line.slice(idx + 1).trim();
  return v || null;
}

function parseDate(line: string): string | null {
  const m = line.match(/(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const year = parseInt(yy, 10) < 70 ? 2000 + parseInt(yy, 10) : 1900 + parseInt(yy, 10);
  return `${year}-${mm}-${dd}`;
}

function parseDMM(str: string, hem: string): number {
  const isLon = str.length === 8;
  const degLen = isLon ? 3 : 2;
  const deg = parseInt(str.slice(0, degLen), 10);
  const min = parseInt(str.slice(degLen, degLen + 2), 10);
  const minFrac = parseInt(str.slice(degLen + 2), 10);
  const divisor = Math.pow(10, str.length - degLen - 2);
  let val = deg + (min + minFrac / divisor) / 60;
  if (hem === 'S' || hem === 'W') val = -val;
  return val;
}

interface RawFix {
  hh: number;
  mm: number;
  ss: number;
  lat: number;
  lon: number;
  altGps: number | null;
  altBaro: number | null;
}

function parseBRecord(line: string): RawFix | null {
  if (line.length < 35) return null;
  const validity = line[24];
  if (validity === 'V') return null; // GPS fix flagged invalid
  const hh = parseInt(line.slice(1, 3), 10);
  const mm = parseInt(line.slice(3, 5), 10);
  const ss = parseInt(line.slice(5, 7), 10);
  const lat = parseDMM(line.slice(7, 14), line[14]);
  const lon = parseDMM(line.slice(15, 23), line[23]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  const altBaro = parseInt(line.slice(25, 30), 10);
  const altGps = parseInt(line.slice(30, 35), 10);
  return {
    hh,
    mm,
    ss,
    lat,
    lon,
    altBaro: Number.isNaN(altBaro) ? null : altBaro,
    altGps: Number.isNaN(altGps) ? null : altGps,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoUtcFromDateSeconds(date: string, secondsFromStart: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0) + secondsFromStart * 1000;
  return new Date(utcMs).toISOString().slice(0, 19) + 'Z';
}

/** Max positive / max negative vertical speed using a ~10 second averaging window. */
function climbRates(fixes: ParsedFix[]): { climb: number; sink: number } {
  let climb = 0;
  let sink = 0;
  for (let i = 0; i < fixes.length; i++) {
    const a0 = fixes[i].altGps ?? fixes[i].altBaro;
    if (a0 == null) continue;
    for (let j = i + 1; j < fixes.length; j++) {
      const dt = fixes[j].seconds - fixes[i].seconds;
      if (dt < 10) continue;
      const a1 = fixes[j].altGps ?? fixes[j].altBaro;
      if (a1 == null) break;
      const rate = (a1 - a0) / dt;
      if (rate > climb) climb = rate;
      if (rate < sink) sink = rate;
      break;
    }
  }
  return { climb, sink };
}

export function parseIgc(content: string): ParsedFlight {
  const lines = content.split(/\r?\n/);
  let date: string | null = null;
  let gliderType: string | null = null;
  let gliderId: string | null = null;
  const raw: RawFix[] = [];

  for (const line of lines) {
    if (!line) continue;
    const u = line.toUpperCase();
    if (line[0] === 'H') {
      if (u.startsWith('HFDTE') || u.startsWith('HPDTE')) date = parseDate(line);
      else if (u.startsWith('HFGTY') || u.startsWith('HPGTY')) gliderType = parseHeaderValue(line);
      else if (u.startsWith('HFGID') || u.startsWith('HPGID')) gliderId = parseHeaderValue(line);
    } else if (line[0] === 'B') {
      const fix = parseBRecord(line);
      if (fix) raw.push(fix);
    }
  }

  if (raw.length < 2) {
    throw new IgcParseError('no valid B records');
  }

  // Build absolute-seconds fixes (handle midnight crossover).
  const fixes: ParsedFix[] = [];
  let prevSecOfDay = raw[0].hh * 3600 + raw[0].mm * 60 + raw[0].ss;
  let dayOffset = 0;
  for (const r of raw) {
    let secOfDay = r.hh * 3600 + r.mm * 60 + r.ss;
    if (secOfDay < prevSecOfDay) dayOffset += 86400;
    prevSecOfDay = secOfDay;
    fixes.push({
      seconds: secOfDay + dayOffset,
      lat: r.lat,
      lon: r.lon,
      altGps: r.altGps,
      altBaro: r.altBaro,
    });
  }

  const first = fixes[0];
  const last = fixes[fixes.length - 1];
  const durationMinutes = Math.round(((last.seconds - first.seconds) / 60) * 10) / 10;

  const alts = fixes
    .map((f) => f.altGps ?? f.altBaro)
    .filter((a): a is number => a != null && !Number.isNaN(a));
  const maxAltitudeAmsl = alts.length ? Math.max(...alts) : 0;

  const { climb, sink } = climbRates(fixes);

  let radialDistanceKm = 0;
  for (const f of fixes) {
    const d = haversineKm(first.lat, first.lon, f.lat, f.lon);
    if (d > radialDistanceKm) radialDistanceKm = d;
  }
  const longestXcKm = haversineKm(first.lat, first.lon, last.lat, last.lon);

  const gliderHint = [gliderType, gliderId].filter(Boolean).join(' ').trim() || null;

  const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
  const takeoffTime = date
    ? isoUtcFromDateSeconds(date, first.seconds)
    : `${pad(raw[0].hh)}:${pad(raw[0].mm)}:${pad(raw[0].ss)}`;
  const landingTime = date
    ? isoUtcFromDateSeconds(date, last.seconds)
    : `${pad(raw[raw.length - 1].hh)}:${pad(raw[raw.length - 1].mm)}:${pad(raw[raw.length - 1].ss)}`;

  return {
    date,
    gliderHint,
    takeoffTime,
    landingTime,
    durationMinutes,
    takeoffLat: round(first.lat, 6),
    takeoffLon: round(first.lon, 6),
    maxAltitudeAmsl,
    maxClimbRate: round(climb, 2),
    maxSinkRate: round(sink, 2),
    radialDistanceKm: round(radialDistanceKm, 2),
    longestXcKm: round(longestXcKm, 2),
    fixCount: fixes.length,
  };
}
