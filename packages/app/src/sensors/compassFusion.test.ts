import { describe, expect, it } from 'vitest';
import { deltaDeg } from '@skytrace/shared';
import { deviceToWorld, quatFromMat } from '../math/mat3';
import { CompassFusion, StillnessDetector, cameraElevation, circularMean } from './compassFusion';

/** Feed `n` samples at `hz`, starting at t0, with values from fn(i). */
function feed(f: CompassFusion, t0: number, n: number, hz: number, fn: (i: number) => number) {
  let t = t0;
  for (let i = 0; i < n; i++) {
    t = t0 + (i * 1000) / hz;
    f.add(t, fn(i));
  }
  return t;
}

describe('CompassFusion', () => {
  it('settles to the mean of the warm-up samples, even across 0/360', () => {
    const f = new CompassFusion();
    expect(f.state).toBe('none');
    feed(f, 0, 40, 60, (i) => (i % 2 ? 358 : 2));
    expect(f.state).toBe('locked');
    expect(Math.abs(deltaDeg(f.offset!, 0))).toBeLessThan(0.2);
  });

  it('dead band: compass noise under 2 deg never moves the locked offset', () => {
    const f = new CompassFusion();
    const t = feed(f, 0, 40, 60, () => 100);
    const locked = f.offset!;
    feed(f, t + 16, 600, 60, (i) => 100 + 1.8 * Math.sin(i * 0.7));
    expect(f.offset).toBe(locked);
  });

  it('large jitter barely moves the locked offset', () => {
    const f = new CompassFusion();
    const t = feed(f, 0, 40, 60, () => 100);
    feed(f, t + 16, 300, 60, (i) => 100 + (i % 2 ? 8 : -8) * Math.sin(i));
    expect(Math.abs(deltaDeg(f.offset!, 100))).toBeLessThan(1);
  });

  it('follows a slow real change at no more than ~1 deg/s', () => {
    const f = new CompassFusion();
    const t = feed(f, 0, 40, 60, () => 50);
    feed(f, t + 16, 120, 60, () => 60); // 2 s of a 10 deg change
    const moved = deltaDeg(f.offset!, 50);
    expect(moved).toBeGreaterThan(0.1);
    expect(moved).toBeLessThan(2.2);
  });

  it('re-locks after a large disagreement persists for 3 s', () => {
    const f = new CompassFusion();
    const t = feed(f, 0, 40, 60, () => 10);
    feed(f, t + 16, 60 * 8, 60, () => 90);
    expect(Math.abs(deltaDeg(f.offset!, 90))).toBeLessThan(10);
  });

  it('ignores the compass when frozen', () => {
    const f = new CompassFusion();
    const t = feed(f, 0, 40, 60, () => 10);
    f.frozen = true;
    feed(f, t + 16, 600, 60, () => 90);
    expect(f.offset).toBeCloseTo(10, 6);
    expect(f.state).toBe('frozen');
  });

  it('circularMean handles wrap-around', () => {
    expect(Math.abs(deltaDeg(circularMean([350, 10]), 0))).toBeLessThan(1e-9);
  });
});

describe('StillnessDetector', () => {
  const q = (alpha: number, beta = 90, gamma = 0) => quatFromMat(deviceToWorld(alpha, beta, gamma));

  it('hand tremor (0.4 deg at 9 Hz) counts as still', () => {
    const s = new StillnessDetector();
    for (let i = 0; i <= 180; i++) {
      const t = (i * 1000) / 60;
      const w = 0.4 * Math.sin(2 * Math.PI * 9 * (t / 1000));
      s.add(t, q(30 + w, 90 + w, w));
    }
    expect(s.stillFor(3000, 1500)).toBe(true);
  });

  it('a real turn counts as moving, and stillness returns after it ends', () => {
    const s = new StillnessDetector();
    let t = 0;
    for (let i = 0; i <= 60; i++) {
      t = (i * 1000) / 60;
      s.add(t, q(30 + i)); // 60 deg/s turn for 1 s
    }
    expect(s.stillFor(t, 300)).toBe(false);
    for (let i = 1; i <= 120; i++) s.add(t + (i * 1000) / 60, q(90));
    expect(s.stillFor(t + 2000, 1000)).toBe(true);
  });

  it('cameraElevation', () => {
    expect(cameraElevation(deviceToWorld(0, 120, 0))).toBeCloseTo(30, 6);
    expect(cameraElevation(deviceToWorld(0, 0, 0))).toBeCloseTo(-90, 6);
  });
});
