import { AstroTime, EquatorFromVector, Horizon, Observer, RotateVector, Rotation_EQJ_EQD, VectorFromSphere } from 'astronomy-engine';
import { azElToEnu, type Geodetic, type Vec3 } from '@skytrace/shared';
import type { SkyReference } from '../types';
import catalog from './catalog.json';

export const CONSTELLATIONS = catalog.figures.map(({ id, name, paths }) => {
  const segments: Array<[number, number]> = [];
  for(const path of paths) {
    for(let i = 1; i < path.length; i ++) segments.push([path[i - 1]!, path[i]!]);
  }
  return { id, name, segments, vertices: [...new Set(paths.flat())] };
});

export interface StarSky {
  directions: Vec3[];
  references: SkyReference[];
}

export function computeStarSky(location: Geodetic, now: number): StarSky {
  const time = new AstroTime(new Date(now));
  const observer = new Observer(location.lat, location.lon, location.altM);
  const rotation = Rotation_EQJ_EQD(time);
  const horizontal = catalog.positions.map(([lon, lat]) => {
    const eq = EquatorFromVector(RotateVector(rotation, VectorFromSphere({ lon: lon!, lat: lat!, dist: 1 }, time)));
    return Horizon(time, observer, eq.ra, eq.dec, 'normal');
  });
  const directions = horizontal.map(({ azimuth, altitude }) => azElToEnu(azimuth, altitude));
  const references = catalog.references.flatMap(({ hip, name, position }): SkyReference[] => {
    const { azimuth, altitude } = horizontal[position]!;
    if(altitude <= 0) return [];
    return [{ kind: 'star', id: `star-${hip}`, label: name, dir: directions[position]!, azDeg: azimuth, elDeg: altitude }];
  });
  return { directions, references };
}
