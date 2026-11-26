import type { Vec3 } from '@skytrace/shared';
import type { CameraModel } from '../camera/projection';
import { apply } from '../math/mat3';
import type { BodySymbol, SkyObject } from '../types';

const BODY_COLORS: Record<BodySymbol, string> = { sun: '#ffdb8f', moon: '#e6eaff', venus: '#ffdec1', mars: '#f5a393', jupiter: '#edd0ad', saturn: '#ffe2ab' };
const NIGHT_BODY_COLORS: Record<BodySymbol, string> = { sun: '#ffb28d', moon: '#ffd0cb', venus: '#ffbeb0', mars: '#ff8b80', jupiter: '#ffc0a7', saturn: '#ffb99e' };
const PLANE = new Path2D('M0 -9 Q2 -9 2 -5 L2 -1 L8 3 L8 5 L2 3 L2 6 L4 8 L4 9 L0 8 L-4 9 L-4 8 L-2 6 L-2 3 L-8 5 L-8 3 L-2 -1 L-2 -5 Q-2 -9 0 -9Z');
const SATELLITE = new Path2D('M-2.4 -3.2H2.4V3.2H-2.4Z M-8 -3.5H-4.5V3.5H-8Z M4.5 -3.5H8V3.5H4.5Z');

export function markerColor(o: SkyObject, night: boolean): string {
  if(o.kind === 'body') return (night ? NIGHT_BODY_COLORS : BODY_COLORS)[o.symbol];
  if(o.kind === 'aircraft') return night ? '#ffad93' : '#ffd090';
  return night ? '#ff938e' : '#9edffc';
}

export function markerRadius(o: SkyObject): number {
  if(o.kind === 'aircraft') return 12;
  if(o.kind === 'sat') return o.station ? 13 : 10;
  if(o.symbol === 'sun') return 16;
  return o.symbol === 'moon' ? 13 : 11;
}

export function objectCategory(o: SkyObject): string {
  if(o.kind === 'aircraft') return 'Aircraft';
  if(o.kind === 'sat') return o.station ? 'Space station' : 'Satellite';
  if(o.symbol === 'sun') return 'Star';
  return o.symbol === 'moon' ? 'Natural satellite' : 'Planet';
}

export function markerCaption(o: SkyObject, selected: boolean): string {
  if(o.kind === 'body') {
    if(o.symbol === 'sun') return 'Avoid direct viewing';
    if(o.symbol === 'moon' && o.phase) return `${Math.round(o.phase.lit * 100)}% illuminated`;
    return '';
  }
  if(selected || (o.kind === 'aircraft' && o.priority >= 78) || (o.kind === 'sat' && o.station)) return `${Math.round(o.rangeKm)} km away`;
  return '';
}

export function drawSkyMarker(ctx: CanvasRenderingContext2D, cam: CameraModel, o: SkyObject, x: number, y: number, night: boolean, selected: boolean) {
  const color = markerColor(o, night);
  const r = markerRadius(o);
  const backing = night ? '#290c12' : '#111624';
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  if(o.kind === 'sat' && !o.visible && !o.station && !selected) {
    ctx.globalAlpha = .52;
    ctx.beginPath();
    ctx.moveTo(0, -3.5);
    ctx.lineTo(3.5, 0);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-3.5, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.globalAlpha = o.visible || selected ? 1 : .63;
  ctx.fillStyle = backing;
  disk(ctx, r);
  ctx.fill();
  ctx.globalAlpha *= .38;
  ctx.stroke();
  ctx.globalAlpha = o.visible || selected ? 1 : .67;
  if(selected) {
    ctx.setLineDash([3, 3]);
    disk(ctx, r + 3);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = color;
  if(o.kind === 'aircraft') {
    const track = o.nextDir;
    const next = track && cam.project(track);
    if(next?.front && Math.hypot(next.x - x, next.y - y) >= .15) ctx.rotate(Math.atan2(next.y - y, next.x - x) + Math.PI / 2);
    ctx.fill(PLANE);
  } else if(o.kind === 'sat') {
    ctx.rotate(-Math.PI / 7);
    if(o.station) ctx.scale(1.27, 1.27);
    ctx.fill(SATELLITE);
    ctx.fillRect(-4.5, -.6, 9, 1.2);
    if(o.station) {
      ctx.fillRect(-.6, -6, 1.2, 12);
      ctx.fillRect(-7.5, -5.5, 15, 1.1);
      ctx.fillRect(-7.5, 4.4, 15, 1.1);
    }
  } else if(o.phase) {
    drawPhase(ctx, cam, o.dir, o.phase.sun, o.phase.lit, o.symbol === 'moon' ? 9 : 7);
  } else {
    drawBody(ctx, o.symbol, backing);
  }
  ctx.restore();
}

function disk(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 2 * Math.PI);
}

function drawPhase(ctx: CanvasRenderingContext2D, cam: CameraModel, view: Vec3, sun: Vec3, fraction: number, r: number) {
  const [x, y, z] = apply(cam.M, view);
  const [sx, sy, sz] = apply(cam.M, sun);
  // Use the projected tangent to the Sun, which remains valid when the Sun is offscreen.
  ctx.rotate(Math.atan2(sy * z - y * sz, x * sz - sx * z));
  ctx.globalAlpha *= .34;
  disk(ctx, r);
  ctx.stroke();
  ctx.globalAlpha /= .34;
  if(fraction <= .005) return;
  if(fraction >= .995) {
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
  const terminator = r * Math.abs(1 - 2 * fraction);
  if(terminator > .01) ctx.ellipse(0, 0, terminator, r, 0, Math.PI / 2, -Math.PI / 2, fraction < .5);
  else ctx.lineTo(0, -r);
  ctx.closePath();
  ctx.fill();
}

function drawBody(ctx: CanvasRenderingContext2D, symbol: BodySymbol, backing: string) {
  disk(ctx, symbol === 'sun' ? 7.2 : 6.4);
  ctx.fill();
  if(symbol === 'sun') {
    ctx.beginPath();
    for(let i = 0; i < 8; i ++) {
      const a = i * Math.PI / 4;
      ctx.moveTo(10 * Math.cos(a), 10 * Math.sin(a));
      ctx.lineTo(13 * Math.cos(a), 13 * Math.sin(a));
    }
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.stroke();
  } else if(symbol === 'saturn') {
    ctx.beginPath();
    ctx.ellipse(0, 0, 10.4, 3.3, -.42, 0, 2 * Math.PI);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else if(symbol === 'jupiter' || symbol === 'mars') {
    ctx.clip();
    ctx.fillStyle = backing;
    ctx.globalAlpha *= .33;
    ctx.rotate(-.23);
    ctx.fillRect(-7, -1.7, 14, 1.8);
    if(symbol === 'jupiter') ctx.fillRect(-7, 2.5, 14, 1.3);
  }
}
