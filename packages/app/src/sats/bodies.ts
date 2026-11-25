/** Sun, Moon and bright planets: calibration references and context. */
import { Body, Equator, Horizon, Illumination, Observer } from 'astronomy-engine';
import { azElToEnu, type Geodetic } from '@skytrace/shared';
import type { SkyObject } from '../types';

const BODIES: Array<{ body: Body; label: string; priority: number }> = [
  { body: Body.Sun, label: 'Sun', priority: 100 },
  { body: Body.Moon, label: 'Moon', priority: 95 },
  { body: Body.Venus, label: 'Venus', priority: 80 },
  { body: Body.Jupiter, label: 'Jupiter', priority: 78 },
  { body: Body.Mars, label: 'Mars', priority: 70 },
  { body: Body.Saturn, label: 'Saturn', priority: 68 },
];

export interface BodiesResult {
  objects: SkyObject[];
  sunElDeg: number;
}

export function computeBodies(obs: Geodetic, date: Date): BodiesResult {
  const o = new Observer(obs.lat, obs.lon, obs.altM);
  let sunElDeg = 0;
  const objects: SkyObject[] = [];
  for (const b of BODIES) {
    const eq = Equator(b.body, date, o, true, true);
    // 'normal' = apply standard atmospheric refraction
    const hor = Horizon(date, o, eq.ra, eq.dec, 'normal');
    if (b.body === Body.Sun) sunElDeg = hor.altitude;
    const isNight = sunElDeg < -6;
    let sub = `az ${hor.azimuth.toFixed(1)}° el ${hor.altitude.toFixed(1)}°`;
    let visible = true;
    if (b.body !== Body.Sun && b.body !== Body.Moon) {
      const mag = Illumination(b.body, date).mag;
      sub = `mag ${mag.toFixed(1)} · ${sub}`;
      visible = isNight || mag < -3.5;
    }
    if (b.body === Body.Sun) sub = `Don't look at it directly · ${sub}`;
    objects.push({
      kind: 'body',
      id: `body-${b.label}`,
      label: b.label,
      sub,
      dir: azElToEnu(hor.azimuth, hor.altitude),
      azDeg: hor.azimuth,
      elDeg: hor.altitude,
      rangeKm: eq.dist * 149_597_870.7,
      priority: b.priority,
      visible,
    });
  }
  return { objects, sunElDeg };
}
