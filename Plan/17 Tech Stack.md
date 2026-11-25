---
tags: [sky-ar, stack]
---
# 17 Tech Stack: TypeScript + Node.js

Back to [[00 Home]] · Architecture: [[03 Architecture]]

**Decision:** everything is written in **TypeScript**. **Node.js** (v24, already installed) is the runtime for development, the local API server, tests and helper scripts. The phone runs the compiled JavaScript in its browser. All tools are free and open source.

## Where each piece runs
| Part | Language | Runs on (dev) | Runs on (production) |
|---|---|---|---|
| Phone app (camera, sensors, overlay, SGP4, night mode) | TypeScript | Vite dev server (Node) → phone over HTTPS tunnel | Phone browser, static files on Cloudflare Pages |
| API (`/api/aircraft`, `/api/tle`) | TypeScript + **Hono** | **Node.js** (`@hono/node-server`) | **Cloudflare Worker** (same code) |
| TLE refresh job | TypeScript | Node script (`npm run tle:fetch`) | Worker cron trigger |
| Tests | TypeScript + Vitest | Node | CI (optional) |
| Eval analysis / charts | TypeScript | Node script → CSV/JSON → results page | n/a |

### Why Hono for the API
**Hono** is a small TypeScript web framework that runs **the same code on Node.js and on Cloudflare Workers**. So:
- Develop and debug the API locally as a normal Node.js server
- Deploy the exact same routes to Cloudflare for **free** on your domain → [[13 Cloudflare Hosting]]
- No need to pay for a Node.js host (free Node hosts either sleep after inactivity or are no longer free)

Rule for the shared API code: use only web-standard APIs (`fetch`, `Request`, `Response`, `crypto.subtle`) and no Node-only modules (`fs`, `net`), so it runs in both places. Storage goes behind a small interface: an in-memory/file cache on Node, KV on Cloudflare.

If you ever prefer a real Node.js server in production (e.g. on a VPS or home server), the same Hono app runs there unchanged. Cloudflare stays the free default → [[12 Platforms and Cost]]

## Libraries
| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict mode) | Catches unit mix-ups (deg/rad, km/m, s/ms) |
| Runtime | **Node.js 24** + npm | Dev server, API locally, scripts, tests |
| Monorepo | npm workspaces | `app`, `api`, `shared` packages |
| Build (app) | **Vite** | Fast, static output for Pages |
| API framework | **Hono** | One codebase for Node + Workers |
| UI | Plain TS + Canvas 2D (optionally Preact for menus) | The overlay is custom drawing anyway |
| Satellites | **satellite.js** (SGP4, ships TS types) | → [[07 Math - SGP4 Propagation]] |
| Sun/Moon/planets | **astronomy-engine** (TS) | Calibration targets, sunlit test → [[09 Calibration]] |
| Vector/quaternion math | **gl-matrix** (or hand-written) | → [[08 Phone Sensors and Camera Projection]] |
| Image processing | Plain TS on `ImageData` first; **OpenCV.js** if Hough lines needed | → [[10 Night Mode Orbit Fit]] |
| Background compute | Web Workers (browser) | Keep 60 fps |
| Tests | **Vitest** | Math vs reference values → [[11 Accuracy Evaluation]] |
| Lint/format | ESLint + Prettier | Optional, cheap to add |
| Hosting | **Cloudflare Pages + Workers + KV + Cron** via `wrangler` | → [[13 Cloudflare Hosting]] |
| Dev on phone | **cloudflared tunnel** (HTTPS URL to your PC) | Sensors and camera need HTTPS |
| PWA | `vite-plugin-pwa` | Add to home screen, offline TLEs → [[12 Platforms and Cost]] |
| Optional native wrap | Capacitor | Only if a store app is wanted later |

## Repo layout (npm workspaces)
```
SkyTrace-AR/
  package.json            // workspaces: app, api, shared
  tsconfig.base.json
  packages/
    shared/               // code used by BOTH app and api
      src/types.ts        // Aircraft, Tle, LookAngle...
      src/geo.ts          // geodetic↔ECEF↔ENU, az/el
    app/                  // the phone PWA (Vite)
      src/main.ts         // start button, permissions, loop
      src/sensors/orientation.ts
      src/sensors/location.ts
      src/camera/video.ts
      src/math/projection.ts   // az/el → pixel
      src/sats/sgp4.worker.ts  // satellite.js propagation
      src/sats/visibility.ts   // sunlit / dark test
      src/aircraft/feed.ts     // fetch + dead-reckoning
      src/calib/calibrate.ts
      src/night/detector.ts    // stacking, blobs, tracks
      src/night/match.ts       // track ↔ predicted orbit
      src/eval/logger.ts
      src/ui/overlay.ts
    api/                  // Hono app
      src/app.ts          // routes (shared by both runtimes)
      src/node.ts         // entry for Node.js (local dev)
      src/worker.ts       // entry for Cloudflare (fetch + scheduled)
      src/sources/opensky.ts
      src/sources/adsblol.ts
      src/sources/celestrak.ts
      wrangler.toml
  scripts/                // Node.js helper scripts
    fetch-tle.ts          // download TLEs for offline tests
    analyze-eval.ts       // eval CSV → error stats
  tests/
```

## npm scripts (planned)
| Command | Does |
|---|---|
| `npm run dev` | Vite (app) + Node API together; Vite proxies `/api` to the Node server |
| `npm run tunnel` | `cloudflared` HTTPS URL to open on the phone |
| `npm test` | Vitest for `shared` and `app` math |
| `npm run build` | Build the app + type-check everything |
| `npm run deploy` | `wrangler` deploy of Pages + Worker |

Start building from [[15 Implementation Plan 48h]].
