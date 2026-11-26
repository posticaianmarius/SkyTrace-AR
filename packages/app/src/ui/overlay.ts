/** Canvas overlay: horizon, compass ticks, labels, off-screen arrows. */
import { azElToEnu } from '@skytrace/shared';
import type { CameraModel } from '../camera/projection';
import { CONSTELLATIONS, type StarSky } from '../stars/constellations';
import type { SkyObject, SkyReference } from '../types';
import { drawSkyMarker, markerCaption, markerColor, markerRadius } from './markers';

export interface Placed {
  obj: SkyObject;
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const COLORS = {
  constellation: '#bfafff',
  horizon: 'rgba(175,182,220,0.30)',
  guide: 'rgba(212,215,239,0.52)',
  text: '#c7cad9',
  box: 'rgba(14, 15, 27, 0.94)',
};

const NIGHT = {
  constellation: '#ff7777',
  horizon: 'rgba(255,115,115,0.30)',
  guide: 'rgba(255,150,150,0.55)',
  text: '#ffb3b3',
  box: 'rgba(33, 10, 13, 0.95)',
};

export class Overlay {
  private ctx: CanvasRenderingContext2D;
  private readonly constellationReveals = new Map<string, number>();
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  night = false;
  selectedId: string | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Draw everything; returns the on-screen positions (for tap hit-testing). */
  draw(cam: CameraModel, objects: SkyObject[], stars: StarSky | null, reference?: SkyReference): Placed[] {
    const { ctx } = this;
    const C = this.night ? NIGHT : COLORS;
    ctx.clearRect(0, 0, cam.W, cam.H);
    this.drawHorizon(cam, C);
    const constellationLabels = stars ? this.drawConstellations(cam, stars, C.constellation) : [];
    if(reference) {
      const p = cam.project(reference.dir);
      if(p.front && p.x >= 0 && p.x <= cam.W && p.y >= 0 && p.y <= cam.H) {
        ctx.strokeStyle = C.constellation;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }

    const sorted = [...objects].sort((a, b) => Number(b.id === this.selectedId) - Number(a.id === this.selectedId) || b.priority - a.priority);
    const taken: Rect[] = [];
    const placed: Placed[] = [];
    const arrows: SkyObject[] = [];
    const margin = 4;

    for (const o of sorted) {
      const p = cam.project(o.dir);
      const onScreen = p.front && p.x > -margin && p.x < cam.W + margin && p.y > -margin && p.y < cam.H + margin;
      if (!onScreen) {
        if (o.priority >= 70 || o.id === this.selectedId) arrows.push(o);
        continue;
      }
      placed.push({ obj: o, x: p.x, y: p.y });
    }
    for(let i = placed.length - 1; i >= 0; i --) {
      const { obj, x, y } = placed[i]!;
      drawSkyMarker(ctx, cam, obj, x, y, this.night, obj.id === this.selectedId);
    }
    for(const p of placed) {
      const selected = p.obj.id === this.selectedId;
      if(p.obj.kind === 'sat' && !p.obj.visible && !p.obj.station && !selected) continue;
      const caption = markerCaption(p.obj, selected);
      const rect = this.fitLabel(cam, p, taken, caption);
      if(rect) {
        taken.push(rect);
        this.drawLabel(p, rect, C, caption, selected);
      }
    }
    this.drawArrows(cam, arrows.slice(0, 10), taken);
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for(const { name, x, y } of constellationLabels) {
      const w = ctx.measureText(name).width + 12;
      const rect = { x: Math.max(4, Math.min(cam.W - w - 4, x - w / 2)), y: Math.max(4, y - 24), w, h: 18 };
      if(rect.x + w > cam.W - 4 || rect.y + rect.h > cam.H - 4 || taken.some((r) => overlaps(r, rect))) continue;
      taken.push(rect);
      ctx.fillStyle = C.box;
      roundRect(ctx, rect.x, rect.y, w, rect.h, 4);
      ctx.fill();
      ctx.fillStyle = C.constellation;
      ctx.fillText(name, rect.x + w / 2, rect.y + 13);
    }
    this.drawCrosshair(cam, C);
    return placed;
  }

  resetConstellationReveals() {
    this.constellationReveals.clear();
  }

  private drawConstellations(cam: CameraModel, { directions }: StarSky, color: string) {
    const { ctx } = this;
    const now = performance.now();
    const labels: Array<{ name: string; x: number; y: number }> = [];
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    for(const { id, name, segments, vertices } of CONSTELLATIONS) {
      const visible = segments.flatMap(([a, b]) => {
        const line = cam.projectSkySegment(directions[a]!, directions[b]!);
        return line ? [line] : [];
      });
      if(!visible.length) continue;
      const first = this.constellationReveals.get(id) ?? now;
      this.constellationReveals.set(id, first);
      const reveal = this.reducedMotion.matches ? visible.length : Math.min(1, (now - first) / 420) * visible.length;
      let x = 0, y = 0;
      ctx.globalAlpha = 0.64;
      ctx.beginPath();
      for(const [i, { start, end }] of visible.entries()) {
        x += (start.x + end.x) / 2;
        y += (start.y + end.y) / 2;
        const part = Math.min(1, reveal - i);
        if(part <= 0) continue;
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(start.x + part * (end.x - start.x), start.y + part * (end.y - start.y));
      }
      ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for(const vertex of vertices) {
        const dir = directions[vertex]!;
        if(dir[2] < 0) continue;
        const p = cam.project(dir);
        if(!p.front || p.x < 0 || p.x > cam.W || p.y < 0 || p.y > cam.H) continue;
        ctx.moveTo(p.x + 2, p.y);
        ctx.arc(p.x, p.y, 2, 0, 2 * Math.PI);
      }
      ctx.fill();
      labels.push({ name, x: x / visible.length, y: y / visible.length });
    }
    ctx.restore();
    return labels;
  }

  private drawHorizon(cam: CameraModel, C: typeof COLORS) {
    const { ctx } = this;
    ctx.strokeStyle = C.horizon;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    let pen = false;
    for (let az = 0; az <= 360; az += 2) {
      const p = cam.project(azElToEnu(az, 0));
      if (!p.front || Math.abs(p.x) > 5 * cam.W) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
      pen = true;
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = C.horizon;
    ctx.textAlign = 'center';
    ctx.font = '600 12px system-ui, sans-serif';
    const names: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let az = 0; az < 360; az += 15) {
      const p = cam.project(azElToEnu(az, 0));
      if (!p.front) continue;
      const name = names[az];
      ctx.fillRect(p.x - 0.75, p.y - (name ? 8 : 4), 1.5, name ? 16 : 8);
      if(name) ctx.fillText(name, p.x, p.y + 20);
    }
  }

  private fitLabel(cam: CameraModel, { obj, x, y }: Placed, taken: Rect[], caption: string): Rect | null {
    const { ctx } = this;
    ctx.font = '600 13px system-ui, sans-serif';
    let w = ctx.measureText(obj.label).width;
    if(caption) {
      ctx.font = '11px system-ui, sans-serif';
      w = Math.max(w, ctx.measureText(caption).width);
    }
    w += 16;
    const h = caption ? 36 : 23;
    const off = markerRadius(obj) + 10;
    const candidates: Rect[] = [
      { x: x + off, y: y - h / 2, w, h },
      { x: x - off - w, y: y - h / 2, w, h },
      { x: x + off, y: y - h - off / 2, w, h },
      { x: x - off - w, y: y - h - off / 2, w, h },
      { x: x + off, y: y + off / 2, w, h },
    ];
    return candidates.find((r) => r.x >= 4 && r.y >= 4 && r.x + r.w <= cam.W - 4 && r.y + r.h <= cam.H - 4 && !taken.some((t) => overlaps(r, t))) ?? null;
  }

  private drawLabel({ obj, x, y }: Placed, r: Rect, C: typeof COLORS, caption: string, selected: boolean) {
    const { ctx } = this;
    const color = markerColor(obj, this.night);
    const edgeX = r.x < x ? r.x + r.w : r.x, edgeY = r.y + r.h / 2;
    const distance = Math.hypot(edgeX - x, edgeY - y);
    const start = markerRadius(obj) / distance;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = selected ? .9 : .48;
    ctx.beginPath();
    ctx.moveTo(x + (edgeX - x) * start, y + (edgeY - y) * start);
    ctx.lineTo(edgeX, edgeY);
    ctx.stroke();

    ctx.globalAlpha = obj.visible || selected ? 1 : .78;
    ctx.fillStyle = C.box;
    roundRect(ctx, r.x, r.y, r.w, r.h, 7);
    ctx.fill();
    ctx.globalAlpha *= selected ? .9 : .28;
    ctx.stroke();
    ctx.globalAlpha = obj.visible || selected ? 1 : .78;
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(obj.label, r.x + 8, r.y + 16);
    if(caption) {
      ctx.fillStyle = C.text;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(caption, r.x + 8, r.y + 29);
    }
    ctx.restore();
  }

  private drawArrows(cam: CameraModel, objs: SkyObject[], taken: Rect[]) {
    const { ctx } = this;
    const cx = cam.W / 2;
    const cy = cam.H / 2;
    // Keep arrows clear of the HUD (top) and toolbar (bottom)
    const padX = 24;
    const padTop = 90;
    const padBottom = 100;
    ctx.font = '600 12px system-ui, sans-serif';
    for (const o of objs) {
      const c = cam.project(o.dir).c;
      // Direction on screen plane (ignore depth); x right, y down
      let dx = c[0];
      let dy = -c[1];
      const n = Math.hypot(dx, dy);
      if(n < 1e-6) continue;
      dx /= n;
      dy /= n;
      const limY = dy > 0 ? cy - padBottom : cy - padTop;
      const t = Math.min((cx - padX) / Math.abs(dx || 1e-9), Math.max(10, limY) / Math.abs(dy || 1e-9));
      const x = cx + dx * t;
      const y = cy + dy * t;
      const color = markerColor(o, this.night);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-5, -5);
      ctx.lineTo(3, 0);
      ctx.lineTo(-5, 5);
      ctx.stroke();
      ctx.restore();
      const align: CanvasTextAlign = dx > 0.3 ? 'right' : dx < -0.3 ? 'left' : 'center';
      const tx = x - dx * 16;
      const ty = y - dy * 16 + (dy > 0 ? -4 : 12);
      const w = ctx.measureText(o.label).width;
      const left = align === 'right' ? tx - w : align === 'center' ? tx - w / 2 : tx;
      const rect = { x: left - 2, y: ty - 12, w: w + 4, h: 16 };
      if (taken.some((r) => overlaps(r, rect))) continue; // arrow only
      taken.push(rect);
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(o.label, tx, ty);
    }
  }

  private drawCrosshair(cam: CameraModel, C: typeof COLORS) {
    const { ctx } = this;
    ctx.strokeStyle = C.guide;
    ctx.lineWidth = 1;
    const x = cam.W / 2;
    const y = cam.H / 2;
    ctx.beginPath();
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x - 4, y);
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + 10, y);
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y - 4);
    ctx.moveTo(x, y + 4);
    ctx.lineTo(x, y + 10);
    ctx.stroke();
  }
}

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
