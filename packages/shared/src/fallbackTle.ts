import { tleEpoch } from './tle';
import type { TleGroup, TleResponse } from './types';

/**
 * Fallback when CelesTrak is unreachable: a fixed list of bright, naked-eye
 * satellites fetched one by one from tle.ivanstanojevic.me (free, no key,
 * CORS-enabled so phones can call it directly). TLEs older than 10 days are dropped.
 */
export const BRIGHT_SATS = [
  25544, // ISS
  48274, // Tiangong (Tianhe)
  20580, // Hubble
  25994, // Terra
  27424, // Aqua
  37849, // Suomi NPP
  43013, // NOAA 20
  39084, // Landsat 8
  49260, // Landsat 9
  22285, 22566, 23088, 23343, 25400, 25407, 26070, 28353, 31793, // SL-16 rocket bodies (bright)
];

export async function fetchBrightTles(group: TleGroup, headers: Record<string, string> = {}): Promise<TleResponse> {
  const results = await Promise.allSettled(
    BRIGHT_SATS.map(async (id) => {
      const res = await fetch(`https://tle.ivanstanojevic.me/api/tle/${id}`, {
        headers: { accept: 'application/json', ...headers },
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
