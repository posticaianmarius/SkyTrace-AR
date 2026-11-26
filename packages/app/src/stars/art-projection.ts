import type { Vec3 } from '@skytrace/shared';
import type { CameraModel } from '../camera/projection';
import { apply } from '../math/mat3';

interface Anchor { x: number; y: number; dir: Vec3 }
type Point = [number, number];

export interface ArtPlane {
  id: string;
  width: number;
  height: number;
  origin: Vec3;
  right: Vec3;
  down: Vec3;
  center: Vec3;
}

export function makeArtPlane(id: string, width: number, height: number, [a, b, c]: [Anchor, Anchor, Anchor]): ArtPlane {
  const abX = b.x - a.x, abY = b.y - a.y, acX = c.x - a.x, acY = c.y - a.y;
  const det = abX * acY - acX * abY;
  const right: Vec3 = [0, 0, 0], down: Vec3 = [0, 0, 0], origin: Vec3 = [0, 0, 0], center: Vec3 = [0, 0, 0];
  for(const i of [0, 1, 2] as const) {
    const ab = b.dir[i] - a.dir[i], ac = c.dir[i] - a.dir[i];
    right[i] = (ab * acY - ac * abY) / det;
    down[i] = (ac * abX - ab * acX) / det;
    origin[i] = a.dir[i] - a.x * right[i] - a.y * down[i];
    center[i] = origin[i] + width / 2 * right[i] + height / 2 * down[i];
  }
  return { id, width, height, origin, right, down, center };
}

function clipPolygon(polygon: Point[], distance: (u: number, v: number) => number): Point[] {
  const clipped: Point[] = [];
  for(const [i, end] of polygon.entries()) {
    const start = polygon[(i + polygon.length - 1) % polygon.length]!;
    const a = distance(...start), b = distance(...end);
    if((a >= 0) !== (b >= 0)) {
      const t = a / (a - b);
      clipped.push([start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1])]);
    }
    if(b >= 0) clipped.push(end);
  }
  return clipped;
}

/** CSS matrix keeps the per-pixel perspective divide, including when the camera pans or rolls. */
export function projectArtPlane(cam: CameraModel, plane: ArtPlane) {
  const { width: w, height: h } = plane;
  const origin = apply(cam.M, plane.origin), right = apply(cam.M, plane.right), down = apply(cam.M, plane.down);
  const quad: Point[] = [[0, 0], [w, 0], [w, h], [0, h]];
  const above = clipPolygon(quad, (u, v) => plane.origin[2] + u * plane.right[2] + v * plane.down[2]);
  const visible = clipPolygon(above, (u, v) => -origin[2] - u * right[2] - v * down[2] - 0.01);
  if(visible.length < 3) return null;
  const x = ([x, , z]: Vec3) => cam.F * x - cam.W / 2 * z;
  const y = ([, y, z]: Vec3) => -cam.F * y - cam.H / 2 * z;
  const matrix = [x(right), y(right), 0, -right[2], x(down), y(down), 0, -down[2], 0, 0, 1, 0, x(origin), y(origin), 0, -origin[2]];
  const clipPath = visible.every((p, i) => p === quad[i]) ? 'none' : `polygon(${visible.map(([u, v]) => `${u}px ${v}px`).join(', ')})`;
  return { matrix, clipPath };
}
