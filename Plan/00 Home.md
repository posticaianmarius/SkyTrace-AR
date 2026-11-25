---
tags: [moc, sky-ar]
status: planning
created: 2026-11-25
---
# 🛰️ Sky AR — Home (Map of Content)

> Point a phone at the sky and see every plane and satellite labelled on the camera view.

This vault is the plan for the challenge. Start here, then follow the links. Open **Graph view** (Ctrl+G) or the canvas [[Sky AR Map.canvas|Sky AR Map]] to see how the notes connect.

## 1. Understand the task
- [[01 Challenge Brief]]: what was asked, how it is judged, and what each field in the spec means
- [[02 Concept and User Flow]]: what the user sees and does
- [[14 Prior Art]]: open projects that already do parts of this

## 2. How it works (the technical core)
- [[03 Architecture]]: the full pipeline on one page
- [[04 Data Source - ADS-B Aircraft]]: OpenSky and free fallbacks
- [[05 Data Source - Satellites TLE]]: CelesTrak orbital elements
- [[06 Math - Positions to Az El]]: Earth coordinates → "where in my sky"
- [[07 Math - SGP4 Propagation]]: orbit elements → satellite position now
- [[08 Phone Sensors and Camera Projection]]: "where in my sky" → pixel on screen
- [[09 Calibration]]: fixing the compass, the biggest error source
- [[10 Night Mode Orbit Fit]]: detecting satellite streaks and fitting them to orbits (the "wow" feature)
- [[11 Accuracy Evaluation]]: "label accuracy vs reference", which is how we get judged

## 3. How to ship it
- [[12 Platforms and Cost]]: iPhone + Android **for free**? (yes, as a web app)
- [[13 Cloudflare Hosting]]: using your domain (Pages + Workers, free tier)
- [[15 Implementation Plan 48h]]: hour-by-hour build plan with task checkboxes
- [[16 Risks and Mitigations]]
- [[17 Tech Stack]]

## Decision summary
| Question | Decision |
|---|---|
| Native app or web? | **Web app (PWA)**. One codebase runs on iPhone and Android, costs nothing, and needs no app store. See [[12 Platforms and Cost]] |
| Where hosted? | **Cloudflare Pages** on your domain, plus a **Worker** as data proxy/cache. See [[13 Cloudflare Hosting]] |
| Language / runtime | **TypeScript** everywhere; **Node.js** for dev server, local API (Hono), tests and scripts. See [[17 Tech Stack]] |
| Satellite math | `satellite.js` (SGP4 in JS). See [[07 Math - SGP4 Propagation]] |
| Aircraft data | OpenSky through the Worker, with adsb.lol as fallback. See [[04 Data Source - ADS-B Aircraft]] |
| AR approach | Camera `<video>` + sensor orientation + `<canvas>` overlay (no WebXR, so it works on iOS). See [[08 Phone Sensors and Camera Projection]] |
| Hardest problem | Compass accuracy. Solved with [[09 Calibration]] |
