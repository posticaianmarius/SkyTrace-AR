import type { Vec3 } from '@skytrace/shared';

export const SATURN_RING_EDGE = 2.28;
export const SATURN_FLATTENING = .9;
const TILT = .36;
const SIN_TILT = Math.sin(TILT), COS_TILT = Math.cos(TILT);

export function ringOpacity(radius: number): number {
  if(radius < 1.23 || radius > SATURN_RING_EDGE) return 0;
  const bands = .91 + .07 * Math.sin(radius * 286) + .03 * Math.sin(radius * 791);
  if(radius < 1.53) return .24 * bands;
  if(radius < 1.94) return .92 * bands;
  if(radius < 2.01) return .07;
  if(radius > 2.216 && radius < 2.226) return .13;
  return .68 * bands;
}

// Cast a ray from the cloud tops toward the light and intersect the ring plane.
export function ringShadowOnGlobe(x: number, y: number, z: number, light: Vec3): number {
  y *= SATURN_FLATTENING;
  const sunHeight = light[1] * COS_TILT + light[2] * SIN_TILT;
  if(Math.abs(sunHeight) < .001) return 1;
  const t = -(y * COS_TILT + z * SIN_TILT) / sunHeight;
  if(t <= 0) return 1;
  const r = Math.hypot(x + t * light[0], y + t * light[1], z + t * light[2]);
  return 1 - .78 * ringOpacity(r);
}

// Closest point to Saturn along a ray from a ring particle toward the light.
export function globeShadowOnRings(x: number, y: number, z: number, light: Vec3): number {
  y /= SATURN_FLATTENING;
  const lx = light[0], ly = light[1] / SATURN_FLATTENING, lz = light[2];
  const t = -(x * lx + y * ly + z * lz) / (lx * lx + ly * ly + lz * lz);
  if(t <= 0) return 1;
  const distance = Math.hypot(x + t * lx, y + t * ly, z + t * lz);
  const edge = Math.max(0, Math.min(1, (distance - .98) / .05));
  return .15 + .85 * edge * edge * (3 - 2 * edge);
}

export const SATURN_ROLL = -.28;

export function paintSaturnRings(front: HTMLCanvasElement, back: HTMLCanvasElement, r: number, light: Vec3, night: boolean) {
  const width = Math.ceil(2 * SATURN_RING_EDGE * r + 2), height = Math.ceil(2 * SATURN_RING_EDGE * r * SIN_TILT + 2);
  front.width = back.width = width;
  front.height = back.height = height;
  const frontCtx = front.getContext('2d')!, backCtx = back.getContext('2d')!;
  const near = frontCtx.createImageData(width, height), far = backCtx.createImageData(width, height);
  for(let row = 0; row < height; row ++) {
    const side = (row + .5 - height / 2) / (r * SIN_TILT);
    const output = side >= 0 ? near.data : far.data;
    for(let col = 0; col < width; col ++) {
      const x = (col + .5 - width / 2) / r;
      const distance = Math.hypot(x, side);
      const opacity = ringOpacity(distance);
      if(opacity === 0) continue;
      const shade = globeShadowOnRings(x, -side * SIN_TILT, side * COS_TILT, light);
      const color = 229 + 9 * Math.sin(distance * 170) + 8 * Math.sin(distance * 57);
      const i = 4 * (row * width + col);
      output[i] = color * shade;
      output[i + 1] = color * shade * (night ? .43 : .87);
      output[i + 2] = color * shade * (night ? .39 : .70);
      output[i + 3] = 255 * opacity;
    }
  }
  frontCtx.putImageData(near, 0, 0);
  backCtx.putImageData(far, 0, 0);
}
