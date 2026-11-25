import { describe, expect, it } from 'vitest';
import { azElToEnu } from '@skytrace/shared';
import { CameraModel } from '../camera/projection';
import { deviceToWorld } from '../math/mat3';
import { addTap, type CalState, type CalTap } from './calibrate';

/**
 * Simulate a phone whose compass reads `compassError` degrees too low and whose
 * real lens FOV differs from our default by `trueScale`. Generate the taps a
 * user would make on real objects, and check that calibration recovers both.
 */
function makeTap(viewAz: number, viewEl: number, objAz: number, objEl: number, compassError: number, trueScale: number): CalTap {
  const sensorAz = viewAz - compassError;
  const common = {
    screenAngleDeg: 0,
    screenW: 400,
    screenH: 800,
    videoW: 1080,
    videoH: 1920,
    longFovDeg: 66,
  };
  // What the sensors say (uncalibrated)
  const raw = new CameraModel();
  raw.update({ ...common, deviceToWorld: deviceToWorld(-sensorAz, 90 + viewEl, 0), yawOffsetDeg: 0, fovScale: 1 });
  // Where the object really appears on screen (true pose + true lens)
  const truth = new CameraModel();
  truth.update({ ...common, deviceToWorld: deviceToWorld(-viewAz, 90 + viewEl, 0), yawOffsetDeg: 0, fovScale: trueScale });
  const target = azElToEnu(objAz, objEl);
  const p = truth.project(target);
  return { x: p.x, y: p.y, W: 400, H: 800, Mraw: raw.Mraw, F0: raw.F0, target, label: 'obj' };
}

const empty: CalState = { yawDeg: 0, fovScale: 1, taps: [], residualDeg: NaN };

describe('calibration', () => {
  it('one tap recovers the compass error', () => {
    const s = addTap(empty, makeTap(100, 30, 108, 34, 12, 1));
    expect(s.yawDeg).toBeCloseTo(12, 1);
    expect(s.residualDeg).toBeLessThan(0.05);
  });

  it('two taps recover compass error and FOV scale', () => {
    let s = addTap(empty, makeTap(200, 20, 190, 25, -9, 1.12));
    s = addTap(s, makeTap(230, 40, 241, 35, -9, 1.12));
    expect(s.yawDeg).toBeCloseTo(-9, 0);
    expect(s.fovScale).toBeCloseTo(1.12, 1);
    expect(s.residualDeg).toBeLessThan(0.2);
  });
});
