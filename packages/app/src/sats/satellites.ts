/** Main-thread side of satellites: loads TLEs, talks to the SGP4 worker, interpolates. */
import { enuToAzEl, refractionDeg, azElToEnu, type Geodetic, type TleGroup, type TleRecord, type TleResponse } from '@skytrace/shared';
import type { SatState, SatWorkerIn, SatWorkerOut, SkyObject } from '../types';

const CACHE_HOURS = 6;

async function loadGroup(group: TleGroup): Promise<TleResponse> {
  const key = `tle:${group}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const cached = JSON.parse(raw) as TleResponse;
      if (Date.now() / 1000 - cached.fetchedAt < CACHE_HOURS * 3600 && cached.source !== 'fallback') return cached;
    }
  } catch {
    /* storage unavailable */
  }
  const res = await fetch(`/api/tle?group=${group}`);
  if (!res.ok) throw new Error(`TLE ${group}: HTTP ${res.status}`);
  const data = (await res.json()) as TleResponse;
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
