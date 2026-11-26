import { describe, expect, it } from 'vitest';
import { globeShadowOnRings, ringOpacity, ringShadowOnGlobe } from './saturn-rings';

describe('Saturn ring lighting', () => {
  it('leaves a transparent inner gap and a darker Cassini Division', () => {
    expect(ringOpacity(1.10)).toBe(0);
    expect(ringOpacity(1.97)).toBeLessThan(ringOpacity(1.76));
    expect(ringOpacity(2.19)).toBeGreaterThan(ringOpacity(1.97));
  });

  it('casts shadows only when the light ray passes through a ring or the globe', () => {
    expect(globeShadowOnRings(1.65, 0, 0, [-1, 0, 0])).toBeLessThan(.25);
    expect(globeShadowOnRings(-1.65, 0, 0, [-1, 0, 0])).toBe(1);
    expect(globeShadowOnRings(1.65, 1.2, 0, [-1, 0, 0])).toBe(1);
    expect(ringShadowOnGlobe(.6, -.8, 0, [.8, .6, 0])).toBeLessThan(.5);
    expect(ringShadowOnGlobe(.6, -.8, 0, [.8, -.6, 0])).toBe(1);
  });
});
