/**
 * World (ENU direction) <-> screen pixel, using a pinhole camera.
 *
 *   camera vector c = S(screenAngle) * R_world->device * Yaw(-calibration) * v
 *   x_px = W/2 + F * c.x / -c.z
 *   y_px = H/2 - F * c.y / -c.z
 *
 * F (CSS px) comes from the lens field of view and how the <video> is scaled
 * to cover the screen (object-fit: cover).
 */
import { DEG, type Vec3 } from '@skytrace/shared';
import { apply, mul, normalize, screenRotation, transpose, yaw, type Mat3 } from '../math/mat3';

/** Typical phone main camera: ~66 deg across the long side of the image. */
export const DEFAULT_LONG_FOV_DEG = 66;

export interface Projected {
  x: number;
  y: number;
  /** True if the direction is in front of the camera. */
  front: boolean;
  /** Direction in camera frame (for off-screen arrows). */
  c: Vec3;
}

export class CameraModel {
  /** Screen size in CSS pixels. */
  W = 1;
  H = 1;
  /** Focal length in CSS px. */
  F = 1;
  /** World -> camera matrix including calibration. */
  M: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  /** World -> camera matrix WITHOUT calibration (used to fit calibration). */
  Mraw: Mat3 = this.M;
  /** Focal length without the calibration FOV scale. */
  F0 = 1;

  update(opts: {
    deviceToWorld: Mat3;
    screenAngleDeg: number;
    yawOffsetDeg: number;
    fovScale: number;
    screenW: number;
    screenH: number;
    videoW: number;
    videoH: number;
    longFovDeg: number;
  }) {
    this.W = opts.screenW;
    this.H = opts.screenH;
    // Video pixels -> CSS pixels with object-fit: cover
    const vw = opts.videoW || opts.screenW;
    const vh = opts.videoH || opts.screenH;
    const scale = Math.max(opts.screenW / vw, opts.screenH / vh);
    const fVideo = Math.max(vw, vh) / 2 / Math.tan((opts.longFovDeg * DEG) / 2);
    this.F0 = fVideo * scale;
    this.F = this.F0 * opts.fovScale;

    this.Mraw = mul(screenRotation(opts.screenAngleDeg), transpose(opts.deviceToWorld));
    this.M = mul(this.Mraw, yaw(-opts.yawOffsetDeg));
  }

  project(v: Vec3): Projected {
    const c = apply(this.M, v);
    const fwd = -c[2];
    if (fwd <= 1e-6) return { x: NaN, y: NaN, front: false, c };
    return {
      x: this.W / 2 + (this.F * c[0]) / fwd,
      y: this.H / 2 - (this.F * c[1]) / fwd,
      front: true,
      c,
    };
  }

  /** Clip a sky segment to the horizon and the camera frustum before dividing by depth. */
  projectSkySegment(a: Vec3, b: Vec3) {
    const [ax, ay, az] = apply(this.M, a);
    const [bx, by, bz] = apply(this.M, b);
    const da = -az, db = -bz;
    const sx = 2 * this.F / this.W, sy = 2 * this.F / this.H;
    let from = 0, to = 1;
    const bounds = [[a[2], b[2]], [da - 1e-6, db - 1e-6], [da + sx * ax, db + sx * bx], [da - sx * ax, db - sx * bx], [da + sy * ay, db + sy * by], [da - sy * ay, db - sy * by]] as const;
    for(const [start, end] of bounds) {
      if(start < 0 && end < 0) return null;
      if(start < 0) from = Math.max(from, start / (start - end));
      if(end < 0) to = Math.min(to, start / (start - end));
    }
    if(from >= to) return null;
    const point = (t: number) => {
      const depth = da + (db - da) * t;
      return { x: this.W / 2 + this.F * (ax + (bx - ax) * t) / depth, y: this.H / 2 - this.F * (ay + (by - ay) * t) / depth };
    };
    return { start: point(from), end: point(to) };
  }

  /** Screen pixel -> world unit direction (with calibration). */
  unproject(x: number, y: number): Vec3 {
    return rayToWorld(this.M, this.F, this.W, this.H, x, y);
  }

  /** Horizontal field of view of the screen, degrees. */
  get hfovDeg(): number {
    return (2 * Math.atan(this.W / 2 / this.F)) / DEG;
  }
}

export function rayToWorld(M: Mat3, F: number, W: number, H: number, x: number, y: number): Vec3 {
  const c = normalize([(x - W / 2) / F, -(y - H / 2) / F, -1]);
  return apply(transpose(M), c);
}
