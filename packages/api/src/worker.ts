/** Cloudflare Worker entry: same Hono app + a cron that refreshes TLEs. */
import { createApp, storeFor, type Env } from './app';
import { refreshGroup } from './sources/celestrak';

const app = createApp();

/** Groups the cron keeps warm. Others are fetched on first request. */
const CRON_GROUPS = ['visual', 'stations', 'starlink', 'satnogs'] as const;

interface ExecutionContextLike {
  waitUntil(p: Promise<unknown>): void;
}

export default {
  fetch: app.fetch,
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContextLike) {
    const store = storeFor(env);
    ctx.waitUntil(
      Promise.allSettled(CRON_GROUPS.map((g) => refreshGroup(store, g))).then((results) => {
        results.forEach((r, i) =>
          console.log(`TLE ${CRON_GROUPS[i]}: ${r.status === 'fulfilled' ? r.value.sats.length + ' sats' : r.reason}`),
        );
      }),
    );
  },
};
