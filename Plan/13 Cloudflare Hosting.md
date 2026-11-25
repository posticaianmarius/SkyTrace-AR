---
tags: [sky-ar, cloudflare, deploy]
---
# 13 Cloudflare Hosting (using your domain)

Back to [[00 Home]] · Why free: [[12 Platforms and Cost]] · Fits into [[03 Architecture]]

## Layout
```
sky.<yourdomain>          → Cloudflare Pages (the PWA: HTML/JS/CSS)
sky.<yourdomain>/api/*    → Cloudflare Worker (Pages Functions)
```
Using **Pages Functions** (a `/functions` folder in the same repo) keeps everything in one project, one deploy, same origin, so there are **no CORS issues**.

## Why HTTPS matters
Camera, geolocation and device orientation **only work on HTTPS**. Cloudflare gives a free certificate automatically. For local testing on a phone use `npx wrangler pages dev` + **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:8788`) to get an HTTPS URL on your phone instantly.

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
3. Bind KV namespace `TLE_CACHE`, add the cron trigger (cron needs a standalone Worker if Pages Functions don't support it; then use a small separate Worker that writes to the same KV)

## Privacy
User location is sent only as a rounded grid cell to our own Worker; nothing is stored. Good to mention to judges.

Related: [[17 Tech Stack]] · [[15 Implementation Plan 48h]]
