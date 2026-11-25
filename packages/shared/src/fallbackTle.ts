import { noradId, tleEpoch } from './tle';
import type { TleGroup, TleResponse, TleRecord } from './types';

/**
 * Sources used when CelesTrak is unreachable (it often refuses shared cloud IPs):
 *  - SatNOGS DB: ~1,700 satellites in ONE request (no key; no CORS, so servers only).
 *    Mostly small radio satellites, but it includes the ISS, Tiangong and several
 *    bright Earth-observation satellites.
 *  - tle.ivanstanojevic.me: one request per satellite (CORS-enabled, so phones can
 *    call it too). Rate-limited, so it only fills what SatNOGS lacks.
 * TLEs older than 10 days are dropped.
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

const MAX_AGE_MS = 10 * 86400_000;
const fresh = (line1: string) => Date.now() - tleEpoch(line1).getTime() <= MAX_AGE_MS;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Several groups are often requested together: share each download for a minute. */
const SHARE_MS = 60_000;
function shared<T>(load: () => Promise<T>): () => Promise<T> {
  let cur: { at: number; promise: Promise<T> } | null = null;
  return () => {
    if (!cur || Date.now() - cur.at > SHARE_MS) {
      const promise = load();
      cur = { at: Date.now(), promise };
      promise.catch(() => (cur = null));
    }
    return cur.promise;
  };
}

// ---------------------------------------------------------------- SatNOGS

interface SatnogsTle {
  tle0: string;
  tle1: string;
  tle2: string;
  norad_cat_id: number;
}

let satnogsHeaders: Record<string, string> = {};
const satnogsShared = shared(async (): Promise<TleRecord[]> => {
  const res = await fetch('https://db.satnogs.org/api/tle/?format=json', {
    headers: { accept: 'application/json', ...satnogsHeaders },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`SatNOGS HTTP ${res.status}`);
  const rows = (await res.json()) as SatnogsTle[];
  const byId = new Map<number, TleRecord>();
  for (const r of rows) {
    if (!r.tle1?.startsWith('1 ') || !r.tle2?.startsWith('2 ') || !fresh(r.tle1)) continue;
    const id = noradId(r.tle1);
    const prev = byId.get(id);
    // Same object listed twice: keep the newer elements.
    if (prev && tleEpoch(prev.line1) >= tleEpoch(r.tle1)) continue;
    byId.set(id, { name: r.tle0.replace(/^0 /, '').trim(), line1: r.tle1, line2: r.tle2 });
  }
  if (byId.size === 0) throw new Error('SatNOGS returned no usable TLEs');
  return [...byId.values()];
});

/** Every satellite SatNOGS tracks, in one request. Servers only (no CORS). */
export async function fetchSatnogs(headers: Record<string, string> = {}): Promise<TleRecord[]> {
  satnogsHeaders = headers;
  return satnogsShared();
}

export async function fetchSatnogsGroup(headers: Record<string, string> = {}): Promise<TleResponse> {
  const sats = await fetchSatnogs(headers);
  return { group: 'satnogs', fetchedAt: Math.floor(Date.now() / 1000), sats, source: 'satnogs' };
}

// ------------------------------------------------- tle.ivanstanojevic.me

/** The service rate-limits bursts (HTTP 508/429): a few at a time, with retries. */
const CONCURRENCY = 2;
const ATTEMPTS = 4;
const RETRY_BASE_MS = 1200;

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
      if (!fresh(j.line1)) throw new Error('stale');
      return { name: j.name, line1: j.line1, line2: j.line2 };
    } catch (err) {
      if (err instanceof Error && (err.message === 'stale' || err.message === 'not found')) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

async function fetchEach(ids: number[], headers: Record<string, string>): Promise<TleRecord[]> {
  const out: Array<TleRecord | null> = new Array(ids.length).fill(null);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < ids.length; i = next++) {
      try {
        out[i] = await fetchOne(ids[i]!, headers);
      } catch {
        /* skip this satellite */
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out.filter((s): s is TleRecord => s !== null);
}

// ------------------------------------------------- bright-satellite list

let brightHeaders: Record<string, string> = {};
const brightShared = shared(async (): Promise<TleRecord[]> => {
  const found = new Map<number, TleRecord>();
  try {
    const wanted = new Set(BRIGHT_SATS);
    for (const s of await fetchSatnogs(brightHeaders)) {
      const id = noradId(s.line1);
      if (wanted.has(id)) found.set(id, s);
    }
  } catch {
    /* SatNOGS down or blocked (e.g. browsers): fetch them all one by one */
  }
  const missing = BRIGHT_SATS.filter((id) => !found.has(id));
  for (const s of await fetchEach(missing, brightHeaders)) found.set(noradId(s.line1), s);
  // Keep the list order (ISS first).
  return BRIGHT_SATS.flatMap((id) => found.get(id) ?? []);
});

/** The bright, naked-eye satellites, from SatNOGS where possible and one by one otherwise. */
export async function fetchBrightTles(group: TleGroup, headers: Record<string, string> = {}): Promise<TleResponse> {
  brightHeaders = headers;
  const sats = await brightShared();
  if (sats.length === 0) throw new Error('fallback TLE source returned nothing');
  return { group, fetchedAt: Math.floor(Date.now() / 1000), sats, source: 'fallback' };
}
