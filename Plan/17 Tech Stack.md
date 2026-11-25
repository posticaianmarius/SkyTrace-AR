---
tags: [sky-ar, stack]
---
# 17 Tech Stack

Back to [[00 Home]] · Architecture: [[03 Architecture]]

All free and open source.

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Fewer math/unit bugs |
| Build | **Vite** | Fast, simple, static output for Pages |
| UI | Plain TS + Canvas 2D (optionally Preact for menus) | Minimal; the overlay is custom drawing anyway |
| Satellites | **satellite.js** (SGP4) | → [[07 Math - SGP4 Propagation]] |
| Sun/Moon/planets | **astronomy-engine** | Calibration targets, sunlit test → [[09 Calibration]] |
| Vector/quaternion math | **gl-matrix** (or hand-written) | Rotation matrices → [[08 Phone Sensors and Camera Projection]] |
| Image processing | Plain JS on `ImageData` first; **OpenCV.js** if Hough lines needed | → [[10 Night Mode Orbit Fit]] |
| Background compute | Web Workers | Keep 60 fps |
| Tests | **Vitest** | Math vs reference values → [[11 Accuracy Evaluation]] |
| Hosting | **Cloudflare Pages + Pages Functions/Worker + KV + Cron** | → [[13 Cloudflare Hosting]] |
| Dev on phone | `wrangler pages dev` + **cloudflared tunnel** (HTTPS) | Sensors need HTTPS |
| PWA | `vite-plugin-pwa` | Add to home screen, offline TLEs → [[12 Platforms and Cost]] |
| Optional native wrap | Capacitor | Only if a store app is wanted later |

## Proposed repo layout
```
sky-ar/
  src/
    main.ts              // start button, permissions, loop
    sensors/orientation.ts
    sensors/location.ts
    camera/video.ts
    math/geo.ts          // geodetic↔ECEF↔ENU, az/el
    math/projection.ts   // az/el → pixel
    sats/sgp4.worker.ts  // satellite.js propagation
    sats/visibility.ts   // sunlit / dark test
    aircraft/feed.ts     // fetch + dead-reckoning
    calib/calibrate.ts
    night/detector.ts    // stacking, blobs, tracks
    night/match.ts       // track ↔ predicted orbit
    eval/logger.ts
    ui/overlay.ts
  functions/api/         // Cloudflare Pages Functions
    aircraft.ts
    tle.ts
  worker-cron/           // CelesTrak refresh → KV
  tests/
```

Start building from [[15 Implementation Plan 48h]].
