import { describe, expect, it } from 'vitest';
import { azElToEnu } from '@skytrace/shared';
import { CameraModel } from '../camera/projection';
import { deviceToWorld } from '../math/mat3';
import { makeArtPlane, projectArtPlane } from './art-projection';
import { computeStarSky } from './constellations';

function camera(heading: number, screenAngleDeg: number) {
  const cam = new CameraModel();
  cam.update({ deviceToWorld: deviceToWorld(-heading, 118, 0), screenAngleDeg, yawOffsetDeg: 0, fovScale: 1, screenW: 844, screenH: 390, videoW: 844, videoH: 390, longFovDeg: 66 });
  return cam;
}

describe('constellation artwork projection', () => {
  it('keeps each image anchor over its star after a pan and screen rotation', () => {
    const anchors = [{ x: 20, y: 26, dir: azElToEnu(145, 34) }, { x: 65, y: 91, dir: azElToEnu(152, 20) }, { x: 95, y: 8, dir: azElToEnu(159, 36) }] as const;
    const art = makeArtPlane('test', 120, 100, [...anchors]);
    for(const cam of [camera(150, 0), camera(164, 90)]) {
      const m = projectArtPlane(cam, art)!.matrix;
      for(const { x, y, dir } of anchors) {
        const star = cam.project(dir);
        const w = m[3]! * x + m[7]! * y + m[15]!;
        expect((m[0]! * x + m[4]! * y + m[12]!) / w).toBeCloseTo(star.x, 8);
        expect((m[1]! * x + m[5]! * y + m[13]!) / w).toBeCloseTo(star.y, 8);
      }
    }
  });

  it('builds finite projection planes for the 85 available illustrations only when enabled', () => {
    const location = { lat: 47.01, lon: 28.86, altM: 80 };
    const now = Date.parse('2026-11-26T20:00:00Z');
    expect(computeStarSky(location, now).art).toEqual([]);
    const { art } = computeStarSky(location, now, true);
    expect(new Set(art.map(({ id }) => id)).size).toBe(85);
    expect(art.every(({ origin, right, down }) => [...origin, ...right, ...down].every(Number.isFinite))).toBe(true);
  });

  it('clips an image that straddles the horizon and rejects a submerged image', () => {
    const plane = makeArtPlane('horizon', 100, 100, [{ x: 0, y: 0, dir: [-.2, 1, -.1] }, { x: 100, y: 0, dir: [.2, 1, -.1] }, { x: 0, y: 100, dir: [-.2, 1, .3] }]);
    const cam = camera(0, 0);
    const visible = projectArtPlane(cam, plane)?.clipPath.match(/-?[\d.]+(?=px)/g)?.map((value) => Math.round(Number(value)));
    expect(visible).toEqual([0, 25, 100, 25, 100, 100, 0, 100]);
    plane.origin[2] = -.5;
    expect(projectArtPlane(cam, plane)).toBeNull();
  });
});
