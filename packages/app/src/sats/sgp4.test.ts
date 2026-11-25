import { describe, expect, it } from 'vitest';
import { degreesToRadians, ecfToLookAngles, eciToEcf, gstime, propagate, twoline2satrec } from 'satellite.js';
import { deltaDeg, ecefToEnu, enuToAzEl, observerFrame } from '@skytrace/shared';

// ISS TLE (epoch 2026-11-23); test time is close to epoch.
const L1 = '1 25544U 98067A   26327.91294507  .00005691  00000+0  10921-3 0  9993';
const L2 = '2 25544  51.6322 229.6520 0007379  58.6021 301.5689 15.49568558596519';

describe('SGP4 pipeline', () => {
  it('our ECEF->ENU->az/el matches satellite.js look angles to < 0.05 deg', () => {
    const rec = twoline2satrec(L1, L2);
    const obs = { lat: 44.4268, lon: 26.1025, altM: 80 };
    const f = observerFrame(obs);
    const start = Date.UTC(2026, 10, 24, 0, 0, 0);
    let compared = 0;
    for (let m = 0; m < 24 * 60; m += 7) {
      const d = new Date(start + m * 60_000);
      const pv = propagate(rec, d);
      expect(pv).not.toBeNull();
      const ecf = eciToEcf(pv!.position, gstime(d));
      const ours = enuToAzEl(ecefToEnu(f, [ecf.x * 1000, ecf.y * 1000, ecf.z * 1000]));
      const ref = ecfToLookAngles(
        { latitude: degreesToRadians(obs.lat), longitude: degreesToRadians(obs.lon), height: obs.altM / 1000 },
        ecf,
      );
      const refEl = (ref.elevation * 180) / Math.PI;
      const refAz = (ref.azimuth * 180) / Math.PI;
      // satellite.js uses a spherical-ish topocentric frame; agreement should still be very close
      expect(Math.abs(ours.elDeg - refEl)).toBeLessThan(0.05);
      if (refEl > 0) {
        expect(Math.abs(deltaDeg(ours.azDeg, refAz))).toBeLessThan(0.05);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(0); // at least one pass above the horizon that day
  });

  it('ISS orbit altitude is ~400-430 km', () => {
    const rec = twoline2satrec(L1, L2);
    const pv = propagate(rec, new Date(Date.UTC(2026, 10, 24)));
    const p = pv!.position;
    const altKm = Math.hypot(p.x, p.y, p.z) - 6371;
    expect(altKm).toBeGreaterThan(380);
    expect(altKm).toBeLessThan(450);
  });
});
