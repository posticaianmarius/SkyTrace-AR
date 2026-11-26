import { describe, expect, it } from 'vitest';
import { angleBetweenDeg, azElToEnu } from '@skytrace/shared';
import { deviceToWorld } from '../math/mat3';
import { CameraModel } from './projection';

function camera(az: number, el: number, yawOffsetDeg = 0, zoom = 1) {
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
    zoom,
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

  it('magnifies sky coordinates around the same center as a digital video crop', () => {
    const wide = camera(0, 15), zoomed = camera(0, 15, 0, 4);
    const v = azElToEnu(4, 18);
    const a = wide.project(v), b = zoomed.project(v);
    expect(b.x - zoomed.W / 2).toBeCloseTo(4 * (a.x - wide.W / 2));
    expect(b.y - zoomed.H / 2).toBeCloseTo(4 * (a.y - wide.H / 2));
  });

  it('centers a focused crop and keeps deprojection and segment clipping aligned', () => {
    const cam = camera(0, 15, 0, 8);
    const target = azElToEnu(8, 20);
    expect(cam.focusOn(target)).toBe(true);
    expect(cam.project(target).x).toBeCloseTo(cam.W / 2);
    expect(cam.project(target).y).toBeCloseTo(cam.H / 2);
    expect(angleBetweenDeg(cam.unproject(cam.W / 2, cam.H / 2), target)).toBeLessThan(1e-6);
    const segment = cam.projectSkySegment(target, azElToEnu(30, 20));
    expect(segment?.start.x).toBeCloseTo(cam.W / 2);
    expect(segment?.end.x).toBeCloseTo(cam.W);
    expect(camera(0, 15, 0, 8).focusOn(azElToEnu(50, 20))).toBe(false);
  });

  it('clips a sky segment across the viewport even when both stars are offscreen', () => {
    const cam = camera(0, 15);
    const segment = cam.projectSkySegment(azElToEnu(330, 15), azElToEnu(30, 15));
    expect(segment?.start.x).toBeCloseTo(0);
    expect(segment?.end.x).toBeCloseTo(cam.W);
  });

  it('clips the part of a segment below the horizon', () => {
    const cam = camera(0, 5);
    const segment = cam.projectSkySegment(azElToEnu(0, 10), azElToEnu(0, -10));
    expect(segment?.end.y).toBeCloseTo(cam.project(azElToEnu(0, 0)).y);
    expect(cam.projectSkySegment(azElToEnu(0, -2), azElToEnu(5, -8))).toBeNull();
  });

  it('keeps the visible end of a segment with a star behind the camera', () => {
    const cam = camera(0, 15);
    const a = azElToEnu(0, 15);
    const b = azElToEnu(95, 15);
    expect(cam.project(b).front).toBe(false);
    const segment = cam.projectSkySegment(a, b);
    expect(segment?.start.x).toBeCloseTo(cam.W / 2);
    expect(segment?.end.x).toBeCloseTo(cam.W);
  });
});
