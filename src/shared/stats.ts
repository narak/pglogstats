// Aggregations derived from the runtime-classified flights, consumed by the SPA views.

import { hoursFromMinutes } from './domain';
import type { DerivedFlight } from './types';

export interface LifetimeSummary {
  totalFlights: number;
  totalHours: number;
  uniqueSites: number;
}

export function lifetimeSummary(flights: DerivedFlight[]): LifetimeSummary {
  const sites = new Set<string>();
  let minutes = 0;
  for (const f of flights) {
    minutes += f.flight.durationMinutes;
    if (f.site) sites.add(f.site.id);
  }
  return {
    totalFlights: flights.length,
    totalHours: hoursFromMinutes(minutes),
    uniqueSites: sites.size,
  };
}

export function hoursByLiftSignals(
  flights: DerivedFlight[],
): {
  thermalHours: number;
  soaringHours: number;
  towingHours: number;
  sledderHours: number;
  sledderCount: number;
} {
  const out = {
    thermalHours: 0,
    soaringHours: 0,
    towingHours: 0,
    sledderHours: 0,
    sledderCount: 0,
  };
  for (const f of flights) {
    const h = hoursFromMinutes(f.flight.durationMinutes);
    if (f.liftThermal) out.thermalHours += h;
    if (f.liftSoaring) out.soaringHours += h;
    if (f.liftTowing) out.towingHours += h;
    if (f.isSledder) {
      out.sledderHours += h;
      out.sledderCount += 1;
    }
  }
  return out;
}

export interface RecordEntry {
  value: number;
  flight: DerivedFlight;
}

export interface PersonalRecords {
  longestFlight: RecordEntry | null;
  highestAltitude: RecordEntry | null;
  bestClimbRate: RecordEntry | null;
  furthestFromTakeoff: RecordEntry | null;
  longestXc: RecordEntry | null;
}

function maxBy(
  flights: DerivedFlight[],
  pick: (f: DerivedFlight) => number,
): RecordEntry | null {
  let best: RecordEntry | null = null;
  for (const f of flights) {
    const value = pick(f);
    if (best === null || value > best.value) best = { value, flight: f };
  }
  return best;
}

export function personalRecords(flights: DerivedFlight[]): PersonalRecords {
  return {
    longestFlight: maxBy(flights, (f) => f.flight.durationMinutes),
    highestAltitude: maxBy(flights, (f) => f.flight.maxAltitudeAmsl),
    bestClimbRate: maxBy(flights, (f) => f.flight.maxClimbRate),
    furthestFromTakeoff: maxBy(flights, (f) => f.flight.radialDistanceKm),
    longestXc: maxBy(flights, (f) => f.flight.longestXcKm),
  };
}

export interface RecentActivity {
  lastFlight: DerivedFlight | null;
  flightsThisMonth: number;
  flightsSameMonthLastYear: number;
}

export function recentActivity(
  flights: DerivedFlight[],
  now = new Date(),
): RecentActivity {
  const sorted = [...flights].sort((a, b) =>
    b.flight.id.localeCompare(a.flight.id),
  );
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  const inMonth = (year: number) =>
    flights.filter((f) => {
      const [fy, fm] = f.flight.date.split('-').map(Number);
      return fy === year && fm === m;
    }).length;

  return {
    lastFlight: sorted[0] ?? null,
    flightsThisMonth: inMonth(y),
    flightsSameMonthLastYear: inMonth(y - 1),
  };
}

// ── Analytics aggregations ─────────────────────────────────────────────────────

export interface MonthBucket {
  key: string; // "YYYY-MM"
  label: string; // "Mon 'YY"
  total: number; // hours
  thermal: number;
  soaring: number;
  towing: number;
  sledder: number;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function airtimeByMonth(
  flights: DerivedFlight[],
  months = 12,
  now = new Date(),
): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  const index = new Map<string, MonthBucket>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bucket: MonthBucket = {
      key,
      label: `${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`,
      total: 0,
      thermal: 0,
      soaring: 0,
      towing: 0,
      sledder: 0,
    };
    buckets.push(bucket);
    index.set(key, bucket);
  }
  for (const f of flights) {
    const key = f.flight.date.slice(0, 7);
    const bucket = index.get(key);
    if (!bucket) continue;
    const h = hoursFromMinutes(f.flight.durationMinutes);
    bucket.total += h;
    if (f.liftThermal) bucket.thermal += h;
    if (f.liftSoaring) bucket.soaring += h;
    if (f.liftTowing) bucket.towing += h;
    if (f.isSledder) bucket.sledder += h;
  }
  return buckets;
}

export interface YearBucket {
  year: string;
  thermal: number;
  soaring: number;
  towing: number;
  sledder: number;
}

export function classificationByYear(flights: DerivedFlight[]): YearBucket[] {
  const map = new Map<string, YearBucket>();
  for (const f of flights) {
    const year = f.flight.date.slice(0, 4);
    let b = map.get(year);
    if (!b) {
      b = { year, thermal: 0, soaring: 0, towing: 0, sledder: 0 };
      map.set(year, b);
    }
    const h = hoursFromMinutes(f.flight.durationMinutes);
    if (f.liftThermal) b.thermal += h;
    if (f.liftSoaring) b.soaring += h;
    if (f.liftTowing) b.towing += h;
    if (f.isSledder) b.sledder += h;
  }
  return [...map.values()].sort((a, b) => a.year.localeCompare(b.year));
}

export interface SiteStat {
  siteId: string;
  name: string;
  count: number;
  hours: number;
}

export function perSite(flights: DerivedFlight[]): SiteStat[] {
  const map = new Map<string, SiteStat>();
  for (const f of flights) {
    const id = f.site?.id ?? '__unmatched__';
    const name = f.site?.name?.trim() || 'Unknown site';
    let s = map.get(id);
    if (!s) {
      s = { siteId: id, name, count: 0, hours: 0 };
      map.set(id, s);
    }
    s.count += 1;
    s.hours += hoursFromMinutes(f.flight.durationMinutes);
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours);
}

export interface GliderStat {
  gearId: string;
  name: string;
  hours: number;
}

export function perGlider(flights: DerivedFlight[]): GliderStat[] {
  const map = new Map<string, GliderStat>();
  for (const f of flights) {
    if (!f.gear) continue;
    let s = map.get(f.gear.id);
    if (!s) {
      s = { gearId: f.gear.id, name: f.gear.name, hours: 0 };
      map.set(f.gear.id, s);
    }
    s.hours += hoursFromMinutes(f.flight.durationMinutes);
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours);
}

export function topBy(
  flights: DerivedFlight[],
  pick: (f: DerivedFlight) => number,
  limit = 10,
): DerivedFlight[] {
  return [...flights].sort((a, b) => pick(b) - pick(a)).slice(0, limit);
}

export function incompleteCount(flights: DerivedFlight[]): number {
  return flights.filter((f) => !f.metadataComplete).length;
}
