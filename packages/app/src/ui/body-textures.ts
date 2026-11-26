import type { Vec3 } from '@skytrace/shared';

export type ModelSymbol = 'moon' | 'sun' | 'saturn';

export interface Surface { width: number; height: number; data: Uint8ClampedArray }

const surfaces = new Map<ModelSymbol, Surface>();
let lunarMaps: Promise<[Surface | null, Surface | null]> | undefined;

async function loadSurface(file: string): Promise<Surface | null> {
  try {
    const image = new Image();
    image.src = `${import.meta.env.BASE_URL}body-models/${file}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
}

export function fetchLunarMaps() {
  return lunarMaps ??= Promise.all([loadSurface('moon.jpg'), loadSurface('moon-elevation.jpg')]);
}

function wrap(index: number, width: number) {
  return (index % width + width) % width;
}

function hash(x: number, y: number, period: number) {
  let h = Math.imul(wrap(x, period) + 3, 374761393) ^ Math.imul(y + 7, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise(u: number, v: number, scale: number) {
  const x = u * scale, y = v * scale, ix = Math.floor(x), iy = Math.floor(y);
  const dx = x - ix, dy = y - iy;
  const a = dx * dx * (3 - 2 * dx), b = dy * dy * (3 - 2 * dy);
  const upper = hash(ix, iy, scale) * (1 - a) + hash(ix + 1, iy, scale) * a;
  const lower = hash(ix, iy + 1, scale) * (1 - a) + hash(ix + 1, iy + 1, scale) * a;
  return upper * (1 - b) + lower * b;
}

function granules(u: number, v: number) {
  const scale = 118;
  const x = u * scale, y = v * scale, ix = Math.floor(x), iy = Math.floor(y);
  let nearest = 2, second = 2;
  for(let row = iy - 1; row <= iy + 1; row ++) {
    for(let col = ix - 1; col <= ix + 1; col ++) {
      const dx = col + .14 + .72 * hash(col, row, scale) - x;
      const dy = row + .14 + .72 * hash(col + 51, row + 31, scale) - y;
      const distance = dx * dx + dy * dy;
      if(distance < nearest) {
        second = nearest;
        nearest = distance;
      } else if(distance < second) second = distance;
    }
  }
  return Math.min(1, (second - nearest) * 7.5);
}

function solarColor(u: number, v: number): Vec3 {
  const cells = granules(u + .005 * noise(u, v, 17), v);
  const network = noise(u, v, 26), grain = noise(u, v, 180);
  const active = Math.exp(-((u - .64) ** 2 * 565 + (v - .43) ** 2 * 850)) + .68 * Math.exp(-((u - .39) ** 2 * 760 + (v - .59) ** 2 * 1160));
  const spot = Math.max(0, active * (.38 + .82 * noise(u, v, 89)) - .58);
  const heat = 33 * (cells - .6) + 56 * (network - .5) + 26 * (grain - .5) - 240 * spot;
  return [255 + Math.min(0, heat * .72), 168 + heat * 1.46, 79 + heat * 1.24];
}

function saturnColor(u: number, v: number): Vec3 {
  const lat = v + (noise(u, v, 13) - .5) * .018;
  const belts = 10 * Math.sin(56 * lat) + 5 * Math.sin(157 * lat) + 7 * Math.sin(21 * lat);
  const cloud = 13 * (noise(u, v * 3, 52) - .5) + 7 * (noise(u, v * 2, 119) - .5);
  const equator = 13 * Math.exp(-100 * (v - .5) ** 2);
  const polar = 18 * Math.abs(2 * v - 1) ** 4;
  const tone = belts + cloud + equator;
  return [218 + tone - polar, 190 + tone * .91 - polar * .65, 150 + tone * .79 - polar * .18];
}

export function proceduralSurface(symbol: ModelSymbol): Surface {
  const old = surfaces.get(symbol);
  if(old) return old;
  const width = 512, height = 256;
  const data = new Uint8ClampedArray(width * height * 4);
  for(let y = 0; y < height; y ++) {
    for(let x = 0; x < width; x ++) {
      const u = x / width, v = y / height;
      const i = 4 * (y * width + x);
      if(symbol === 'moon') {
        const gray = 120 + 64 * (noise(u, v, 7) - .5) + 36 * (noise(u, v, 40) - .5);
        data[i] = data[i + 1] = data[i + 2] = gray;
      } else {
        const [red, green, blue] = symbol === 'sun' ? solarColor(u, v) : saturnColor(u, v);
        data[i] = red;
        data[i + 1] = green;
        data[i + 2] = blue;
      }
      data[i + 3] = 255;
    }
  }
  const surface = { width, height, data };
  surfaces.set(symbol, surface);
  return surface;
}

export function sampleSurface({ width, height, data }: Surface, u: number, v: number, rgb: Vec3) {
  const x = u * width - .5, y = Math.max(0, Math.min(height - 1, v * height - .5));
  const col = Math.floor(x), row = Math.floor(y), dx = x - col, dy = y - row;
  const a = 4 * (row * width + wrap(col, width)), b = 4 * (row * width + wrap(col + 1, width));
  const below = Math.min(height - 1, row + 1) * width * 4;
  const c = below + 4 * wrap(col, width), d = below + 4 * wrap(col + 1, width);
  for(const k of [0, 1, 2] as const) rgb[k] = (data[a + k]! * (1 - dx) + data[b + k]! * dx) * (1 - dy) + (data[c + k]! * (1 - dx) + data[d + k]! * dx) * dy;
}

export function lunarSlopes({ width, height, data }: Surface, u: number, v: number, cosineLatitude: number, slopes: [number, number]) {
  const x = Math.round(u * width - .5), y = Math.max(0, Math.min(height - 1, Math.round(v * height - .5)));
  const left = data[4 * (y * width + wrap(x - 2, width))]!, right = data[4 * (y * width + wrap(x + 2, width))]!;
  const north = data[4 * (Math.max(0, y - 2) * width + wrap(x, width))]!, south = data[4 * (Math.min(height - 1, y + 2) * width + wrap(x, width))]!;
  // Approximate converting the stretched 8-bit elevation map into physical slopes.
  slopes[0] = (right - left) * .0032 / Math.max(.22, cosineLatitude);
  slopes[1] = (north - south) * .0032;
}
