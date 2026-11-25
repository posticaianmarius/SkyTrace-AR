/**
 * Web Worker: propagates every satellite with SGP4 and reports the ones above
 * the horizon as ENU directions at two times (t0, t1) so the main thread can
 * interpolate smoothly at 60 fps.
 */
import { Body, GeoVector } from 'astronomy-engine';
import { eciToEcf, gstime, propagate, twoline2satrec, type SatRec } from 'satellite.js';
import { ecefToEnu, enuToAzEl, noradId, observerFrame, type ObserverFrame, type Vec3 } from '@skytrace/shared';
import type { SatState, SatWorkerIn, SatWorkerOut } from '../types';

interface Sat {
  name: string;
  norad: number;
  rec: SatRec;
}

const EARTH_R_KM = 6371;
const MIN_EL_DEG = -3;

let sats: Sat[] = [];
let frame: ObserverFrame | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const ctx = self as unknown as {
  postMessage(msg: SatWorkerOut): void;
  onmessage: ((e: MessageEvent<SatWorkerIn>) => void) | null;
};

ctx.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'tles') {
    sats = [];
    for (const t of m.sats) {
      try {
        const rec = twoline2satrec(t.line1, t.line2);
        if (rec.error) continue;
        sats.push({ name: t.name, norad: noradId(t.line1), rec });
      } catch {
        /* skip malformed */
      }
    }
  } else if (m.type === 'observer') {
    frame = observerFrame({ lat: m.lat, lon: m.lon, altM: m.altM });
  }
  schedule(0);
};

function schedule(delay: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, delay);
}

/** ENU unit direction + range + ECI position (km) for one satellite at `date`. */
function look(s: Sat, date: Date, gmst: number, f: ObserverFrame) {
  const pv = propagate(s.rec, date);
  if (!pv || typeof pv.position !== 'object') return null;
  const ecf = eciToEcf(pv.position, gmst);
  const enu = ecefToEnu(f, [ecf.x * 1000, ecf.y * 1000, ecf.z * 1000]);
  const la = enuToAzEl(enu);
  const n = la.rangeM;
  return {
    dir: [enu[0] / n, enu[1] / n, enu[2] / n] as Vec3,
    elDeg: la.elDeg,
    rangeKm: n / 1000,
    eci: pv.position,
  };
}

function tick() {
  if (!frame || sats.length === 0) return;
  const f = frame;
  const stepMs = sats.length > 2000 ? 1000 : 500;
  const t0 = Date.now();
  const t1 = t0 + 1000;
  const d0 = new Date(t0);
  const d1 = new Date(t1);
  const g0 = gstime(d0);
  const g1 = gstime(d1);

  // Sun direction (J2000 ~ TEME within ~0.4 deg; plenty for the shadow test)
  const sv = GeoVector(Body.Sun, d0, true);
  const sn = Math.hypot(sv.x, sv.y, sv.z);
  const sun = [sv.x / sn, sv.y / sn, sv.z / sn];

  const out: SatState[] = [];
  for (const s of sats) {
    const a = look(s, d0, g0, f);
    if (!a || a.elDeg < MIN_EL_DEG) continue;
    const b = look(s, d1, g1, f);
    if (!b) continue;
    const p = a.eci;
    const r = Math.hypot(p.x, p.y, p.z);
    // Cylindrical Earth-shadow model
    const along = p.x * sun[0]! + p.y * sun[1]! + p.z * sun[2]!;
    const perp = Math.hypot(p.x - along * sun[0]!, p.y - along * sun[1]!, p.z - along * sun[2]!);
    const sunlit = along > 0 || perp > EARTH_R_KM;
    out.push({
      name: s.name,
      norad: s.norad,
      d0: a.dir,
      d1: b.dir,
      rangeKm: a.rangeKm,
      altKm: r - EARTH_R_KM,
      sunlit,
    });
  }
  ctx.postMessage({ type: 'states', t0, t1, sats: out, total: sats.length });
  schedule(stepMs);
}
