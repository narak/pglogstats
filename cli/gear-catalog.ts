// Canonical gear catalog + alias matching (requirements §3.6).
//
// IGC headers spell the same glider many ways ("PhiSymphonia2", "Phi Symphonia 2",
// "phi symphonia2"). Each catalog entry lists its canonical manufacturer/model plus
// any number of alias strings; matching is whitespace- and case-insensitive, so most
// spellings collapse to one entry automatically. Adding a new glider = one entry;
// adding a new spelling = one string in `aliases`.

export interface GearCatalogEntry {
  manufacturer: string;
  model: string;
  type?: string; // defaults to 'Glider'
  /** Any hint strings seen in the wild for this glider. Free-form spacing/casing. */
  aliases: string[];
}

export const GEAR_CATALOG: GearCatalogEntry[] = [
  {
    manufacturer: 'Phi',
    model: 'Symphonia 2',
    aliases: ['Phi Symphonia 2', 'PhiSymphonia2', 'Symphonia 2'],
  },
];

// Hints that mean "no usable gear info" — treated as unmatched rather than a glider.
const IGNORED_HINTS = new Set(['', 'unknown', 'na', 'n/a', 'none']);

/** Lowercase + strip every non-alphanumeric char, so spacing/casing never matters. */
export function normalizeGearHint(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function isIgnoredGearHint(hint: string | null): boolean {
  if (!hint) return true;
  return IGNORED_HINTS.has(hint.trim().toLowerCase());
}

// Precompute normalized aliases once, longest first so the most specific alias wins
// on a substring match (e.g. "symphonia2lite" prefers a "symphonia2lite" alias over
// a bare "symphonia2").
const NORMALIZED = GEAR_CATALOG.flatMap((entry) =>
  entry.aliases.map((alias) => ({ entry, norm: normalizeGearHint(alias) })),
)
  .filter((a) => a.norm.length > 0)
  .sort((a, b) => b.norm.length - a.norm.length);

/** Resolve a raw IGC glider hint to a catalog entry, or null if unknown/ignored. */
export function matchGearCatalog(hint: string | null): GearCatalogEntry | null {
  if (isIgnoredGearHint(hint)) return null;
  const norm = normalizeGearHint(hint as string);
  if (!norm) return null;
  // Exact match first, then longest alias contained in the hint.
  const exact = NORMALIZED.find((a) => a.norm === norm);
  if (exact) return exact.entry;
  const partial = NORMALIZED.find((a) => norm.includes(a.norm));
  return partial?.entry ?? null;
}
