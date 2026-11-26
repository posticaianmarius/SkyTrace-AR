import type { CameraModel } from '../camera/projection';
import { easeOut, progress } from '../math/motion';
import { projectArtPlane, type ArtPlane } from '../stars/art-projection';

export class ConstellationArt {
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private current: { plane: ArtPlane; image: HTMLImageElement; revealAt: number | null; opacity: number } | null = null;
  private outgoing: { plane: ArtPlane; opacity: number; start: number } | null = null;

  constructor(private element: HTMLElement, private exitLayer: HTMLElement) {}

  draw(cam: CameraModel, planes: readonly ArtPlane[] | undefined, now: number) {
    const focus = planes && this.focus(cam, planes);
    const reduce = this.reducedMotion.matches;
    if(focus?.plane.id !== this.current?.plane.id) {
      if(this.current?.opacity && !reduce) {
        const { plane, opacity } = this.current;
        this.outgoing = { plane, opacity, start: now };
        this.exitLayer.style.cssText = this.element.style.cssText;
      }
      this.element.style.opacity = '0';
      this.current = null;
      if(focus) {
        const { plane } = focus, image = new Image();
        image.src = `${import.meta.env.BASE_URL}constellation-art/${plane.id}.png`;
        this.current = { plane, image, revealAt: null, opacity: 0 };
        this.element.style.width = `${plane.width}px`;
        this.element.style.height = `${plane.height}px`;
        this.element.style.setProperty('--art-image', `url("${image.src}")`);
      }
    }
    if(this.outgoing) {
      const { plane, opacity, start } = this.outgoing;
      const fade = reduce ? 1 : progress(now, start, 220);
      this.paint(this.exitLayer, cam, plane, opacity * (1 - fade));
      if(fade === 1) this.outgoing = null;
    }
    if(!this.current || !focus || !this.current.image.naturalWidth) return;
    this.current.plane = focus.plane;
    this.current.revealAt ??= now;
    const reveal = reduce ? 1 : easeOut(progress(now, this.current.revealAt, 420));
    const strength = Math.min(1, (1 - focus.distance) * 3);
    this.current.opacity = this.paint(this.element, cam, focus.plane, .96 * strength * reveal);
  }

  private paint(layer: HTMLElement, cam: CameraModel, plane: ArtPlane, opacity: number) {
    const projected = opacity > 0 ? projectArtPlane(cam, plane) : null;
    if(!projected) {
      layer.style.opacity = '0';
      return 0;
    }
    layer.style.transform = `matrix3d(${projected.matrix.join(',')})`;
    layer.style.clipPath = projected.clipPath;
    layer.style.opacity = String(opacity);
    return opacity;
  }

  private focus(cam: CameraModel, planes: readonly ArtPlane[]) {
    let closest: { plane: ArtPlane; distance: number } | undefined;
    let score = 1;
    for(const plane of planes) {
      if(plane.center[2] <= 0) continue;
      const p = cam.project(plane.center);
      if(!p.front) continue;
      const distance = Math.hypot(2 * p.x / cam.W - 1, 2 * p.y / cam.H - 1);
      const rank = distance - (plane.id === this.current?.plane.id ? 0.14 : 0);
      if(distance >= 1 || rank >= score) continue;
      closest = { plane, distance };
      score = rank;
    }
    return closest;
  }
}
