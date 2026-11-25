import { tleEpoch } from './tle';
import type { TleGroup, TleResponse, TleRecord } from './types';

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

/**
 * The service rate-limits bursts (HTTP 508/429), so requests run a few at a
 * time and each failed one is retried with a growing pause.
 */
const CONCURRENCY = 2;
const ATTEMPTS = 4;
const RETRY_BASE_MS = 1200;
/** Both groups ('visual', 'stations') use the same list: share one download. */
const SHARE_MS = 60_000;

let shared: { at: number; promise: Promise<TleRecord[]> } | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchOne(id: number, headers: Record<string, string>): Promise<TleRecord> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_BASE_MS * attempt);
    try {
      const res = await fetch(`https://tle.ivanstanojevic.me/api/tle/${id}`, {
        headers: { accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404) throw new Error('not found'); // won't appear on retry
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const j = (await res.json()) as { name: string; line1: string; line2: string };
      if (Date.now() - tleEpoch(j.line1).getTime() > 10 * 86400_000) throw new Error('stale');
      return { name: j.name, line1: j.line1, line2: j.line2 };
    } catch (err) {
      if (err instanceof Error && (err.message === 'stale' || err.message === 'not found')) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

async function downloadAll(headers: Record<string, string>): Promise<TleRecord[]> {
  const out: Array<TleRecord | null> = new Array(BRIGHT_SATS.length).fill(null);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < BRIGHT_SATS.length; i = next++) {
      try {
        out[i] = await fetchOne(BRIGHT_SATS[i]!, headers);
      } catch {
        /* skip this satellite */
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out.filter((s): s is TleRecord => s !== null);
}

export async function fetchBrightTles(group: TleGroup, headers: Record<string, string> = {}): Promise<TleResponse> {
  if (!shared || Date.now() - shared.at > SHARE_MS) {
    const promise = downloadAll(headers);
    shared = { at: Date.now(), promise };
    promise.catch(() => (shared = null));
  }
  const sats = await shared.promise;
  if (sats.length === 0) {
    shared = null;
    throw new Error('fallback TLE source returned nothing');
  }
  return { group, fetchedAt: Math.floor(Date.now() / 1000), sats, source: 'fallback' };
}
