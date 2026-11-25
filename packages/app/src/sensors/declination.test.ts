import { describe, expect, it } from 'vitest';
import { declinationDeg } from './declination';

describe('declinationDeg (WMM2025)', () => {
  const date = new Date('2026-11-25T12:00:00Z');
  it('Bucharest is about +6.4 deg (east)', () => {
    expect(declinationDeg(44.4268, 26.1025, date)).toBeCloseTo(6.4, 0);
  });
  it('London is about +1 deg', () => {
    const d = declinationDeg(51.47, -0.45, date);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(2.5);
  });
  it('New York is west (negative), around -12.5 deg', () => {
    expect(declinationDeg(40.71, -74.0, date)).toBeLessThan(-11);
  });
});
