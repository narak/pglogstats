// Shared domain types for the CLI (Node) and the SPA (browser).
// Keep this module free of any runtime/platform-specific imports.

export interface TimeWindow {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  classification: string;
}

export interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevationM?: number | null;
  country?: string;
  region?: string;
  notes?: string;
  supportsThermals?: boolean;
  supportsSoaring?: boolean;
  supportsWinch?: boolean;
  apiDetails?: Record<string, unknown>;
  timeWindows: TimeWindow[];
}

export interface Gear {
  id: string;
  name: string;
  type?: string;
  manufacturer?: string;
  model?: string;
  purchaseDate?: string | null;
  lastInspectionDate?: string | null;
  certifiedHours?: number | null;
  warningThresholdPct?: number | null;
  retired?: boolean;
}

export interface Config {
  sites: Site[];
  gear: Gear[];
}

export interface Flight {
  id: string; // stable key, based on takeoff UTC timestamp
  sourceFileName: string | null; // source IGC file name used for parsing
  date: string; // "YYYY-MM-DD"
  takeoffTime: string; // UTC timestamp, "YYYY-MM-DDTHH:MM:SSZ"
  landingTime: string; // UTC timestamp, "YYYY-MM-DDTHH:MM:SSZ"
  durationMinutes: number;
  takeoffLat: number;
  takeoffLon: number;
  maxAltitudeAmsl: number;
  maxClimbRate: number;
  maxSinkRate: number;
  radialDistanceKm: number;
  longestXcKm: number;
  totalDistanceKm: number;
  gliderHint: string | null; // raw HFGTY/HFGID hint
  siteId: string | null; // reference into public/data/sites.json
  gear: Gear | null; // fully resolved gear snapshot from IGC headers
  isSledder: boolean;
  metadataComplete: boolean;
}

// Runtime wrapper around fully resolved flights (no config-dependent derivation).
// `isSledder` lives on `flight`; metadata completeness is `missing.length === 0`.
export interface DerivedFlight {
  flight: Flight;
  site: Site | null;
  gear: Gear | null;
  liftThermal: boolean;
  liftSoaring: boolean;
  liftTowing: boolean;
  missing: ('site' | 'gear')[];
}
