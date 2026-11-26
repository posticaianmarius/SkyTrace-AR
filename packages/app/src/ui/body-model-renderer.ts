import type { Vec3 } from '@skytrace/shared';
import type { BodySymbol } from '../types';
import { drawSunHalo } from './body-appearance';
import { fetchLunarMaps, lunarSlopes, proceduralSurface, sampleSurface, type ModelSymbol, type Surface } from './body-textures';
import { paintSaturnRings, ringShadowOnGlobe, SATURN_FLATTENING, SATURN_ROLL } from './saturn-rings';

export type { ModelSymbol } from './body-textures';

export function hasBodyModel(symbol: BodySymbol): symbol is ModelSymbol {
  return symbol === 'moon' || symbol === 'sun' || symbol === 'saturn';
}

function lunarIncidence(x: number, y: number, z: number, light: Vec3, slopes: [number, number]) {
  const c = Math.max(.0001, Math.hypot(x, z));
  const east = (z * light[0] - x * light[2]) / c;
  const north = c * light[1] - y * (x * light[0] + z * light[2]) / c;
  const direct = x * light[0] + y * light[1] + z * light[2];
  return Math.max(0, (direct - slopes[0] * east - slopes[1] * north) / Math.hypot(1, ...slopes));
}

function drawCorona(ctx: CanvasRenderingContext2D, r: number, night: boolean) {
  drawSunHalo(ctx, r * .88, night ? '#be5142' : '#dd7130');
  const wisp = document.createElement('canvas');
  wisp.width = wisp.height = 288;
  const layer = wisp.getContext('2d')!;
  const image = layer.createImageData(wisp.width, wisp.height);
  const half = wisp.width / 2, reach = 1.36;
  for(let i = 0; i < image.width * image.height; i ++) {
    const x = (i % image.width + .5 - half) * reach / half;
    const y = (Math.floor(i / image.width) + .5 - half) * reach / half;
    const h = Math.hypot(x, y) - 1;
    if(h < -.02 || h > reach - 1) continue;
    const angle = Math.atan2(y, x) + h * 1.2;
    const streams = .50 + .22 * Math.cos(9 * angle + .9 * Math.sin(angle * 4)) + .16 * Math.sin(19 * angle - .6 * Math.cos(angle * 5)) + .10 * Math.cos(38 * angle);
    const edge = .16 * Math.exp(-7200 * (h + .002) ** 2);
    const glow = (.05 + .65 * streams ** 3) * Math.exp(-12 * Math.max(0, h)) * Math.min(1, (reach - 1 - h) * 5);
    const at = 4 * i;
    image.data[at] = 255;
    image.data[at + 1] = night ? 92 : 166 - h * 112;
    image.data[at + 2] = night ? 69 : 73 - h * 85;
    image.data[at + 3] = 255 * (edge + glow);
  }
  layer.putImageData(image, 0, 0);
  ctx.drawImage(wisp, -r * reach, -r * reach, 2 * r * reach, 2 * r * reach);
}

export class BodyModelRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  readonly corona: HTMLCanvasElement | null;
  private readonly globe = document.createElement('canvas');
  private readonly ringBack: HTMLCanvasElement | null;
  private readonly ringFront: HTMLCanvasElement | null;
  private readonly globeCtx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly normals: Float32Array;
  private surface: Surface;
  private terrain: Surface | null = null;

  constructor(private canvas: HTMLCanvasElement, private symbol: ModelSymbol) {
    this.ctx = canvas.getContext('2d')!;
    this.corona = symbol === 'sun' ? document.createElement('canvas') : null;
    if(this.corona) {
      this.corona.width = canvas.width;
      this.corona.height = canvas.height;
    }
    const size = symbol === 'saturn' ? 380 : 416;
    this.ringBack = symbol === 'saturn' ? document.createElement('canvas') : null;
    this.ringFront = symbol === 'saturn' ? document.createElement('canvas') : null;
    this.globe.width = this.globe.height = size;
    this.globeCtx = this.globe.getContext('2d')!;
    this.image = this.globeCtx.createImageData(size, size);
    this.normals = new Float32Array(size * size * 3);
    this.surface = proceduralSurface(symbol);
    const r = this.radius;
    for(let i = 0; i < size * size; i ++) {
      const x = (i % size + .5 - size / 2) / r, y = (size / 2 - Math.floor(i / size) - .5) / r;
      this.normals[3 * i] = x;
      this.normals[3 * i + 1] = y;
      this.normals[3 * i + 2] = Math.sqrt(1 - x * x - y * y);
    }
  }

  get radius() { return this.globe.width / 2 - 1; }

  async loadTexture() {
    if(this.symbol !== 'moon') return false;
    const [color, terrain] = await fetchLunarMaps();
    if(color) this.surface = color;
    this.terrain = terrain;
    return Boolean(color || terrain);
  }

  draw(light: Vec3, night: boolean) {
    const { image, normals, surface, terrain, symbol, ctx, canvas } = this;
    const rgb: Vec3 = [0, 0, 0];
    const slopes: [number, number] = [0, 0];
    for(let i = 0; i < image.width * image.height; i ++) {
      const x = normals[3 * i]!, y = normals[3 * i + 1]!, z = normals[3 * i + 2]!;
      if(Number.isNaN(z)) continue;
      const u = .5 + Math.atan2(x, z) / (2 * Math.PI), v = .5 - Math.asin(y) / Math.PI;
      sampleSurface(surface, u, v, rgb);
      const direct = Math.max(0, x * light[0] + y * light[1] + z * light[2]);
      let shade = 1, scatter = 0;
      if(symbol === 'moon') {
        if(terrain) lunarSlopes(terrain, u, v, Math.hypot(x, z), slopes);
        const lit = terrain ? lunarIncidence(x, y, z, light, slopes) : direct;
        shade = .065 + 1.32 * lit ** .76;
      } else if(symbol === 'saturn') {
        const lightThroughRings = ringShadowOnGlobe(x, y, z, light);
        shade = .15 + .98 * direct ** .73 * lightThroughRings;
        scatter = 32 * (1 - z) ** 3 * (.18 + direct) * lightThroughRings;
      } else {
        shade = .45 + .38 * z + .17 * Math.sqrt(z);
      }

      const red = rgb[0] * shade + scatter, green = rgb[1] * shade + scatter * .88, blue = rgb[2] * shade + scatter * .72;
      const intensity = .30 * red + .59 * green + .11 * blue;
      const at = i * 4;
      image.data[at] = night ? intensity * 1.04 : red;
      image.data[at + 1] = night ? intensity * .41 : green;
      image.data[at + 2] = night ? intensity * .37 : blue;
      image.data[at + 3] = Math.min(255, 45 + 5100 * z * z);
    }
    this.globeCtx.putImageData(image, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    const r = this.radius;
    if(this.corona) {
      const glow = this.corona.getContext('2d')!;
      glow.clearRect(0, 0, canvas.width, canvas.height);
      glow.save();
      glow.translate(canvas.width / 2, canvas.height / 2);
      drawCorona(glow, r, night);
      glow.restore();
    }
    if(this.ringFront && this.ringBack) {
      paintSaturnRings(this.ringFront, this.ringBack, r, light, night);
      ctx.rotate(SATURN_ROLL);
      ctx.drawImage(this.ringBack, -this.ringBack.width / 2, -this.ringBack.height / 2);
    }
    const globeHeight = this.globe.height * (symbol === 'saturn' ? SATURN_FLATTENING : 1);
    ctx.drawImage(this.globe, -this.globe.width / 2, -globeHeight / 2, this.globe.width, globeHeight);
    if(this.ringFront) ctx.drawImage(this.ringFront, -this.ringFront.width / 2, -this.ringFront.height / 2);
    ctx.restore();
  }
}
