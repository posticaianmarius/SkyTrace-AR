import { angleBetweenDeg, azElToEnu } from '@skytrace/shared';
import { describe, expect, it } from 'vitest';
import { TrackMotion } from './track-motion';

describe('TrackMotion', () => {
  it('leaves normal motion untouched and blends a correction over the running track', () => {
    const track = new TrackMotion();
    const at = (azimuth: number) => azElToEnu(azimuth, 24);
    expect(track.sample('plane', 1, at(0), 0, 400, false).opacity).toBeCloseTo(.42);
    const steady = at(1);
    expect(track.sample('plane', 1, steady, 100, 400, false).dir).toBe(steady);

    expect(angleBetweenDeg(track.sample('plane', 2, at(6), 200, 400, false).dir, at(2))).toBeLessThan(.01);
    const halfway = track.sample('plane', 2, at(8), 400, 400, false);
    expect(angleBetweenDeg(halfway.dir, at(6))).toBeLessThan(.06);
    expect(halfway.opacity).toBe(1);

    const settled = at(10);
    expect(track.sample('plane', 2, settled, 600, 400, false).dir).toBe(settled);
  });

  it('takes large relocations immediately and skips the acquisition fade in reduced motion', () => {
    const track = new TrackMotion();
    expect(track.sample('sat', 1, azElToEnu(30, 24), 0, 360, true).opacity).toBe(1);
    const relocated = azElToEnu(90, 24);
    expect(track.sample('sat', 2, relocated, 120, 360, true).dir).toBe(relocated);
  });
});
