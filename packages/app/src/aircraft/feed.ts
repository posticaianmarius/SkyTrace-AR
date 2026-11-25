/** Polls /api/aircraft and dead-reckons every aircraft to "now" each frame. */
import {
  deadReckon,
  enuToAzEl,
  ecefToEnu,
  geodeticToEcef,
  observerFrame,
  refractionDeg,
  azElToEnu,
  type Aircraft,
  type AircraftResponse,
  type Geodetic,
  type ObserverFrame,
} from '@skytrace/shared';
import type { SkyObject } from '../types';

const POLL_MS = 10_000;
const RADIUS_KM = 150;
/** Don't extrapolate further than this (stale data is worse than none). */
const MAX_EXTRAPOLATE_SEC = 60;

export class AircraftFeed {
  aircraft: Aircraft[] = [];
  source = '';
  error = '';
  fetchedAt = 0;
  private obs: Geodetic | null = null;
  private frame: ObserverFrame | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  enabled = true;

  setObserver(p: Geodetic) {
    const first = this.obs == null;
    this.obs = p;
    this.frame = observerFrame(p);
    if (first) this.poll();
  }

  private async poll() {
    if (this.timer) clearTimeout(this.timer);
    if (this.obs && this.enabled && document.visibilityState !== 'hidden') {
      try {
        const q = `lat=${this.obs.lat.toFixed(3)}&lon=${this.obs.lon.toFixed(3)}&r=${RADIUS_KM}`;
        const res = await fetch(`/api/aircraft?${q}`);
        const data = (await res.json()) as AircraftResponse;
        if (data.source !== 'none') {
          this.aircraft = data.aircraft;
          this.fetchedAt = data.fetchedAt;
        }
        this.source = data.source;
        this.error = data.error ?? '';
      } catch (err) {
        this.error = String(err);
      }
    }
    this.timer = setTimeout(() => this.poll(), POLL_MS);
  }

  /** Median age of the position data in seconds. */
  dataAgeSec(nowSec: number): number {
    if (this.aircraft.length === 0) return NaN;
    const ages = this.aircraft.map((a) => nowSec - a.t).sort((x, y) => x - y);
    return ages[Math.floor(ages.length / 2)] ?? NaN;
  }

  objects(nowMs: number): SkyObject[] {
    const f = this.frame;
    if (!f || !this.enabled) return [];
    const now = nowMs / 1000;
    const out: SkyObject[] = [];
    for (const a of this.aircraft) {
      const dt = Math.min(MAX_EXTRAPOLATE_SEC, Math.max(0, now - a.t));
      const p = deadReckon({ lat: a.lat, lon: a.lon, altM: a.altM }, a.spdMs, a.trkDeg, a.vrMs, dt);
      const la = enuToAzEl(ecefToEnu(f, geodeticToEcef(p)));
      if (la.elDeg < -1 || la.rangeM > RADIUS_KM * 1000) continue;
      const el = la.elDeg + refractionDeg(la.elDeg) * 0.5; // aircraft are inside most of the atmosphere
      const km = la.rangeM / 1000;
      const fl = Math.round(a.altM / 0.3048 / 100);
      out.push({
        kind: 'aircraft',
        id: `ac-${a.id}`,
        label: a.cs || a.id.toUpperCase(),
        sub: `FL${String(fl).padStart(3, '0')} · ${km.toFixed(km < 10 ? 1 : 0)} km · ${Math.round(a.spdMs * 3.6)} km/h${a.type ? ' · ' + a.type : ''}`,
        dir: azElToEnu(la.azDeg, el),
        azDeg: la.azDeg,
        elDeg: el,
        rangeKm: km,
        priority: 50 + Math.max(0, 40 - km / 3),
        visible: true,
      });
    }
    return out;
  }
}
