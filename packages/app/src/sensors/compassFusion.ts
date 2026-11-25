/**
 * Gyro + compass fusion for heading.
 *
 * The gyro-based orientation is smooth and instant but its north is arbitrary.
 * The compass knows north but lags while turning and jitters when still.
 * So: the gyro drives all motion, and the compass only maintains ONE slowly
 * changing number, the offset between the gyro's north and true north.
 *
 * Rules:
 *  - The caller only feeds samples taken while the phone has been held still
 *    for a while (see StillnessDetector) and the compass reports good accuracy.
 *  - Warm-up: the first samples are averaged, then the offset is locked.
 *  - Dead band: once locked, disagreements under DEAD_BAND_DEG are ignored, so
 *    the sky can't creep or wobble with compass noise.
 *  - Bigger disagreements are followed slowly (rate-limited). A large one that
 *    persists (> JUMP_DEG for JUMP_AFTER_MS) re-locks at once (bad first lock).
 *  - Frozen (after the user calibrates on a real object): compass ignored.
 */
import { DEG, RAD, deltaDeg, normalizeDeg } from '@skytrace/shared';
import { quatAngleDeg, type Mat3, type Quat } from '../math/mat3';

const WARMUP_SAMPLES = 12;
const WARMUP_MIN_SPAN_MS = 500;
const EMA_TAU_MS = 3000;
const DEAD_BAND_DEG = 2;
const MAX_FOLLOW_DEG_PER_S = 1;
const JUMP_DEG = 15;
const JUMP_AFTER_MS = 3000;

export type CompassState = 'none' | 'settling' | 'locked' | 'frozen';

export class CompassFusion {
  /** Locked offset (deg), or null before warm-up completes. */
  offset: number | null = null;
  frozen = false;
  private warm: Array<{ t: number; v: number }> = [];
  private ema: number | null = null;
  private lastT: number | null = null;
  private farSince: number | null = null;
  /** Raw samples from the last second (used when re-locking). */
  private recent: Array<{ t: number; v: number }> = [];

  get state(): CompassState {
    if (this.frozen) return 'frozen';
    if (this.offset != null) return 'locked';
    return this.warm.length ? 'settling' : 'none';
  }

  /** Locked value, or a provisional mean while settling, or null. */
  current(): number | null {
    if (this.offset != null) return this.offset;
    return this.warm.length ? circularMean(this.warm.map((s) => s.v)) : null;
  }

  /** Add one good sample of the offset, taken while the phone was still. */
  add(tMs: number, sampleDeg: number) {
    if (this.frozen) return;
    const v = normalizeDeg(sampleDeg);

    if (this.offset == null) {
      this.warm.push({ t: tMs, v });
      if (this.warm.length > 60) this.warm.shift();
      const span = tMs - this.warm[0]!.t;
      if (this.warm.length >= WARMUP_SAMPLES && span >= WARMUP_MIN_SPAN_MS) {
        this.offset = circularMean(this.warm.map((s) => s.v));
        this.ema = this.offset;
        this.lastT = tMs;
      }
      return;
    }

    const dt = Math.max(0, Math.min(1000, tMs - (this.lastT ?? tMs)));
    this.lastT = tMs;
    this.recent.push({ t: tMs, v });
    while (this.recent.length && tMs - this.recent[0]!.t > 1000) this.recent.shift();
    const ema = this.ema ?? v;
    this.ema = normalizeDeg(ema + deltaDeg(v, ema) * (1 - Math.exp(-dt / EMA_TAU_MS)));

    const diff = deltaDeg(this.ema, this.offset);
    if (Math.abs(diff) > JUMP_DEG) {
      this.farSince ??= tMs;
      if (tMs - this.farSince >= JUMP_AFTER_MS) {
        // The compass has disagreed for a while: trust its latest readings.
        this.offset = circularMean(this.recent.map((s) => s.v));
        this.ema = this.offset;
        this.farSince = null;
      }
      return;
    }
    this.farSince = null;
    if (Math.abs(diff) <= DEAD_BAND_DEG) return; // noise: don't move at all
    const excess = diff - Math.sign(diff) * DEAD_BAND_DEG;
    const maxStep = (MAX_FOLLOW_DEG_PER_S * dt) / 1000;
    this.offset = normalizeDeg(this.offset + Math.max(-maxStep, Math.min(maxStep, excess)));
  }

  /** Shift every stored value by `deltaDeg` (e.g. the magnetic declination changed). */
  shift(deltaDeg: number) {
    if (this.frozen || deltaDeg === 0) return;
    const s = (v: number) => normalizeDeg(v + deltaDeg);
    if (this.offset != null) this.offset = s(this.offset);
    if (this.ema != null) this.ema = s(this.ema);
    this.warm = this.warm.map((w) => ({ t: w.t, v: s(w.v) }));
    this.recent = this.recent.map((w) => ({ t: w.t, v: s(w.v) }));
  }
}

/**
 * "Has the phone really moved?" Judged by how far the orientation got over the
 * last WINDOW_MS, not by instantaneous speed: hand tremor is fast but goes
 * nowhere (it oscillates around one spot), so it doesn't count; a real turn
 * does.
 */
export class StillnessDetector {
  static WINDOW_MS = 500;
  static MOVE_DEG = 3;
  private hist: Array<{ t: number; q: Quat }> = [];
  /** Last time the phone moved more than MOVE_DEG within WINDOW_MS. */
  lastMovingT = -Infinity;

  add(tMs: number, q: Quat) {
    this.hist.push({ t: tMs, q });
    while (this.hist.length > 2 && tMs - this.hist[1]!.t > StillnessDetector.WINDOW_MS) this.hist.shift();
    const oldest = this.hist[0]!;
    if (quatAngleDeg(oldest.q, q) > StillnessDetector.MOVE_DEG) this.lastMovingT = tMs;
  }

  /** Still for at least `ms`? */
  stillFor(tMs: number, ms: number): boolean {
    return this.hist.length > 1 && tMs - this.lastMovingT >= ms;
  }
}

export function circularMean(values: number[]): number {
  let sx = 0;
  let sy = 0;
  for (const v of values) {
    sx += Math.cos(v * DEG);
    sy += Math.sin(v * DEG);
  }
  return normalizeDeg(Math.atan2(sy, sx) * RAD);
}

/** Elevation of the back camera direction (device -z), degrees. */
export function cameraElevation(R: Mat3): number {
  return Math.asin(Math.max(-1, Math.min(1, -R[8]))) * RAD;
}
