import { AstroTime, EquatorFromVector, Horizon, Observer, RotateVector, Rotation_EQJ_EQD, VectorFromSphere } from 'astronomy-engine';
import { azElToEnu, type Geodetic, type Vec3 } from '@skytrace/shared';
import type { SkyReference } from '../types';
import artCatalog from './art-catalog.json';
import { makeArtPlane, type ArtPlane } from './art-projection';
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
  art: ArtPlane[];
}

export function computeStarSky(location: Geodetic, now: number, withArt = false): StarSky {
  const time = new AstroTime(new Date(now));
  const observer = new Observer(location.lat, location.lon, location.altM);
  const rotation = Rotation_EQJ_EQD(time);
  const toHorizontal = ([lon, lat]: number[]) => {
    const eq = EquatorFromVector(RotateVector(rotation, VectorFromSphere({ lon: lon!, lat: lat!, dist: 1 }, time)));
    return Horizon(time, observer, eq.ra, eq.dec, 'normal');
  };
  const horizontal = catalog.positions.map(toHorizontal);
  const directions = horizontal.map(({ azimuth, altitude }) => azElToEnu(azimuth, altitude));
  const references = catalog.references.flatMap(({ hip, name, position }): SkyReference[] => {
    const { azimuth, altitude } = horizontal[position]!;
    if(altitude <= 0) return [];
    return [{ kind: 'star', id: `star-${hip}`, label: name, dir: directions[position]!, azDeg: azimuth, elDeg: altitude }];
  });
  const artDirections = withArt ? artCatalog.positions.map(toHorizontal).map(({ azimuth, altitude }) => azElToEnu(azimuth, altitude)) : [];
  const art = withArt ? artCatalog.figures.map(({ id, width, height, anchors }) => {
    const anchor = ({ x, y, position }: typeof anchors[number]) => ({ x, y, dir: artDirections[position]! });
    return makeArtPlane(id, width, height, [anchor(anchors[0]!), anchor(anchors[1]!), anchor(anchors[2]!)]);
  }) : [];
  return { directions, references, art };
}
