import { describe, expect, it } from 'vitest';
import { deltaDeg, enuToAzEl, type Vec3 } from '@skytrace/shared';
import { apply, deviceToWorld, matFromQuat, quatFromMat, screenRotation, transpose, yaw } from './mat3';

const BACK_CAMERA: Vec3 = [0, 0, -1];

function cameraAzEl(alpha: number, beta: number, gamma: number) {
  return enuToAzEl(apply(deviceToWorld(alpha, beta, gamma), BACK_CAMERA));
}

describe('deviceToWorld', () => {
  it('phone upright (beta 90), alpha 0: back camera looks north at the horizon', () => {
    const la = cameraAzEl(0, 90, 0);
    expect(Math.abs(deltaDeg(la.azDeg, 0))).toBeLessThan(1e-9);
    expect(la.elDeg).toBeCloseTo(0, 9);
  });

  it('alpha is counter-clockwise: alpha 90 looks west (az 270)', () => {
    const la = cameraAzEl(90, 90, 0);
    expect(Math.abs(deltaDeg(la.azDeg, 270))).toBeLessThan(1e-9);
  });

  it('beta 120 tilts the camera 30 deg up', () => {
    expect(cameraAzEl(0, 120, 0).elDeg).toBeCloseTo(30, 9);
  });

  it('phone flat face-up: camera looks straight down', () => {
    expect(cameraAzEl(0, 0, 0).elDeg).toBeCloseTo(-90, 9);
  });
});

describe('helpers', () => {
  it('yaw adds to azimuth', () => {
    const v = apply(yaw(30), [0, 1, 0]);
    expect(enuToAzEl(v).azDeg).toBeCloseTo(30, 9);
  });

  it('landscape (90): screen up is device +x', () => {
    const s = screenRotation(90);
    const up = apply(s, [1, 0, 0]);
    expect(up[1]).toBeCloseTo(1, 9);
    const right = apply(s, [0, -1, 0]);
    expect(right[0]).toBeCloseTo(1, 9);
  });

  it('quaternion round trip', () => {
    const m = deviceToWorld(123, 77, -20);
    const back = matFromQuat(quatFromMat(m));
    m.forEach((v, i) => expect(back[i]).toBeCloseTo(v, 9));
    const t = transpose(m);
    const id = apply(t, apply(m, [0.3, 0.4, 0.5]));
    expect(id[0]).toBeCloseTo(0.3, 9);
  });
});
