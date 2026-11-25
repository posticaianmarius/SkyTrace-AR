---
tags: [sky-ar, ux]
---
# 02 Concept and User Flow

Back to [[00 Home]] · Brief: [[01 Challenge Brief]]

## User flow
1. **Open the website** (e.g. `sky.yourdomain.com`) in Safari or Chrome. Optionally "Add to Home Screen" so it behaves like an app → [[12 Platforms and Cost]]
2. **Tap "Start"**. A user tap is required for the iOS camera and motion permissions → [[08 Phone Sensors and Camera Projection]]
3. Grant **Camera**, **Location**, **Motion & Orientation**
4. **Calibrate** (10 seconds): tap the Sun/Moon/a bright star, or slowly draw a figure-8 → [[09 Calibration]]
5. Point at the sky → labels appear:
   - ✈️ Aircraft: callsign, altitude, speed, distance, airline (data from [[04 Data Source - ADS-B Aircraft]])
   - 🛰️ Satellites: name, NORAD ID, altitude, range, whether sunlit/visible (data from [[05 Data Source - Satellites TLE]])
6. **Off-screen arrows** point to objects outside the view ("ISS rising in 2 min ←")
7. **Night mode** (toggle): red UI, darker overlay, streak detection on → [[10 Night Mode Orbit Fit]]
8. **Tap a label** → details card (route, orbit ground track, next pass)
9. **Eval mode** (hidden, for judges): logs predicted vs observed positions → [[11 Accuracy Evaluation]]

## Screen layout
```
┌───────────────────────────────┐
│ ☰  N 352°  El 41°   🌙  ⚙️    │  ← heading / elevation / night toggle
│                               │
│        ✈ RYR4KD               │
│        FL370 · 12 km          │
│              ·                │
│                    🛰 ISS     │
│                    420 km ↗   │
│  ←Starlink-3021               │  ← off-screen indicator
│                               │
│ [Calibrate] [Filter] [Eval]   │
└───────────────────────────────┘
```

## Filters
- Aircraft: max distance (default 100 km), min altitude
- Satellites: "Visible tonight" (CelesTrak `visual` group, ~150 bright ones), Stations (ISS, Tiangong), Starlink (thousands, so throttle), all active
- Only show satellites **sunlit while the observer is in darkness**: those are the ones the eye can actually see → [[07 Math - SGP4 Propagation]]

Related: [[03 Architecture]]
