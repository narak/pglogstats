// Best-effort lookup for nearest known paragliding site using ParaglidingEarth
// GeoJSON API (no XML parsing).
//
// API reference:
// https://paraglidingearth.com/api/#:~:text=Get%20sites%20around%20a%20given,com%2Fapi%2FgetAroundLatLngSites.php

import type { SiteLookupResult } from './config';

interface SiteCandidate extends SiteLookupResult {
  lat: number;
  lon: number;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const lookupCache = new Map<string, SiteLookupResult | null>();

function key(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

type GeoJsonFeature = {
  type: 'Feature';
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
};

type GeoJsonResponse = { type?: string; features?: GeoJsonFeature[] };

function pickString(obj: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function pickBool(obj: Record<string, unknown> | undefined, keys: string[]): boolean | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v === 1;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === '1' || s === 'true' || s === 'yes') return true;
      if (s === '0' || s === 'false' || s === 'no') return false;
    }
  }
  return undefined;
}

function parseParaglidingEarthGeoJson(data: GeoJsonResponse): SiteCandidate[] {
  const out: SiteCandidate[] = [];
  for (const f of data.features ?? []) {
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const props = f.properties;
    const name =
      pickString(props, ['name', 'site', 'site_name', 'takeoff_name', 'title']) ??
      'Unknown site';
    const sourceUrl = pickString(props, ['pge_link', 'link', 'url']);
    const countryCode = pickString(props, ['countryCode', 'country', 'iso']);
    out.push({
      name,
      lat,
      lon,
      countryCode,
      source: 'ParaglidingEarth',
      sourceUrl,
      supportsThermals: pickBool(props, ['thermals']),
      supportsSoaring: pickBool(props, ['soaring']),
      supportsWinch: pickBool(props, ['winch']),
      apiDetails: props ?? {},
    });
  }
  return out;
}

/**
 * Query ParaglidingEarth GeoJSON API for nearby sites and return closest known launch.
 * Never throws; returns null on lookup failure or no result.
 */
export async function lookupNearestParaglidingSite(
  lat: number,
  lon: number,
): Promise<SiteLookupResult | null> {
  const k = key(lat, lon);
  if (lookupCache.has(k)) return lookupCache.get(k) ?? null;

  try {
    // API docs: /api/geojson/getAroundLatLngSites.php?lat=..&lng=..&distance=..&limit=..
    const query =
      `?lat=${encodeURIComponent(String(lat))}` +
      `&lng=${encodeURIComponent(String(lon))}` +
      `&distance=50&limit=10&style=detailled`;
    const endpoints = [
      `https://www.paraglidingearth.com/api/geojson/getAroundLatLngSites.php${query}`,
      `http://www.paraglidingearth.com/api/geojson/getAroundLatLngSites.php${query}`,
    ];
    let data: GeoJsonResponse | null = null;
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'pglogstats/0.1' } });
        if (!res.ok) continue;
        data = (await res.json()) as GeoJsonResponse;
        break;
      } catch {
        // Try next endpoint variant.
      }
    }
    if (!data) {
      lookupCache.set(k, null);
      return null;
    }
    const candidates = parseParaglidingEarthGeoJson(data);

    if (candidates.length === 0) {
      lookupCache.set(k, null);
      return null;
    }

    candidates.sort(
      (a, b) => haversineKm(lat, lon, a.lat, a.lon) - haversineKm(lat, lon, b.lat, b.lon),
    );
    const nearest = candidates[0];
    const result: SiteLookupResult = {
      name: nearest.name,
      distanceKm: haversineKm(lat, lon, nearest.lat, nearest.lon),
      countryCode: nearest.countryCode,
      source: 'ParaglidingEarth',
      sourceUrl: nearest.sourceUrl,
      lat: nearest.lat,
      lon: nearest.lon,
      supportsThermals: nearest.supportsThermals,
      supportsSoaring: nearest.supportsSoaring,
      supportsWinch: nearest.supportsWinch,
      apiDetails: nearest.apiDetails,
    };
    lookupCache.set(k, result);
    return result;
  } catch {
    lookupCache.set(k, null);
    return null;
  }
}
