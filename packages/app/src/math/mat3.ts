/**
 * 3x3 rotation matrices (row-major tuples) and quaternions.
 *
 * Frames used in the app:
 *  - World: ENU (x = east, y = north, z = up)
 *  - Device: W3C DeviceOrientation frame (x = right of screen, y = top of screen,
 *    z = out of the screen towards the user). The back camera looks along -z.
 *  - Camera/screen: like Device but rotated with the current screen orientation
 *    (x = screen right, y = screen up).
 */
import { DEG, type Vec3 } from '@skytrace/shared';

export type Mat3 = [number, number, number, number, number, number, number, number, number];
export type Quat = [number, number, number, number]; // [w, x, y, z]

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** W3C rotation matrix for (alpha, beta, gamma): maps device vectors to world (ENU). */
export function deviceToWorld(alphaDeg: number, betaDeg: number, gammaDeg: number): Mat3 {
  const a = alphaDeg * DEG;
  const b = betaDeg * DEG;
  const g = gammaDeg * DEG;
  const cA = Math.cos(a), sA = Math.sin(a);
  const cB = Math.cos(b), sB = Math.sin(b);
  const cG = Math.cos(g), sG = Math.sin(g);
  return [
    cA * cG - sA * sB * sG, -cB * sA, cG * sA * sB + cA * sG,
    cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB,
    -cB * sG, sB, cB * cG,
  ];
}

export function transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function mul(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Rotation about world "up" that ADDS `deltaDeg` to every azimuth. */
export function yaw(deltaDeg: number): Mat3 {
  const d = deltaDeg * DEG;
  const c = Math.cos(d), s = Math.sin(d);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

/** Device -> screen frame for a screen orientation angle (0, 90, 180, 270). */
export function screenRotation(angleDeg: number): Mat3 {
  const a = angleDeg * DEG;
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export function normalize(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

export function quatFromMat(m: Mat3): Quat {
  const tr = m[0] + m[4] + m[8];
  let w: number, x: number, y: number, z: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s;
    x = (m[7] - m[5]) / s;
    y = (m[2] - m[6]) / s;
    z = (m[3] - m[1]) / s;
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    w = (m[7] - m[5]) / s;
    x = 0.25 * s;
    y = (m[1] + m[3]) / s;
    z = (m[2] + m[6]) / s;
  } else if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    w = (m[2] - m[6]) / s;
    x = (m[1] + m[3]) / s;
    y = 0.25 * s;
    z = (m[5] + m[7]) / s;
  } else {
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
    w = (m[3] - m[1]) / s;
    x = (m[2] + m[6]) / s;
    y = (m[5] + m[7]) / s;
    z = 0.25 * s;
  }
  return [w, x, y, z];
}

export function matFromQuat(q: Quat): Mat3 {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

/** Normalized linear interpolation between quaternions (shortest path). */
export function nlerp(a: Quat, b: Quat, t: number): Quat {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const sgn = dot < 0 ? -1 : 1;
  const q: Quat = [
    a[0] + (sgn * b[0] - a[0]) * t,
    a[1] + (sgn * b[1] - a[1]) * t,
    a[2] + (sgn * b[2] - a[2]) * t,
    a[3] + (sgn * b[3] - a[3]) * t,
  ];
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** Angle between two quaternions' rotations, degrees. */
export function quatAngleDeg(a: Quat, b: Quat): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, dot))) / DEG;
}
