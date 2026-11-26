import type { CameraModel } from '../camera/projection';
import { projectArtPlane, type ArtPlane } from '../stars/art-projection';

export class ConstellationArt {
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private id = '';
  private image: HTMLImageElement | null = null;
  private revealAt: number | null = null;

  constructor(private element: HTMLElement) {}

  draw(cam: CameraModel, planes?: readonly ArtPlane[]) {
    const current = planes && this.focus(cam, planes);
    if(!current) {
      if(this.id) this.element.style.opacity = '0';
      this.id = '';
      return;
    }
    const { plane, distance } = current;
    if(plane.id !== this.id) {
      this.id = plane.id;
      this.revealAt = null;
      this.image = new Image();
      this.image.src = `${import.meta.env.BASE_URL}constellation-art/${plane.id}.png`;
      this.element.style.width = `${plane.width}px`;
      this.element.style.height = `${plane.height}px`;
      this.element.style.setProperty('--art-image', `url("${this.image.src}")`);
    }
    const projected = this.image?.naturalWidth ? projectArtPlane(cam, plane) : null;
    if(!projected) {
      this.element.style.opacity = '0';
      return;
    }
    const now = performance.now();
    this.revealAt ??= now;
    const reveal = this.reducedMotion.matches ? 1 : Math.min(1, (now - this.revealAt) / 700);
    const strength = Math.min(1, (1 - distance) * 3);
    this.element.style.transform = `matrix3d(${projected.matrix.join(',')})`;
    this.element.style.clipPath = projected.clipPath;
    this.element.style.opacity = String(0.96 * strength * (1 - (1 - reveal) ** 2));
  }

  private focus(cam: CameraModel, planes: readonly ArtPlane[]) {
    let closest: { plane: ArtPlane; distance: number } | undefined;
    let score = 1;
    for(const plane of planes) {
      if(plane.center[2] <= 0) continue;
      const p = cam.project(plane.center);
      if(!p.front) continue;
      const distance = Math.hypot(2 * p.x / cam.W - 1, 2 * p.y / cam.H - 1);
      const rank = distance - (plane.id === this.id ? 0.14 : 0);
      if(distance >= 1 || rank >= score) continue;
      closest = { plane, distance };
      score = rank;
    }
    return closest;
  }
}
