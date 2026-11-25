# SkyTrace AR

Point a phone at the sky and see every plane and satellite labelled on the camera view.

A free web app (PWA) for iPhone and Android: live ADS-B aircraft, SGP4-propagated satellites, and the Sun, Moon and planets, drawn over the camera image. Calibration and an accuracy-eval mode measure label error against the real sky.

The planning vault (Obsidian) is in [`Plan/`](Plan/00%20Home.md).

## Stack

TypeScript everywhere, Node.js for development. npm workspaces:

| Package | What |
|---|---|
| `packages/shared` | Geodesy (WGS-84, ECEF, ENU, az/el, refraction, dead-reckoning), TLE parsing, shared types |
| `packages/api` | Hono API: `/api/aircraft` (OpenSky, adsb.lol fallback) and `/api/tle` (CelesTrak, cached). Runs on Node.js locally and as a Cloudflare Worker in production |
| `packages/app` | Vite PWA: camera, sensors, projection, overlay, SGP4 Web Worker, calibration, eval |

## Run locally

```powershell
npm install
npm run dev
```

- App: http://localhost:5173 (Vite, proxies `/api` to the Node API on port 8787)
- On a desktop there are no motion sensors: drag to look around, scroll to zoom, arrow keys to nudge.
- Test another location: `http://localhost:5173/?lat=51.47&lon=-0.45`

### On your phone (HTTPS required for camera and sensors)

With `npm run dev` running, in a second terminal:

```powershell
npm run tunnel
```

Open the `https://….trycloudflare.com` address it prints on your phone. This needs [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) installed.

### Optional: OpenSky account

Without credentials the API uses OpenSky anonymously (low daily limit) and falls back to adsb.lol. To use your own OpenSky API client, copy `packages/api/.env.example` to `packages/api/.env` and fill it in.

## Tests and build

```powershell
npm test
```

```powershell
npm run build
```

Tests cover the geodesy, rotation conventions, camera projection, the calibration solver, and the SGP4 pipeline against satellite.js's own look angles.

## Deploy to Cloudflare (free tier)

One Worker serves the built app as static assets and handles `/api/*`. See `packages/api/wrangler.toml`.

Live at **https://skytrace.spifly.stream**.

1. `npx wrangler login`
2. `npx wrangler kv namespace create TLE_CACHE` and paste the id into `wrangler.toml`
3. Set the custom domain route in `wrangler.toml` (currently `skytrace.spifly.stream`)
4. `npm run deploy`

A cron trigger refreshes CelesTrak TLEs every 3 hours so phones normally never hit CelesTrak directly.

### Data sources from Cloudflare (tested 2026-11-25)

- **OpenSky is unreachable from Cloudflare Workers** (every opensky-network.org host times out), so the Worker uses adsb.lol only (`AIRCRAFT_SOURCE = "adsblol"` in `wrangler.toml`). Local Node dev still tries OpenSky first.
- **adsb.lol rate-limits Cloudflare's shared IPs** (about half the requests get HTTP 429). The Worker keeps the last good result in the edge cache and serves it (up to 90 s old) when that happens; the phone dead-reckons planes forward and retries after 3 s.
- **Satellites:** if our API can't get TLEs, the phone fetches them directly from CelesTrak, then from a bright-satellite fallback list (tle.ivanstanojevic.me). Both allow browser requests.

## How it works

1. GPS gives the observer position; DeviceOrientation (compass + gyro) gives where the phone points.
2. Aircraft (dead-reckoned to "now") and satellites (SGP4) are converted to azimuth/elevation.
3. A pinhole camera model projects each direction to a screen pixel.
4. Calibration: tap a real object (Moon, planet, plane). One tap fixes the compass offset; two taps far apart also fit the lens field of view.
5. Eval: tap where an object really is; the app logs the angular error and exports CSV.

## Status

Done: phases 1 to 4 of the plan (skeleton, satellites, aircraft, calibration + eval).
Next: night-mode streak detection with recorder/replay (phase 5), polish and results page (phase 6).
