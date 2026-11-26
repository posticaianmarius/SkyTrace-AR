/**
 * Phone orientation -> device-to-world rotation (ENU), smoothed.
 *
 * Motion comes from the gyro-based RELATIVE orientation (`deviceorientation`):
 * smooth and instant, but its `alpha` has an arbitrary zero. North comes from the
 * compass and is kept as ONE number, an alpha offset:
 *
 *   alpha_true = alpha_relative + offset
 *   iOS:      offset sample = 360 - (webkitCompassHeading + declination) - alpha
 *   Android:  offset sample = (alpha_absolute - declination) - alpha_relative
 *
 * The offset is NOT updated on every event (that made the sky wobble and drag
 * along while turning). Before the first lock it behaves like the earlier
 * version (smoothed, always updating) so north is never missing; after that the
 * compass is only listened to once the phone has been really still for a while
 * (hand tremor doesn't count as moving), with a dead band against noise. After
 * the user calibrates on a real object, the compass is ignored (gyro only).
 *
 * Fallbacks: absolute-only (some Android browsers), relative-only (no compass),
 * simulated (desktop: drag to look around).
 */
import { deltaDeg, normalizeDeg } from '@skytrace/shared';
import { deviceToWorld, matFromQuat, nlerp, quatFromMat, type Mat3, type Quat } from '../math/mat3';
import { CompassFusion, StillnessDetector, cameraElevation, type CompassState } from './compassFusion';

export type OrientationMode = 'fused' | 'absolute' | 'relative' | 'simulated';

interface IosOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

interface PermissionCapable {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/** iOS compass accuracy (deg) above which readings are ignored. */
const MAX_ACCURACY_DEG = 25;
/** If no good compass reading arrives for this long, accept poor ones rather than having no north. */
const ACCEPT_POOR_AFTER_MS = 4000;
/**
 * Compass readings are used only after the phone has been still this long:
 * compasses (iOS especially) keep catching up for about a second after a turn.
 * Shorter before the first lock so north is found quickly.
 */
const SETTLE_MS = 1500;
const SETTLE_FIRST_LOCK_MS = 300;

export class Orientation {
  mode: OrientationMode = 'simulated';
  /** Smoothed device -> world rotation. */
  private q: Quat = quatFromMat(deviceToWorld(0, 90, 0));
  private target: Quat = this.q;
  lastEventMs = 0;
  /** Compass accuracy in degrees when the platform reports it (iOS). */
  accuracyDeg: number | null = null;
  /**
   * Magnetic declination at the user's location (deg, east positive). Phone
   * compasses point to MAGNETIC north; true heading = magnetic + declination.
   */
  declinationDeg = 0;
  /** Latest raw values, for the ?debug=1 readout. */
  debug = { heading: NaN, alpha: NaN, camEl: NaN, accepted: false, still: false };

  private fusion = new CompassFusion();
  private stillness = new StillnessDetector();
  /** Prior-version behaviour, used only until the first lock: always-updating smoothed offset. */
  private provisional: number | null = null;
  private rel: { alpha: number; beta: number; gamma: number; t: number } | null = null;
  private sawRelative = false;
  private sawAbsolute = false;
  private sawHeading = false;
  private firstHeadingT: number | null = null;
  private lastGoodCompassT: number | null = null;

  /** Simulated view direction (desktop). Planes are usually low, so start near the horizon. */
  simAz = 180;
  simEl = 10;
  /** True once the user has dragged or used the keys (stops auto-aiming). */
  simTouched = false;

  /** Must be called from a user gesture (iOS permission). */
  async start(): Promise<OrientationMode> {
    const DOE = (globalThis as { DeviceOrientationEvent?: PermissionCapable }).DeviceOrientationEvent;
    if (DOE?.requestPermission) {
      try {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return this.useSimulated();
      } catch {
        return this.useSimulated();
      }
    }
    const DME = (globalThis as { DeviceMotionEvent?: PermissionCapable }).DeviceMotionEvent;
    if (DME?.requestPermission) DME.requestPermission().catch(() => undefined);

    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', (e) => this.onAbsolute(e as DeviceOrientationEvent));
    }
    window.addEventListener('deviceorientation', (e) => (e.absolute ? this.onAbsolute(e) : this.onRelative(e)));

    // If no real event arrives quickly, we are on a desktop: simulate.
    await new Promise((r) => setTimeout(r, 1200));
    if (this.lastEventMs === 0) return this.useSimulated();
    return this.mode;
  }

  private useSimulated(): OrientationMode {
    this.mode = 'simulated';
    this.updateSim();
    return this.mode;
  }

  private refreshMode() {
    if (this.sawRelative) this.mode = this.sawHeading || this.sawAbsolute ? 'fused' : 'relative';
    else if (this.sawAbsolute) this.mode = 'absolute';
  }

  /** Still long enough that the compass has caught up with the phone. */
  private settled(t: number): boolean {
    return this.stillness.stillFor(t, this.fusion.offset == null ? SETTLE_FIRST_LOCK_MS : SETTLE_MS);
  }

  /** One compass reading of the alpha offset. */
  private compassSample(t: number, sample: number, usable: boolean) {
    const v = normalizeDeg(sample);
    // Prior-version path, only until the first lock: always on, lightly smoothed.
    this.provisional = this.provisional == null ? v : normalizeDeg(this.provisional + deltaDeg(v, this.provisional) * 0.05);
    const still = this.settled(t);
    const accepted = usable && still;
    if (accepted) this.fusion.add(t, v);
    this.debug.accepted = accepted;
    this.debug.still = still;
  }

  /** Gyro-based orientation (arbitrary north). On iOS it also carries the compass heading. */
  private onRelative(e: DeviceOrientationEvent) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const t = performance.now();
    this.rel = { alpha: e.alpha, beta: e.beta, gamma: e.gamma, t };
    this.stillness.add(t, quatFromMat(deviceToWorld(e.alpha, e.beta, e.gamma)));
    this.sawRelative = true;
    this.lastEventMs = t;

    const ios = e as IosOrientationEvent;
    if (ios.webkitCompassHeading != null && ios.webkitCompassHeading >= 0) {
      this.sawHeading = true;
      this.firstHeadingT ??= t;
      const acc = ios.webkitCompassAccuracy;
      this.accuracyDeg = acc ?? null;
      const accurate = acc == null || (acc >= 0 && acc <= MAX_ACCURACY_DEG);
      if (accurate) this.lastGoodCompassT = t;
      const desperate = this.fusion.offset == null && t - this.firstHeadingT > ACCEPT_POOR_AFTER_MS;
      const trueHeading = ios.webkitCompassHeading + this.declinationDeg;
      this.compassSample(t, 360 - trueHeading - e.alpha, accurate || desperate);
      this.debug.heading = ios.webkitCompassHeading;
    }
    this.debug.alpha = e.alpha;
    this.debug.camEl = cameraElevation(deviceToWorld(e.alpha, e.beta, e.gamma));
    this.refreshMode();
    this.updateTarget();
  }

  /** Absolute (magnetic-north-referenced) orientation, e.g. Android Chrome. */
  private onAbsolute(e: DeviceOrientationEvent) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const t = performance.now();
    this.sawAbsolute = true;
    this.lastEventMs = t;
    this.lastGoodCompassT = t;
    // alpha is counter-clockwise, so true north = magnetic alpha - declination
    const alphaTrue = e.alpha - this.declinationDeg;

    if (this.sawRelative && this.rel && t - this.rel.t < 200) {
      // Same pose in both frames (beta/gamma match), so the alphas differ only by the offset.
      this.compassSample(t, alphaTrue - this.rel.alpha, true);
      this.refreshMode();
      this.updateTarget();
    } else if (!this.sawRelative) {
      // No gyro-relative stream: use the absolute orientation directly (smoothed in rotation()).
      this.refreshMode();
      this.target = quatFromMat(deviceToWorld(alphaTrue, e.beta, e.gamma));
    }
  }

  private updateTarget() {
    if (!this.rel) return;
    const off = this.fusion.current() ?? this.provisional ?? 0;
    this.target = quatFromMat(deviceToWorld(this.rel.alpha + off, this.rel.beta, this.rel.gamma));
  }

  /** Set the local magnetic declination (deg, east positive). */
  setDeclination(deg: number) {
    // alpha runs counter-clockwise: more east declination = smaller alpha offset
    const shift = -(deg - this.declinationDeg);
    this.fusion.shift(shift);
    if (this.provisional != null) this.provisional = normalizeDeg(this.provisional + shift);
    this.declinationDeg = deg;
    this.updateTarget();
  }

  /** Stop (true) or resume (false) following the compass; used after calibration. */
  setCompassFrozen(frozen: boolean) {
    if (frozen && this.fusion.offset == null) this.fusion.offset = this.fusion.current() ?? this.provisional ?? 0;
    this.fusion.frozen = frozen;
  }

  /** Current alpha offset (deg), if known. */
  get compassOffset(): number | null {
    return this.fusion.current() ?? this.provisional;
  }

  get compassState(): CompassState {
    if (this.mode === 'absolute') return 'locked';
    return this.fusion.state;
  }

  /** True when the compass has reported poor accuracy for a while (suggest a figure-8). */
  get compassPoor(): boolean {
    if (!this.sawHeading || this.fusion.frozen) return false;
    const since = this.lastGoodCompassT ?? this.firstHeadingT ?? performance.now();
    return performance.now() - since > 3000;
  }

  /** Desktop: drag to look around. */
  attachSimControls(el: HTMLElement, getFovDeg: () => number) {
    let dragging: { x: number; y: number } | null = null;
    el.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'simulated') return;
      dragging = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => (dragging = null));
    window.addEventListener('pointermove', (e) => {
      if (!dragging || this.mode !== 'simulated') return;
      const degPerPx = getFovDeg() / Math.max(window.innerWidth, window.innerHeight);
      this.simAz = normalizeDeg(this.simAz - (e.clientX - dragging.x) * degPerPx);
      this.simEl = Math.max(-30, Math.min(90, this.simEl + (e.clientY - dragging.y) * degPerPx));
      dragging = { x: e.clientX, y: e.clientY };
      this.simTouched = true;
      this.updateSim();
    });
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'simulated') return;
      if(e.target instanceof HTMLElement && e.target.closest('button, input, select, summary')) return;
      const step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft') this.simAz = normalizeDeg(this.simAz - step);
      else if (e.key === 'ArrowRight') this.simAz = normalizeDeg(this.simAz + step);
      else if (e.key === 'ArrowUp') this.simEl = Math.min(90, this.simEl + step);
      else if (e.key === 'ArrowDown') this.simEl = Math.max(-30, this.simEl - step);
      else return;
      this.simTouched = true;
      this.updateSim();
    });
  }

  lookAt(azDeg: number, elDeg: number) {
    this.simAz = normalizeDeg(azDeg);
    this.simEl = Math.max(-30, Math.min(90, elDeg));
    this.updateSim();
  }

  private updateSim() {
    // alpha = -azimuth, beta = 90 + elevation (see mat3.test.ts)
    this.target = quatFromMat(deviceToWorld(-this.simAz, 90 + this.simEl, 0));
    this.q = this.target;
  }

  /** Call once per frame. Returns the smoothed device -> world rotation. */
  rotation(): Mat3 {
    // The gyro stream is already smooth, so follow it closely; absolute-only streams are noisier.
    if (this.mode !== 'simulated') this.q = nlerp(this.q, this.target, this.mode === 'absolute' ? 0.25 : 0.5);
    return matFromQuat(this.q);
  }

  get quat(): Quat {
    return this.q;
  }
}

export function screenAngle(): number {
  const a = screen.orientation?.angle ?? (window as { orientation?: number }).orientation ?? 0;
  return normalizeDeg(a);
}
