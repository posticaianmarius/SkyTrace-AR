/** Sun, Moon and bright planets: calibration references and context. */
import { Body, Equator, Horizon, Illumination, MoonPhase, Observer } from 'astronomy-engine';
import { azElToEnu, type Geodetic, type Vec3 } from '@skytrace/shared';
import type { BodySymbol, SkyObject } from '../types';

const BODIES: Array<{ body: Body; symbol: BodySymbol; label: string; priority: number }> = [
  { body: Body.Sun, symbol: 'sun', label: 'Sun', priority: 100 },
  { body: Body.Moon, symbol: 'moon', label: 'Moon', priority: 95 },
  { body: Body.Venus, symbol: 'venus', label: 'Venus', priority: 80 },
  { body: Body.Jupiter, symbol: 'jupiter', label: 'Jupiter', priority: 78 },
  { body: Body.Mars, symbol: 'mars', label: 'Mars', priority: 70 },
  { body: Body.Saturn, symbol: 'saturn', label: 'Saturn', priority: 68 },
];

export interface BodiesResult {
  objects: SkyObject[];
  sunElDeg: number;
}

export function computeBodies(obs: Geodetic, date: Date): BodiesResult {
  const o = new Observer(obs.lat, obs.lon, obs.altM);
  let sunElDeg = 0;
  let sun: Vec3 = [0, 0, 0];
  const objects: SkyObject[] = [];
  for (const b of BODIES) {
    const eq = Equator(b.body, date, o, true, true);
    // 'normal' = apply standard atmospheric refraction
    const hor = Horizon(date, o, eq.ra, eq.dec, 'normal');
    const dir = azElToEnu(hor.azimuth, hor.altitude);
    if(b.body === Body.Sun) {
      sunElDeg = hor.altitude;
      sun = dir;
    }
    const illumination = b.body === Body.Sun ? null : Illumination(b.body, date);
    const phase = illumination && (b.body === Body.Moon || b.body === Body.Venus) ? { lit: illumination.phase_fraction, sun } : undefined;
    const sub = b.body === Body.Moon ? `${moonPhaseName(MoonPhase(date))} · ${Math.round(phase!.lit * 100)}% illuminated` : illumination ? `Magnitude ${illumination.mag.toFixed(1)}` : 'Never look directly at the Sun.';
    objects.push({
      kind: 'body',
      symbol: b.symbol,
      phase,
      id: `body-${b.label}`,
      label: b.label,
      sub,
      dir,
      azDeg: hor.azimuth,
      elDeg: hor.altitude,
      rangeKm: eq.dist * 149_597_870.7,
      priority: b.priority,
      visible: b.body === Body.Sun || b.body === Body.Moon || sunElDeg < -6 || illumination!.mag < -3.5,
    });
  }
  return { objects, sunElDeg };
}

const MOON_PHASES = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];

function moonPhaseName(angle: number): string {
  return MOON_PHASES[Math.round(angle / 45) % MOON_PHASES.length]!;
}
