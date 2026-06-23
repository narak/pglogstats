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
