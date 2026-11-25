---
tags: [sky-ar, implementation, plan]
---
# 15 Implementation Plan (48 h)

Back to [[00 Home]] · Stack: [[17 Tech Stack]] · Risks: [[16 Risks and Mitigations]]

> **Status (2026-11-25):** Phases 1–4 are built in the repo (`packages/shared`, `packages/api`, `packages/app`, 27 unit tests). Tested in a desktop browser with live OpenSky data; **not yet tested on a real phone or deployed**. CelesTrak was down during the build, so the API falls back to a short list of bright satellites. Next: Phase 5 (night mode + recorder/replay).

Principle: **always have a working demo**. Each phase ends with something that runs on a real phone.

## Phase 0: Before the clock starts (prep, ~2 h)
- [ ] Create OpenSky account + API client credentials → [[04 Data Source - ADS-B Aircraft]]
- [ ] Confirm what "Skylight" means → [[14 Prior Art]]
- [ ] Check weather + ISS/bright pass times for both nights (Heavens-Above)
- [ ] Repo + Cloudflare Pages project + subdomain `sky.<domain>` → [[13 Cloudflare Hosting]]
- [ ] Test phones: at least one iPhone + one Android; tripod/phone holder
- [ ] Install Stellarium (reference) → [[11 Accuracy Evaluation]]

## Phase 1 (h 0–6): Skeleton on the phone
- [ ] npm workspaces (`app`, `api`, `shared`), TypeScript strict, Vite app + Hono API on Node.js → [[17 Tech Stack]]
- [ ] Deploy "hello" to Pages + API Worker over HTTPS
- [ ] Start button → request camera, location, motion permissions (iOS flow!) → [[08 Phone Sensors and Camera Projection]]
- [ ] Full-screen back-camera `<video>` + `<canvas>` overlay
- [ ] Debug HUD: lat/lon, heading, pitch, roll, fps
- [ ] **Milestone:** a fixed dot "North, 30° up" shows in the right place on both phones

## Phase 2 (h 6–14): Satellites
- [ ] Worker `/api/tle` + cron → KV → [[05 Data Source - Satellites TLE]]
- [ ] `satellite.js` in a Web Worker; Az/El for all sats in `visual` + `stations` → [[07 Math - SGP4 Propagation]]
- [ ] Projection + labels + off-screen arrows → [[06 Math - Positions to Az El]]
- [ ] Sunlit/visible flag
- [ ] Unit tests vs Stellarium values (ISS, 5 others) → [[11 Accuracy Evaluation]]
- [ ] **Milestone:** ISS label in the right direction vs Stellarium

## Phase 3 (h 14–22): Aircraft
- [ ] Worker `/api/aircraft` (OpenSky OAuth + adsb.lol fallback + 10 s cache) → [[04 Data Source - ADS-B Aircraft]]
- [ ] Dead-reckoning to "now"
- [ ] Aircraft labels (callsign, alt, distance), label decluttering
- [ ] **Milestone:** point at a real plane outside, label within a few degrees

## Phase 4 (h 22–30): Calibration + accuracy
- [ ] Sun/Moon/planet positions (`astronomy-engine`) → [[09 Calibration]]
- [ ] Tap-to-calibrate (yaw), then 2-point (yaw/pitch/roll/FOV)
- [ ] Sensor smoothing (gyro + compass fusion)
- [ ] Eval mode: tap real object → log error → export CSV → [[11 Accuracy Evaluation]]
- [ ] **Milestone:** median error < 2° after calibration (day test on planes)

## Phase 5 (h 30–40): Night mode + orbit fit (wow)
- [ ] **Recorder + replay mode first** (video + sensor log + GPS + timestamps) so we can work even if it's cloudy → [[10 Night Mode Orbit Fit]]
- [ ] Red night UI, frame stacking, background subtraction, blob tracking
- [ ] Track → Az/El → match against sunlit satellites
- [ ] Fit attitude offset from the match → feed back into calibration
- [ ] Stretch: along-track time offset fit
- [ ] **Milestone:** one real (or recorded) streak auto-identified

## Phase 6 (h 40–48): Polish + demo
- [ ] PWA manifest + icon + offline cache of TLEs
- [ ] Results page: error chart raw → calibrated → streak-fit
- [ ] Record demo video (day planes + night sats)
- [ ] Slides: problem → how → accuracy numbers → live demo
- [ ] Freeze features at h 44; only bug fixes after

## If short on time, cut in this order
1. Level-2 orbit fit (time offset)
2. Starlink group (keep `visual` + `stations`)
3. Live streak detection (keep replay + synthetic)
4. Route/airline details
**Never cut:** satellites + aircraft overlay, tap calibration, accuracy numbers.

## Team split (if 2–3 people)
| Person | Owns |
|---|---|
| A | Sensors, projection, calibration, UI ([[08 Phone Sensors and Camera Projection]], [[09 Calibration]]) |
| B | Data + Worker + SGP4 + tests ([[04 Data Source - ADS-B Aircraft]], [[05 Data Source - Satellites TLE]], [[07 Math - SGP4 Propagation]]) |
| C | Night mode + evaluation + demo ([[10 Night Mode Orbit Fit]], [[11 Accuracy Evaluation]]) |
