import { parseTleText, tleEpoch, type TleGroup, type TleResponse } from '@skytrace/shared';
import type { KeyValueStore } from '../store';
import { USER_AGENT } from './common';

/** CelesTrak updates GP data about every 2 h; we never fetch more often than this. */
export const TLE_REFRESH_SEC = 3 * 3600;
/** Keep serving stale data for up to 3 days if CelesTrak is unreachable. */
const TLE_KEEP_SEC = 3 * 86400;

const key = (g: TleGroup) => `tle:${g}`;

export async function downloadGroup(group: TleGroup): Promise<TleResponse> {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`CelesTrak HTTP ${res.status}`);
  const sats = parseTleText(await res.text());
  if (sats.length === 0) throw new Error(`CelesTrak returned no TLEs for ${group}`);
  return { group, fetchedAt: Math.floor(Date.now() / 1000), sats, source: 'celestrak' };
}

/**
 * Fallback when CelesTrak is down: a fixed list of bright, naked-eye satellites
 * fetched one by one from tle.ivanstanojevic.me (free, no key). Stale TLEs
 * (older than 10 days) are dropped.
 */
const BRIGHT_SATS = [
  25544, // ISS
  48274, // Tiangong (Tianhe)
  20580, // Hubble
  25994, // Terra
  27424, // Aqua
  28654, // NOAA 18
  33591, // NOAA 19
  25338, // NOAA 15
  37849, // Suomi NPP
  43013, // NOAA 20
  39084, // Landsat 8
  49260, // Landsat 9
  22285, 22566, 23088, 23343, 25400, 25407, 26070, 28353, 31793, // SL-16 rocket bodies (bright)
];

export async function downloadFallback(group: TleGroup): Promise<TleResponse> {
  const results = await Promise.allSettled(
    BRIGHT_SATS.map(async (id) => {
      const res = await fetch(`https://tle.ivanstanojevic.me/api/tle/${id}`, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { name: string; line1: string; line2: string };
      if (Date.now() - tleEpoch(j.line1).getTime() > 10 * 86400_000) throw new Error('stale');
      return { name: j.name, line1: j.line1, line2: j.line2 };
    }),
  );
  const sats = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (sats.length === 0) throw new Error('fallback TLE source returned nothing');
  return { group, fetchedAt: Math.floor(Date.now() / 1000), sats, source: 'fallback' };
}

/** Return cached TLEs, refreshing from CelesTrak when older than TLE_REFRESH_SEC. */
export async function getGroup(store: KeyValueStore, group: TleGroup): Promise<TleResponse> {
  const raw = await store.get(key(group));
  const cached = raw ? (JSON.parse(raw) as TleResponse) : null;
  const age = cached ? Date.now() / 1000 - cached.fetchedAt : Infinity;
  if (cached && age < TLE_REFRESH_SEC) return cached;
  // A fallback result is re-tried against CelesTrak after 15 min.
  if (cached?.source === 'fallback' && age < 900) return cached;
  try {
    return await refreshGroup(store, group);
  } catch (err) {
    if (cached && cached.source !== 'fallback') return cached; // stale is better than nothing
    if (group !== 'visual' && group !== 'stations') throw err;
    const fb = await downloadFallback(group);
    await store.put(key(group), JSON.stringify(fb), TLE_KEEP_SEC);
    return fb;
  }
}

export async function refreshGroup(store: KeyValueStore, group: TleGroup): Promise<TleResponse> {
  const fresh = await downloadGroup(group);
  await store.put(key(group), JSON.stringify(fresh), TLE_KEEP_SEC);
  return fresh;
}
