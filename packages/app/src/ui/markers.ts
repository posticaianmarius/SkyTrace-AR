import type { Vec3 } from '@skytrace/shared';
import type { CameraModel } from '../camera/projection';
import type { BodySymbol, SkyObject } from '../types';
import { disk, drawRingHalf, drawSunHalo, globeGradient, phaseBearing } from './body-appearance';

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
  if(o.symbol === 'sun') return 17;
  if(o.symbol === 'saturn') return 15;
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

export function drawSkyMarker(ctx: CanvasRenderingContext2D, cam: CameraModel, o: SkyObject, x: number, y: number, night: boolean, selected: boolean, opacity = 1) {
  const color = markerColor(o, night);
  const r = markerRadius(o);
  const backing = night ? '#290c12' : '#111624';
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  if(o.kind === 'sat' && !o.visible && !o.station && !selected) {
    ctx.globalAlpha = opacity * .52;
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
  let heading: number | undefined;
  if(o.kind === 'aircraft' || (o.kind === 'sat' && selected)) {
    const track = o.nextDir, next = track && cam.project(track), origin = cam.project(o.dir);
    if(origin.front && next?.front && Math.hypot(next.x - origin.x, next.y - origin.y) >= .15) heading = Math.atan2(next.y - origin.y, next.x - origin.x);
  }
  if(selected && heading !== undefined) {
    const dx = -Math.cos(heading), dy = -Math.sin(heading);
    ctx.globalAlpha = opacity * .5;
    ctx.beginPath();
    ctx.moveTo(dx * (r + 6), dy * (r + 6));
    ctx.lineTo(dx * (r + 16), dy * (r + 16));
    ctx.stroke();
  }
  ctx.globalAlpha = opacity * (o.visible || selected ? 1 : .63);
  ctx.fillStyle = backing;
  disk(ctx, r);
  ctx.fill();
  ctx.globalAlpha *= .38;
  ctx.stroke();
  ctx.globalAlpha = opacity * (o.visible || selected ? 1 : .67);
  if(selected) {
    ctx.setLineDash([3, 3]);
    disk(ctx, r + 3);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = color;
  if(o.kind === 'aircraft') {
    if(heading !== undefined) ctx.rotate(heading + Math.PI / 2);
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
    drawPhase(ctx, cam, o.dir, o.phase.sun, o.phase.lit, o.symbol === 'moon', color, night);
  } else {
    drawBody(ctx, o.symbol, color, backing, night);
  }
  ctx.restore();
}

function drawPhase(ctx: CanvasRenderingContext2D, cam: CameraModel, view: Vec3, sun: Vec3, fraction: number, moon: boolean, color: string, night: boolean) {
  const r = moon ? 9.5 : 7;
  ctx.rotate(phaseBearing(cam, view, sun));
  if(moon) {
    ctx.fillStyle = night ? '#412025' : '#2b3244';
    disk(ctx, r);
    ctx.fill();
    ctx.fillStyle = globeGradient(ctx, r, night ? '#ffe3d9' : '#f5f6ff', color, night ? '#a06160' : '#828ba9');
  }
  ctx.globalAlpha *= .34;
  disk(ctx, r);
  ctx.stroke();
  ctx.globalAlpha /= .34;
  if(fraction <= .005) return;
  if(fraction < .995) {
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
    const terminator = r * Math.abs(1 - 2 * fraction);
    if(terminator > .01) ctx.ellipse(0, 0, terminator, r, 0, Math.PI / 2, -Math.PI / 2, fraction < .5);
    else ctx.lineTo(0, -r);
    ctx.closePath();
  }
  ctx.fill();
  if(moon) {
    ctx.clip();
    ctx.fillStyle = night ? '#4c252c' : '#505a76';
    ctx.globalAlpha *= .24;
    ctx.beginPath();
    ctx.ellipse(2.7, -2.9, 2.9, 2.1, -.36, 0, 2 * Math.PI);
    ctx.moveTo(.3, 3.1);
    ctx.ellipse(-1.5, 3.1, 1.8, 1.3, .36, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function drawBody(ctx: CanvasRenderingContext2D, symbol: BodySymbol, color: string, backing: string, night: boolean) {
  if(symbol === 'sun') {
    drawSunHalo(ctx, 8.4, night ? '#e65a4b' : '#ffa64b');
    ctx.fillStyle = globeGradient(ctx, 8.4, '#fff1d1', color, night ? '#db6050' : '#ee813b');
    disk(ctx, 8.4);
    ctx.fill();
    return;
  }
  if(symbol === 'saturn') {
    ctx.rotate(-.34);
    drawRingHalf(ctx, 6.9, .39, color, false);
    ctx.fillStyle = globeGradient(ctx, 6.9, night ? '#ffd8c1' : '#fff0cd', color, night ? '#a65549' : '#927058');
    disk(ctx, 6.9);
    ctx.fill();
    drawRingHalf(ctx, 6.9, .39, color, true);
    return;
  }
  disk(ctx, 6.4);
  ctx.fill();
  if(symbol === 'jupiter' || symbol === 'mars') {
    ctx.clip();
    ctx.fillStyle = backing;
    ctx.globalAlpha *= .33;
    ctx.rotate(-.23);
    ctx.fillRect(-7, -1.7, 14, 1.8);
    if(symbol === 'jupiter') ctx.fillRect(-7, 2.5, 14, 1.3);
  }
}
