---
tags: [sky-ar, risks]
---
# 16 Risks and Mitigations

Back to [[00 Home]] · Spec risk: *"Open projects already do most of it and the night-mode orbit fit depends on clear skies."*

| # | Risk | Likelihood | Impact | Mitigation | Note |
|---|---|---|---|---|---|
| 1 | **Cloudy nights** → no streaks to detect | High | High | Recorder + **replay mode**, synthetic streaks, record on any clear night beforehand | [[10 Night Mode Orbit Fit]] |
| 2 | "Open projects already do it" → low originality | Medium | Medium | Lead with **measured accuracy**, calibration, streak auto-ID, planes+sats combined | [[14 Prior Art]] |
| 3 | Compass error 5–15° → labels off | Certain | High | Tap calibration, gyro lock, streak auto-fit | [[09 Calibration]] |
| 4 | iOS permission quirks (motion permission needs tap, HTTPS) | High | Medium | Single "Start" button requesting everything; test iPhone on day 1 | [[08 Phone Sensors and Camera Projection]] |
| 5 | OpenSky rate limits / auth changes / downtime | Medium | High | Worker cache + **adsb.lol fallback** | [[04 Data Source - ADS-B Aircraft]] |
| 6 | CelesTrak blocks us for over-fetching | Low (with cache) | High | Cron every 3 h + KV; never call from phones | [[05 Data Source - Satellites TLE]] |
| 7 | Phone camera too insensitive for faint sats | High | Medium | Target ISS / bright `visual` sats / fresh Starlink trains; frame stacking; tripod | [[10 Night Mode Orbit Fit]] |
| 8 | No manual exposure in the browser | Certain | Low–Med | Frame stacking; mention native Capacitor plugin as future work | [[12 Platforms and Cost]] |
| 9 | Unknown camera FOV per phone | Medium | Medium | 2-point calibration solves focal length | [[09 Calibration]] |
| 10 | ADS-B latency → aircraft labels lag | High | Medium | Dead-reckoning; show "data age" | [[04 Data Source - ADS-B Aircraft]] |
| 11 | Magnetic interference indoors / near cars | High at venue | Medium | Demo outdoors; recalibration hint | [[09 Calibration]] |
| 12 | Performance with thousands of sats | Low | Medium | Web Worker, cull by elevation, Starlink optional | [[07 Math - SGP4 Propagation]] |
| 13 | "Skylight" tool unclear | Medium | Low | Ask organizers on day 1 | [[14 Prior Art]] |
| 14 | Demo-day no internet | Low | High | Cache TLEs offline (PWA); aircraft need data, so use phone hotspot | [[13 Cloudflare Hosting]] |

Plan reference: [[15 Implementation Plan 48h]]
