---
tags: [sky-ar, math, space]
---
# 07 Math: SGP4 Propagation

Back to [[00 Home]] · Input: [[05 Data Source - Satellites TLE]] · Output: [[06 Math - Positions to Az El]]

## What SGP4 does
**SGP4** (Simplified General Perturbations 4) is the standard model that matches TLEs. Given TLE + time, it returns position and velocity in the **TEME** frame. You **must** use SGP4 with TLEs; using a "pure Kepler" orbit gives wrong answers.

## Library
**`satellite.js`** (MIT, JavaScript, ~40 kB):
```js
import * as sat from 'satellite.js';
const satrec = sat.twoline2satrec(line1, line2);
const pv = sat.propagate(satrec, new Date());           // TEME km
const gmst = sat.gstime(new Date());
const ecf = sat.eciToEcf(pv.position, gmst);
const obs = { longitude: sat.degreesToRadians(lon),
              latitude:  sat.degreesToRadians(lat),
              height: altKm };
const look = sat.ecfToLookAngles(obs, ecf);            // azimuth, elevation, rangeSat (rad, km)
```
Performance: ~1–5 µs per propagation, so 10 000 satellites at 1 Hz is fine; run in a **Web Worker** thread to keep the UI at 60 fps.

## Is it visible to the eye? (key for night mode)
A satellite is visible when:
1. Elevation > ~10°
2. **Observer is in darkness**: Sun elevation < −6° (civil twilight)
3. **Satellite is sunlit**: not in Earth's shadow

Shadow test (cylindrical approximation, good enough):
```
s = unit vector Earth→Sun (from astronomy-engine)
p = satellite ECI position
if dot(p, s) < 0 and |p − dot(p,s)·s| < R_earth → in shadow
```
This lets the UI say "🛰 visible now", and tells [[10 Night Mode Orbit Fit]] which satellites to look for.

## Precomputing the track
For the night-mode fit we also need the **predicted path across the sky** over ±60 s: propagate at 1 s steps → list of (t, az, el). Used to match detected streaks → [[10 Night Mode Orbit Fit]]

## Validation
Compare against Heavens-Above / Stellarium / N2YO for the same moment → [[11 Accuracy Evaluation]]. Expected difference: < 0.1°.
