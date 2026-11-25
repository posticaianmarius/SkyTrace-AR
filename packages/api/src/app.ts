import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { TLE_GROUPS, type AircraftResponse, type TleGroup } from '@skytrace/shared';
import { fetchAdsbLol } from './sources/adsblol';
import { getGroup } from './sources/celestrak';
import { bboxAround, snap } from './sources/common';
import { fetchOpenSky } from './sources/opensky';
import { KvStore, MemoryStore, type KVNamespaceLike, type KeyValueStore } from './store';

/** Bindings: Cloudflare env on Workers, process.env-derived object on Node. */
export interface Env {
  /** Cloudflare KV namespace for TLE caching (Workers only). */
  TLE_CACHE?: KVNamespaceLike;
  /** Pre-built store (Node only, e.g. a file-backed store). */
  STORE?: KeyValueStore;
  OPENSKY_CLIENT_ID?: string;
  OPENSKY_CLIENT_SECRET?: string;
  /** "adsblol" to skip OpenSky entirely. */
  AIRCRAFT_SOURCE?: string;
}

const AIRCRAFT_TTL_SEC = 10;
const memory = new MemoryStore();
const inflight = new Map<string, Promise<AircraftResponse>>();

export function storeFor(env: Env): KeyValueStore {
  if (env.STORE) return env.STORE;
  if (env.TLE_CACHE) return new KvStore(env.TLE_CACHE);
  return memory;
}

async function loadAircraft(env: Env, lat: number, lon: number, rKm: number): Promise<AircraftResponse> {
  const fetchedAt = Math.floor(Date.now() / 1000);
  const errors: string[] = [];
  if (env.AIRCRAFT_SOURCE !== 'adsblol') {
    try {
      const aircraft = await fetchOpenSky(bboxAround(lat, lon, rKm), {
        clientId: env.OPENSKY_CLIENT_ID,
        clientSecret: env.OPENSKY_CLIENT_SECRET,
      });
      return { source: 'opensky', fetchedAt, aircraft };
    } catch (err) {
      errors.push(String(err));
    }
  }
  try {
    const aircraft = await fetchAdsbLol(lat, lon, rKm);
    return { source: 'adsblol', fetchedAt, aircraft };
  } catch (err) {
    errors.push(String(err));
  }
  return { source: 'none', fetchedAt, aircraft: [], error: errors.join('; ') };
}

export function createApp() {
  const app = new Hono<{ Bindings: Env }>().basePath('/api');

  app.use('*', cors());

  app.get('/health', (c) => c.json({ ok: true, time: Date.now() }));

  /** GET /api/aircraft?lat=44.43&lon=26.10&r=120  (r in km, max 250) */
  app.get('/aircraft', async (c) => {
    const lat = Number(c.req.query('lat'));
    const lon = Number(c.req.query('lon'));
    const r = Math.min(250, Math.max(10, Number(c.req.query('r') ?? 120)));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return c.json({ error: 'lat and lon are required' }, 400);
    }
    // Snap to a 0.25 deg grid: shared cache, and no precise user location sent upstream.
    const sLat = snap(lat, 0.25);
    const sLon = snap(lon, 0.25);
    const rKm = r + 30; // compensate for the snapping
    const cacheKey = `ac:${sLat.toFixed(2)}:${sLon.toFixed(2)}:${rKm}`;

    const hit = await memory.get(cacheKey);
    if (hit) return c.body(hit, 200, { 'content-type': 'application/json', 'x-cache': 'hit' });

    let p = inflight.get(cacheKey);
    if (!p) {
      p = loadAircraft(c.env ?? {}, sLat, sLon, rKm).finally(() => inflight.delete(cacheKey));
      inflight.set(cacheKey, p);
    }
    const data = await p;
    const body = JSON.stringify(data);
    if (data.source !== 'none') await memory.put(cacheKey, body, AIRCRAFT_TTL_SEC);
    return c.body(body, 200, {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=5',
      'x-cache': 'miss',
    });
  });

  /** GET /api/tle?group=visual */
  app.get('/tle', async (c) => {
    const group = (c.req.query('group') ?? 'visual') as TleGroup;
    if (!TLE_GROUPS.includes(group)) {
      return c.json({ error: `group must be one of ${TLE_GROUPS.join(', ')}` }, 400);
    }
    try {
      const data = await getGroup(storeFor(c.env ?? {}), group);
      c.header('cache-control', 'public, max-age=1800');
      return c.json(data);
    } catch (err) {
      return c.json({ error: String(err) }, 502);
    }
  });

  return app;
}
