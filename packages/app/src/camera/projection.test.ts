import { describe, expect, it } from 'vitest';
import { angleBetweenDeg, azElToEnu } from '@skytrace/shared';
import { deviceToWorld } from '../math/mat3';
import { CameraModel } from './projection';

function camera(az: number, el: number, yawOffsetDeg = 0) {
  const cam = new CameraModel();
  cam.update({
    deviceToWorld: deviceToWorld(-az, 90 + el, 0),
    screenAngleDeg: 0,
    yawOffsetDeg,
    fovScale: 1,
    screenW: 400,
    screenH: 800,
    videoW: 1080,
    videoH: 1920,
    longFovDeg: 66,
  });
  return cam;
}

describe('CameraModel', () => {
  it('the view direction projects to the screen center', () => {
    const cam = camera(120, 30);
    const p = cam.project(azElToEnu(120, 30));
    expect(p.front).toBe(true);
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBeCloseTo(400, 6);
  });

  it('objects to the right (higher azimuth) appear right of center, higher elevation appears above', () => {
    const cam = camera(0, 20);
    const right = cam.project(azElToEnu(5, 20));
    const up = cam.project(azElToEnu(0, 25));
    expect(right.x).toBeGreaterThan(200);
    expect(up.y).toBeLessThan(400);
  });

  it('objects behind are not in front', () => {
    expect(camera(0, 0).project(azElToEnu(180, 0)).front).toBe(false);
  });

  it('unproject inverts project', () => {
    const cam = camera(250, 45, 7);
    const v = azElToEnu(262, 51);
    const p = cam.project(v);
    expect(angleBetweenDeg(cam.unproject(p.x, p.y), v)).toBeLessThan(1e-6);
  });

  it('a yaw calibration offset shifts which azimuth is at the center', () => {
    // Sensors claim we look at az 100; calibration says truth is +10 -> 110 is centered.
    const cam = camera(100, 10, 10);
    const p = cam.project(azElToEnu(110, 10));
    expect(p.x).toBeCloseTo(200, 6);
  });
});
