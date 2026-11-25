/**
 * Phone orientation -> device-to-world rotation (ENU), smoothed.
 *
 * Sources, in order of preference:
 *  - Android Chrome: `deviceorientationabsolute` (alpha referenced to magnetic north)
 *  - iOS Safari: `deviceorientation` + `webkitCompassHeading` (needs a permission tap)
 *  - Anything else / desktop: simulated orientation driven by mouse/touch drag
 */
import { deltaDeg, normalizeDeg } from '@skytrace/shared';
import { deviceToWorld, matFromQuat, nlerp, quatFromMat, type Mat3, type Quat } from '../math/mat3';

export type OrientationMode = 'absolute' | 'ios-compass' | 'relative' | 'simulated';

interface IosOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

interface PermissionCapable {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export class Orientation {
  mode: OrientationMode = 'simulated';
  /** Smoothed device -> world rotation. */
  private q: Quat = quatFromMat(deviceToWorld(0, 90, 0));
  private target: Quat = this.q;
  private iosOffset: number | null = null;
  lastEventMs = 0;
  /** Compass accuracy in degrees when the platform reports it (iOS). */
  accuracyDeg: number | null = null;

  /** Simulated view direction (desktop). */
  simAz = 180;
  simEl = 35;

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
      window.addEventListener('deviceorientationabsolute', (e) => this.onEvent(e as DeviceOrientationEvent, true));
    }
    window.addEventListener('deviceorientation', (e) => this.onEvent(e, false));

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

  private onEvent(e: DeviceOrientationEvent, isAbsoluteEvent: boolean) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const ios = e as IosOrientationEvent;
    let alpha = e.alpha;

    if (isAbsoluteEvent || (e.absolute && this.mode !== 'ios-compass')) {
      this.mode = 'absolute';
    } else if (ios.webkitCompassHeading != null) {
      // iOS: alpha is relative to an arbitrary start; webkitCompassHeading is clockwise
      // from magnetic north. Track a smoothed offset between the two.
      const wanted = normalizeDeg(360 - ios.webkitCompassHeading - alpha);
      this.iosOffset =
        this.iosOffset == null ? wanted : normalizeDeg(this.iosOffset + deltaDeg(wanted, this.iosOffset) * 0.05);
      alpha = normalizeDeg(alpha + this.iosOffset);
      this.mode = 'ios-compass';
      this.accuracyDeg = ios.webkitCompassAccuracy ?? null;
    } else if (this.mode !== 'absolute') {
      this.mode = 'relative'; // no north reference; calibration must fix yaw
    } else {
      return; // ignore relative events once absolute ones are flowing
    }

    this.lastEventMs = performance.now();
    this.target = quatFromMat(deviceToWorld(alpha, e.beta, e.gamma));
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
      this.updateSim();
    });
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'simulated') return;
      const step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft') this.simAz = normalizeDeg(this.simAz - step);
      else if (e.key === 'ArrowRight') this.simAz = normalizeDeg(this.simAz + step);
      else if (e.key === 'ArrowUp') this.simEl = Math.min(90, this.simEl + step);
      else if (e.key === 'ArrowDown') this.simEl = Math.max(-30, this.simEl - step);
      else return;
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
    if (this.mode !== 'simulated') this.q = nlerp(this.q, this.target, 0.25);
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
