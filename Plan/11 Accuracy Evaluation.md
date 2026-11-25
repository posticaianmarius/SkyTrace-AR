---
tags: [sky-ar, accuracy, judging]
---
# 11 Accuracy Evaluation ("Label accuracy vs reference")

Back to [[00 Home]] · This is **how we are judged** ([[01 Challenge Brief]])

## What we measure
**Angular error** between where we draw the label and where the object really is, in degrees (and in pixels).

## Error budget (where error comes from)
| Source | Typical size | Fixed by |
|---|---|---|
| Compass heading | 5–15° | [[09 Calibration]] |
| Camera FOV guess | 1–3° at the frame edge | [[09 Calibration]] (2-point) |
| Aircraft data latency (5–15 s) | 2–15° for nearby jets | dead-reckoning in [[04 Data Source - ADS-B Aircraft]] |
| Sensor jitter | 0.5–2° | smoothing in [[08 Phone Sensors and Camera Projection]] |
| SGP4 / TLE age | < 0.1° | fresh TLEs from [[05 Data Source - Satellites TLE]] |
| GPS position | ≈ 0 | n/a |
| Refraction | ≤ 0.5° near horizon | formula in [[06 Math - Positions to Az El]] |

## Three levels of evaluation
### A. Math correctness (offline, deterministic)
- Fixed time + location → our Az/El for ISS and 5 other sats vs **Stellarium / Heavens-Above / N2YO**. Target < 0.1°
- Aircraft: our Az/El vs a hand computation from the same state vector (sanity) and vs FlightRadar24 playback
- Sun/Moon vs `astronomy-engine` / timeanddate
- These are **automated unit tests** (Vitest)

### B. On-screen accuracy (live)
- **Eval mode** in the app: user taps the *real* object in the image → we log `{t, object, predicted_px, tapped_px, error_deg, calibrated?}`
- Collect ~20–50 taps (planes by day, sats by night) → **chart: error before vs after calibration**
- Export JSON/CSV → a small results page on the website

### C. Night streak match (automatic)
- For each auto-detected streak matched to a satellite → error between observed track and predicted track. This is a fully **objective** reference that needs no human tapping. → [[10 Night Mode Orbit Fit]]

## Reference sources
- Stellarium (desktop/mobile, free): sky positions of sats and stars
- Heavens-Above: pass tables with az/el
- FlightRadar24 / ADS-B Exchange / adsb.lol map: aircraft ground truth
- Bright stars: fixed and perfect references for a night-time FOV/attitude check

## Deliverable for the judges
- A table + chart: *median error raw → calibrated → streak-fit*
- A short video with the overlay on real planes/sats
