import type { Vec3 } from '@skytrace/shared';

export type SkyKind = 'aircraft' | 'sat' | 'body';

/** Anything we can label in the sky, already converted to the observer's view. */
export interface SkyObject {
  kind: SkyKind;
  id: string;
  label: string;
  sub: string;
  /** Apparent direction (unit ENU, refraction applied). */
  dir: Vec3;
  azDeg: number;
  elDeg: number;
  rangeKm: number;
  /** Higher = drawn first and kept when labels collide. */
  priority: number;
  /** Visible to the naked eye right now (sats: sunlit + dark sky; bodies: always). */
  visible: boolean;
}

export type SkyReference = Pick<SkyObject, 'id' | 'label' | 'dir' | 'azDeg' | 'elDeg'> & { kind: SkyKind | 'star' };

/** Messages to/from the SGP4 worker. */
export type SatWorkerIn =
  | { type: 'tles'; sats: Array<{ name: string; line1: string; line2: string }> }
  | { type: 'observer'; lat: number; lon: number; altM: number };

export interface SatState {
  name: string;
  norad: number;
  /** Unit ENU direction at t0 and t1. */
  d0: Vec3;
  d1: Vec3;
  rangeKm: number;
  altKm: number;
  sunlit: boolean;
}

export interface SatWorkerOut {
  type: 'states';
  t0: number;
  t1: number;
  sats: SatState[];
  total: number;
}
