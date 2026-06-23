// config.yaml loading + lookup result typing.

import fs from 'node:fs';
import yaml from 'js-yaml';
import type { Config } from '../src/shared/types';

export interface SiteLookupResult {
  name: string;
  lat?: number;
  lon?: number;
  distanceKm?: number;
  countryCode?: string;
  source?: string;
  sourceUrl?: string;
  supportsThermals?: boolean;
  supportsSoaring?: boolean;
  supportsWinch?: boolean;
  apiDetails?: Record<string, unknown>;
}

export function loadConfig(path: string): Config {
  if (!fs.existsSync(path)) {
    return { sites: [], gear: [] };
  }
  const parsed = (yaml.load(fs.readFileSync(path, 'utf8')) ?? {}) as Partial<Config>;
  return {
    sites: Array.isArray(parsed.sites) ? parsed.sites : [],
    gear: Array.isArray(parsed.gear) ? parsed.gear : [],
  };
}
