export { fmtHours, fmtDuration } from '../shared/domain';

export function fmtDate(iso: string): string {
  if (iso.includes('T')) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  }
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function fmtTime(hms: string): string {
  if (hms.includes('T')) {
    const d = new Date(hms);
    if (!Number.isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
  }
  return hms.slice(0, 5);
}

export function fmtNum(n: number, digits = 1): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

// Imperial conversions for pilots who read altitude in feet and
// vertical speed in feet-per-minute (standard on most varios).
const FEET_PER_METER = 3.28084;
const FT_PER_MIN_PER_MS = 196.850394;

export function fmtFeet(meters: number): string {
  return `${fmtInt(meters * FEET_PER_METER)} ft`;
}

export function fmtFtPerMin(ms: number): string {
  return `${fmtInt(ms * FT_PER_MIN_PER_MS)} ft/min`;
}
