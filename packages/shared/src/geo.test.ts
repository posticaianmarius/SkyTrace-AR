import { describe, expect, it } from 'vitest';
import {
  angleBetweenDeg,
  azElToEnu,
  deadReckon,
  deltaDeg,
  enuToAzEl,
  geodeticToEcef,
  lookAngles,
  observerFrame,
  refractionDeg,
} from './geo';
import { noradId, parseTleText, tleEpoch } from './tle';

describe('geodeticToEcef', () => {
  it('equator / prime meridian is on the X axis at the semi-major axis', () => {
    const [x, y, z] = geodeticToEcef({ lat: 0, lon: 0, altM: 0 });
    expect(x).toBeCloseTo(6378137, 3);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(0, 6);
  });

  it('north pole is at the semi-minor axis', () => {
    const [, , z] = geodeticToEcef({ lat: 90, lon: 0, altM: 0 });
    expect(z).toBeCloseTo(6356752.314, 2);
  });
});

describe('look angles', () => {
  const obs = { lat: 44.43, lon: 26.1, altM: 80 };
  const f = observerFrame(obs);

  it('a point straight above is at elevation 90', () => {
    const la = lookAngles(f, { ...obs, altM: 10_080 });
    expect(la.elDeg).toBeCloseTo(90, 5);
    expect(la.rangeM).toBeCloseTo(10_000, 3);
  });

  it('a plane 100 km north at FL330 is at azimuth ~0 and elevation ~5.2 deg', () => {
    // 100 km north = 0.8993 deg of latitude (approx)
    const la = lookAngles(f, { lat: obs.lat + 0.8993, lon: obs.lon, altM: 10_080 });
    expect(Math.abs(deltaDeg(la.azDeg, 0))).toBeLessThan(0.01);
    // flat-earth 5.71 deg minus Earth-curvature drop (~0.45 deg)
    expect(la.elDeg).toBeGreaterThan(5.0);
    expect(la.elDeg).toBeLessThan(5.4);
  });

  it('due east is azimuth 90', () => {
    const la = lookAngles(f, { lat: obs.lat, lon: obs.lon + 0.5, altM: 10_000 });
    expect(la.azDeg).toBeGreaterThan(89);
    expect(la.azDeg).toBeLessThan(91);
  });

  it('azElToEnu and enuToAzEl round-trip', () => {
    for (const [az, el] of [
      [0, 0],
      [45, 30],
      [200, 75],
      [359, -5],
    ] as const) {
      const back = enuToAzEl(azElToEnu(az, el));
      expect(Math.abs(deltaDeg(back.azDeg, az))).toBeLessThan(1e-9);
      expect(back.elDeg).toBeCloseTo(el, 9);
    }
  });
});

describe('helpers', () => {
  it('angleBetweenDeg', () => {
    expect(angleBetweenDeg([1, 0, 0], [0, 1, 0])).toBeCloseTo(90, 9);
  });

  it('refraction is ~0.48 deg at the horizon and tiny overhead', () => {
    expect(refractionDeg(0)).toBeCloseTo(0.483, 2);
    expect(refractionDeg(89)).toBeLessThan(0.001);
  });

  it('deadReckon moves 2300 m east in 10 s at 230 m/s', () => {
    const p = deadReckon({ lat: 0, lon: 0, altM: 10_000 }, 230, 90, 5, 10);
    expect(p.lat).toBeCloseTo(0, 9);
    expect(p.lon).toBeCloseTo(0.02068, 4);
    expect(p.altM).toBeCloseTo(10_050, 6);
  });
});

describe('TLE parsing', () => {
  const text = `ISS (ZARYA)
1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9005
2 25544  51.6400 208.9163 0006317  69.9862  25.2906 15.49438371 12345
`;
  it('parses 3-line sets', () => {
    const recs = parseTleText(text);
    expect(recs).toHaveLength(1);
    expect(recs[0]!.name).toBe('ISS (ZARYA)');
    expect(noradId(recs[0]!.line1)).toBe(25544);
  });

  it('reads the epoch', () => {
    const d = tleEpoch(parseTleText(text)[0]!.line1);
    expect(d.toISOString()).toBe('2024-01-01T12:00:00.000Z');
  });
});
