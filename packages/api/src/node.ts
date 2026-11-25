/** Local development server: runs the same Hono app on Node.js. */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp, type Env } from './app';
import type { KeyValueStore } from './store';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** File-backed cache so restarting the dev server doesn't re-download TLEs. */
class FileStore implements KeyValueStore {
  constructor(private dir: string) {}
  private path(key: string) {
    return join(this.dir, `${key.replace(/[^a-z0-9_-]/gi, '_')}.json`);
  }
  async get(key: string): Promise<string | null> {
    try {
      const { expires, value } = JSON.parse(await readFile(this.path(key), 'utf8'));
      return expires > Date.now() ? value : null;
    } catch {
      return null;
    }
  }
  async put(key: string, value: string, ttlSec = 3600): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.path(key), JSON.stringify({ expires: Date.now() + ttlSec * 1000, value }));
  }
}

const env: Env = {
  STORE: new FileStore(join(root, '.cache')),
  OPENSKY_CLIENT_ID: process.env.OPENSKY_CLIENT_ID,
  OPENSKY_CLIENT_SECRET: process.env.OPENSKY_CLIENT_SECRET,
  AIRCRAFT_SOURCE: process.env.AIRCRAFT_SOURCE,
};

const app = createApp();
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: (req) => app.fetch(req, env), port }, (info) => {
  console.log(`SkyTrace API on http://localhost:${info.port}/api/health`);
  console.log(`OpenSky: ${env.OPENSKY_CLIENT_ID ? 'authenticated' : 'anonymous'}`);
});
