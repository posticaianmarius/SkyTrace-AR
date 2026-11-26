import type { Vec3 } from '@skytrace/shared';
import type { CameraModel } from '../camera/projection';
import { apply } from '../math/mat3';

// Facing the lit limb in screen coordinates, even when the Sun is behind the camera.
export function phaseBearing(cam: CameraModel, view: Vec3, sun: Vec3): number {
  const [x, y, z] = apply(cam.M, view);
  const [sx, sy, sz] = apply(cam.M, sun);
  return Math.atan2(sy * z - y * sz, x * sz - sx * z);
}

export function disk(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 2 * Math.PI);
}

export function globeGradient(ctx: CanvasRenderingContext2D, r: number, light: string, middle: string, edge: string) {
  const gradient = ctx.createRadialGradient(-r * .3, -r * .36, 0, 0, 0, r * 1.13);
  gradient.addColorStop(0, light);
  gradient.addColorStop(.58, middle);
  gradient.addColorStop(1, edge);
  return gradient;
}

export function drawSunHalo(ctx: CanvasRenderingContext2D, r: number, color: string) {
  const halo = ctx.createRadialGradient(0, 0, r * .85, 0, 0, r * 1.55);
  halo.addColorStop(0, `${color}aa`);
  halo.addColorStop(.24, `${color}58`);
  halo.addColorStop(1, `${color}00`);
  ctx.fillStyle = halo;
  disk(ctx, r * 1.55);
  ctx.fill();
}

const RINGS = [[1.28, .13, .36], [1.51, .25, .77], [1.82, .17, .68], [1.96, .05, .31]] as const;

export function drawRingHalf(ctx: CanvasRenderingContext2D, radius: number, tilt: number, color: string, front: boolean) {
  const start = front === (tilt >= 0) ? 0 : Math.PI;
  const alpha = ctx.globalAlpha;
  const opening = Math.abs(Math.sin(tilt));
  ctx.strokeStyle = color;
  for(const [size, width, strength] of RINGS) {
    const r = radius * size;
    ctx.globalAlpha = alpha * strength * (front ? 1 : .76);
    ctx.lineWidth = Math.max(.5, radius * width * (.36 + opening));
    ctx.beginPath();
    ctx.ellipse(0, 0, r, Math.max(.35, r * opening), 0, start, start + Math.PI);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
}
