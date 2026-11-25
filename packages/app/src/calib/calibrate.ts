/**
 * Calibration: the user taps where a known object REALLY is in the camera image.
 *  - 1 tap  -> yaw (compass) offset
 *  - 2+ taps, at least 5 deg apart -> yaw offset + field-of-view scale
 *
 * Each tap stores the raw (uncalibrated) camera matrix at that moment, so the
 * phone can move between taps.
 */
import { angleBetweenDeg, deltaDeg, enuToAzEl, type Vec3 } from '@skytrace/shared';
import { apply, yaw, type Mat3 } from '../math/mat3';
import { rayToWorld } from '../camera/projection';

export interface CalTap {
  x: number;
  y: number;
  W: number;
  H: number;
  /** Uncalibrated world -> camera matrix at tap time. */
  Mraw: Mat3;
  /** Focal length (CSS px) before the FOV scale. */
  F0: number;
  /** True direction of the tapped object (world ENU). */
  target: Vec3;
  label: string;
}

export interface CalState {
  yawDeg: number;
  fovScale: number;
  taps: CalTap[];
  /** RMS residual of the last fit, degrees. */
  residualDeg: number;
}

const KEY = 'skytrace:calibration';
const MAX_TAPS = 4;

export function loadCalibration(): CalState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Pick<CalState, 'yawDeg' | 'fovScale'>;
      return { yawDeg: s.yawDeg ?? 0, fovScale: s.fovScale ?? 1, taps: [], residualDeg: NaN };
    }
  } catch {
    /* ignore */
  }
  return { yawDeg: 0, fovScale: 1, taps: [], residualDeg: NaN };
}

export function saveCalibration(s: CalState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ yawDeg: s.yawDeg, fovScale: s.fovScale }));
  } catch {
    /* ignore */
  }
}

/** Ray (world, uncalibrated) for a tap at a given FOV scale. */
function tapRay(t: CalTap, scale: number): Vec3 {
  return rayToWorld(t.Mraw, t.F0 * scale, t.W, t.H, t.x, t.y);
}

function yawFor(taps: CalTap[], scale: number): number {
  // Circular mean of per-tap azimuth differences
  let sx = 0;
  let sy = 0;
  for (const t of taps) {
    const d = deltaDeg(enuToAzEl(t.target).azDeg, enuToAzEl(tapRay(t, scale)).azDeg) * (Math.PI / 180);
    sx += Math.cos(d);
    sy += Math.sin(d);
  }
  return (Math.atan2(sy, sx) * 180) / Math.PI;
}

function rms(taps: CalTap[], scale: number, yawDeg: number): number {
  const Y = yaw(yawDeg);
  let s = 0;
  for (const t of taps) s += angleBetweenDeg(apply(Y, tapRay(t, scale)), t.target) ** 2;
  return Math.sqrt(s / taps.length);
}

function spreadDeg(taps: CalTap[]): number {
  let best = 0;
  for (let i = 0; i < taps.length; i++)
    for (let j = i + 1; j < taps.length; j++) best = Math.max(best, angleBetweenDeg(taps[i]!.target, taps[j]!.target));
  return best;
}

/** Add a tap and re-fit. Returns the updated state. */
export function addTap(state: CalState, tap: CalTap): CalState {
  const taps = [...state.taps, tap].slice(-MAX_TAPS);
  let fovScale = state.fovScale;
  if (taps.length >= 2 && spreadDeg(taps) >= 5) {
    let best = { err: Infinity, scale: fovScale };
    for (let s = 0.7; s <= 1.4; s += 0.0025) {
      const err = rms(taps, s, yawFor(taps, s));
      if (err < best.err) best = { err, scale: s };
    }
    fovScale = best.scale;
  }
  const yawDeg = yawFor(taps, fovScale);
  const next: CalState = { yawDeg, fovScale, taps, residualDeg: rms(taps, fovScale, yawDeg) };
  saveCalibration(next);
  return next;
}

export function resetCalibration(): CalState {
  const s: CalState = { yawDeg: 0, fovScale: 1, taps: [], residualDeg: NaN };
  saveCalibration(s);
  return s;
}
