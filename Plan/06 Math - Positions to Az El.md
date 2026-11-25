---
tags: [sky-ar, math]
---
# 06 Math: Positions → Azimuth / Elevation

Back to [[00 Home]] · Inputs from [[04 Data Source - ADS-B Aircraft]] and [[07 Math - SGP4 Propagation]] · Output goes to [[08 Phone Sensors and Camera Projection]]

## Goal
For each object, answer: **"In which direction of my sky is it?"**
- **Azimuth** (Az): compass direction, 0° = North, 90° = East
- **Elevation** (El): angle above the horizon, 0° = horizon, 90° = straight up
- **Range**: distance (for the label and for sizing)

## Steps
1. **Observer** (phone GPS) → ECEF (Earth-Centered, Earth-Fixed XYZ), using the WGS-84 ellipsoid
2. **Object** → ECEF
   - Aircraft: lat, lon, `geo_altitude` → ECEF (same formula)
   - Satellite: SGP4 gives TEME → rotate by Greenwich sidereal time → ECEF (`satellite.eciToEcf`)
3. **Difference vector** `d = obj − obs` (ECEF)
4. Rotate `d` into the local **ENU** frame (East, North, Up) at the observer:
```
e = -sinλ·dx + cosλ·dy
n = -sinφ·cosλ·dx - sinφ·sinλ·dy + cosφ·dz
u =  cosφ·cosλ·dx + cosφ·sinλ·dy + sinφ·dz
```
5. `Az = atan2(e, n)`, `El = atan2(u, sqrt(e²+n²))`, `range = |d|`

`satellite.js` already has `ecfToLookAngles(observerGd, ecf)` for satellites. We reuse the same ENU code for aircraft so both go through one tested function.

## Geodetic → ECEF (WGS-84)
```
a = 6378137, e² = 6.69437999014e-3
N = a / sqrt(1 - e²·sin²φ)
X = (N + h)·cosφ·cosλ
Y = (N + h)·cosφ·sinλ
Z = (N·(1-e²) + h)·sinφ
```
⚠️ **Altitude datum**: phone GPS altitude and ADS-B `geo_altitude` are usually ellipsoid-ish vs MSL. The difference is ~50 m, which is negligible for objects km away. Don't over-engineer.

## Corrections worth knowing (mostly ignorable)
- **Atmospheric refraction** lifts objects ~0.5° at the horizon, ~0 above 20°. Add the simple Bennett formula; it costs nothing
- **Light time** for satellites: ms, ignore
- **Aircraft data latency**: NOT ignorable. Dead-reckon, see [[04 Data Source - ADS-B Aircraft]]

## Testing
- Unit test against known values: ISS az/el from Heavens-Above or Stellarium for a fixed time/place → [[11 Accuracy Evaluation]]
- Sun/Moon az/el from `astronomy-engine` must match timeanddate.com. These are also used for [[09 Calibration]]
