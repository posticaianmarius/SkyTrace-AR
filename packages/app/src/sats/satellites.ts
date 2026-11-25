/** Main-thread side of satellites: loads TLEs, talks to the SGP4 worker, interpolates. */
import {
  azElToEnu,
  enuToAzEl,
  fetchBrightTles,
  parseTleText,
  refractionDeg,
  type Geodetic,
  type TleGroup,
  type TleRecord,
  type TleResponse,
} from '@skytrace/shared';
import type { SatState, SatWorkerIn, SatWorkerOut, SkyObject } from '../types';

const CACHE_HOURS = 6;

/**
 * Our API first. If it fails (CelesTrak down, or the server's IP is rate
 * limited), fetch directly from the phone: CelesTrak, then the bright-satellite
 * fallback list (both allow browser requests).
 */
async function fetchGroup(group: TleGroup): Promise<TleResponse> {
  try {
    const res = await fetch(`/api/tle?group=${group}`);
    if (res.ok) return (await res.json()) as TleResponse;
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const sats = parseTleText(await res.text());
      if (sats.length) return { group, fetchedAt: Math.floor(Date.now() / 1000), sats, source: 'celestrak' };
    }
  } catch {
    /* fall through */
  }
  if (group !== 'visual' && group !== 'stations') throw new Error(`TLE ${group} unavailable`);
  return fetchBrightTles(group);
}

async function loadGroup(group: TleGroup): Promise<TleResponse> {
  const key = `tle:${group}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const cached = JSON.parse(raw) as TleResponse;
      const maxAge = cached.source === 'fallback' ? 3600 : CACHE_HOURS * 3600;
      if (Date.now() / 1000 - cached.fetchedAt < maxAge) return cached;
    }
  } catch {
    /* storage unavailable */
  }
  const data = await fetchGroup(group);
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
  return data;
}

export class Satellites {
  private worker = new Worker(new URL('./sgp4.worker.ts', import.meta.url), { type: 'module' });
  private latest: SatWorkerOut | null = null;
  groups = new Set<TleGroup>(['visual', 'stations']);
  total = 0;
  source: string = '';
  /** Unix seconds of the oldest TLE download in use. */
  fetchedAt = 0;
  error = '';
  /** Sun elevation in degrees, set by the caller (for "visible to the eye"). */
  sunElDeg = 0;

  constructor() {
    this.worker.onmessage = (e: MessageEvent<SatWorkerOut>) => {
      this.latest = e.data;
      this.total = e.data.total;
    };
  }

  setObserver(p: Geodetic) {
    this.post({ type: 'observer', lat: p.lat, lon: p.lon, altM: p.altM });
  }

  async reload() {
    const all = new Map<string, TleRecord>();
    const sources = new Set<string>();
    let oldest = Infinity;
    this.error = '';
    await Promise.all(
      [...this.groups].map(async (g) => {
        try {
          const data = await loadGroup(g);
          data.sats.forEach((s) => all.set(s.line1.slice(2, 7), s)); // dedupe by NORAD id
          sources.add(data.source ?? 'celestrak');
          oldest = Math.min(oldest, data.fetchedAt);
        } catch (err) {
          this.error = String(err);
        }
      }),
    );
    this.source = [...sources].join('+');
    this.fetchedAt = Number.isFinite(oldest) ? oldest : 0;
    this.post({ type: 'tles', sats: [...all.values()] });
  }

  private post(m: SatWorkerIn) {
    this.worker.postMessage(m);
  }

  /** Current sky objects (interpolated to `nowMs`). */
  objects(nowMs: number): SkyObject[] {
    const L = this.latest;
    if (!L) return [];
    const k = (nowMs - L.t0) / (L.t1 - L.t0);
    const dark = this.sunElDeg < -6;
    const out: SkyObject[] = [];
    for (const s of L.sats) {
      const la = enuToAzEl(lerpDir(s, k));
      if (la.elDeg < -1) continue;
      const el = la.elDeg + refractionDeg(la.elDeg);
      const visible = dark && s.sunlit;
      const isStation = /ISS|TIANHE|CSS/.test(s.name);
      out.push({
        kind: 'sat',
        id: `sat-${s.norad}`,
        label: prettyName(s.name),
        sub: `${Math.round(s.altKm)} km alt · ${Math.round(s.rangeKm)} km${visible ? ' · visible' : s.sunlit ? '' : ' · in shadow'}`,
        dir: azElToEnu(la.azDeg, el),
        azDeg: la.azDeg,
        elDeg: el,
        rangeKm: s.rangeKm,
        priority: (isStation ? 60 : 30) + (visible ? 20 : 0) + el / 10,
        visible,
      });
    }
    return out;
  }
}

function lerpDir(s: SatState, k: number): [number, number, number] {
  const t = Math.max(-1, Math.min(3, k)); // allow a little extrapolation
  return [
    s.d0[0] + (s.d1[0] - s.d0[0]) * t,
    s.d0[1] + (s.d1[1] - s.d0[1]) * t,
    s.d0[2] + (s.d1[2] - s.d0[2]) * t,
  ];
}

function prettyName(n: string): string {
  if (n.startsWith('ISS')) return 'ISS';
  if (n.includes('TIANHE')) return 'Tiangong';
  if (n === 'HST') return 'Hubble';
  return n;
}
