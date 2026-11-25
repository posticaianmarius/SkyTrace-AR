import { fetchBrightTles, fetchSatnogsGroup, parseTleText, type TleGroup, type TleResponse } from '@skytrace/shared';
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

/** Return cached TLEs, refreshing from CelesTrak when older than TLE_REFRESH_SEC. */
export async function getGroup(store: KeyValueStore, group: TleGroup): Promise<TleResponse> {
  const raw = await store.get(key(group));
  const cached = raw ? (JSON.parse(raw) as TleResponse) : null;
  const age = cached ? Date.now() / 1000 - cached.fetchedAt : Infinity;
  if (cached && cached.source !== 'fallback' && age < TLE_REFRESH_SEC) return cached;
  // A fallback result is re-tried against CelesTrak after 15 min.
  if (cached?.source === 'fallback' && age < 900) return cached;
  try {
    return await refreshGroup(store, group);
  } catch (err) {
    if (cached && cached.source !== 'fallback') return cached; // stale is better than nothing
    if (group !== 'visual' && group !== 'stations') throw err;
    const fb = await fetchBrightTles(group, { 'user-agent': USER_AGENT });
    await store.put(key(group), JSON.stringify(fb), TLE_KEEP_SEC);
    return fb;
  }
}

export async function refreshGroup(store: KeyValueStore, group: TleGroup): Promise<TleResponse> {
  // 'satnogs' is not a CelesTrak group: it comes from the SatNOGS DB in one request.
  const fresh =
    group === 'satnogs' ? await fetchSatnogsGroup({ 'user-agent': USER_AGENT }) : await downloadGroup(group);
  await store.put(key(group), JSON.stringify(fresh), TLE_KEEP_SEC);
  return fresh;
}
