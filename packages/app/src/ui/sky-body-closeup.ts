import type { Vec3 } from '@skytrace/shared';
import type { CameraModel } from '../camera/projection';
import type { SkyObject } from '../types';
import { phaseBearing } from './body-appearance';
import { BodyModelRenderer, type ModelSymbol } from './body-model-renderer';
import { SATURN_RING_EDGE } from './saturn-rings';

export const CLOSEUP_START_ZOOM = 3.5;
export const BODY_FOCUS_ZOOM = 24;

interface BodyImage { canvas: HTMLCanvasElement; renderer: BodyModelRenderer; renderKey: string }

export class SkyBodyCloseup {
  private readonly images = new Map<ModelSymbol, BodyImage>();

  draw(ctx: CanvasRenderingContext2D, cam: CameraModel, o: Extract<SkyObject, { kind: 'body' }>, symbol: ModelSymbol, x: number, y: number, night: boolean, blend: number, glowScale: number): number {
    let image = this.images.get(symbol);
    if(!image) {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 580;
      const renderer = new BodyModelRenderer(canvas, symbol);
      const entry = { canvas, renderer, renderKey: '' };
      this.images.set(symbol, entry);
      void renderer.loadTexture().then((loaded) => { if(loaded) entry.renderKey = ''; });
      image = entry;
    }

    // Re-render only if the phase or palette changed. Panning and zooming reuse the bitmap.
    const lit = o.phase ? Math.round(o.phase.lit * 128) / 128 : null;
    const key = `${lit}:${night}`;
    if(image.renderKey !== key) {
      const facing = lit === null ? 0 : 2 * lit - 1;
      const light: Vec3 = lit === null ? [-.55, .46, .69] : [Math.sqrt(1 - facing * facing), 0, facing];
      image.renderer.draw(light, night);
      image.renderKey = key;
    }
    const progress = Math.max(0, Math.min(1, Math.log(cam.zoom / CLOSEUP_START_ZOOM) / Math.log(BODY_FOCUS_ZOOM / CLOSEUP_START_ZOOM)));
    const span = Math.min(cam.W, cam.H);
    const maxRadius = span * (symbol === 'saturn' ? .178 : .29);
    const radius = 11 + progress * (maxRadius - 11);
    const scale = radius / image.renderer.radius;

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= blend;
    if(o.phase) ctx.rotate(phaseBearing(cam, o.dir, o.phase.sun));
    const w = image.canvas.width * scale, h = image.canvas.height * scale;
    if(image.renderer.corona) ctx.drawImage(image.renderer.corona, -w * glowScale / 2, -h * glowScale / 2, w * glowScale, h * glowScale);
    ctx.drawImage(image.canvas, -w / 2, -h / 2, w, h);
    ctx.restore();
    return radius * (symbol === 'saturn' ? SATURN_RING_EDGE : 1.05);
  }
}
