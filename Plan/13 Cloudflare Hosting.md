---
tags: [sky-ar, cloudflare, deploy]
---
# 13 Cloudflare Hosting (using your domain)

Back to [[00 Home]] · Why free: [[12 Platforms and Cost]] · Fits into [[03 Architecture]]

## Layout
```
sky.<yourdomain>          → one Cloudflare Worker serving the built PWA as static assets
sky.<yourdomain>/api/*    → the same Worker's Hono routes (run_worker_first)
```
(Implemented this way in `packages/api/wrangler.toml`: a single Worker with static assets instead of a separate Pages project, so one deploy covers both.)
The API is a **Hono** app in TypeScript. Locally it runs on **Node.js**; in production the same code is deployed as a Cloudflare Worker and routed under `sky.<yourdomain>/api/*`, so the site and API share one origin and there are **no CORS issues**. Details: [[17 Tech Stack]]

## Why HTTPS matters
Camera, geolocation and device orientation **only work on HTTPS**. Cloudflare gives a free certificate automatically. For local testing on a phone, run `npm run dev` (Vite + Node.js API) and then **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:5173`) to get an HTTPS URL on your phone instantly.

## Worker endpoints
| Endpoint | Does | Cache |
|---|---|---|
| `GET /api/aircraft?lat=&lon=&r=` | Rounds lat/lon to a 0.5° grid (so nearby users share the cache), calls OpenSky with OAuth token (secret in Worker env), falls back to adsb.lol, normalizes JSON | 10 s (Cache API) |
| `GET /api/tle?group=visual` | Returns TLEs from KV | KV, refreshed by cron |
| Cron trigger `0 */3 * * *` | Fetches CelesTrak groups (`visual`, `stations`, `starlink`) → KV | 3 h |
| `POST /api/eval` (optional) | Stores eval logs for [[11 Accuracy Evaluation]] (KV or D1) | n/a |

## Secrets
- `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` → `wrangler secret put ...` (never in the frontend). See [[04 Data Source - ADS-B Aircraft]]

## Deploy flow
1. GitHub repo → connect in Cloudflare dashboard → Pages → auto-deploy on push
2. Add custom domain `sky.<yourdomain>` (one click since the domain is already on Cloudflare)
3. Deploy the API Worker with `wrangler deploy` (route `sky.<yourdomain>/api/*`), bind KV namespace `TLE_CACHE`, add the cron trigger in `wrangler.toml`

## Privacy
User location is sent only as a rounded grid cell to our own Worker; nothing is stored. Good to mention to judges.

Related: [[17 Tech Stack]] · [[15 Implementation Plan 48h]]
