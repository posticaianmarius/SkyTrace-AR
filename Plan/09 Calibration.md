---
tags: [sky-ar, accuracy]
---
# 09 Calibration (the accuracy multiplier)

Back to [[00 Home]] · Fixes errors from [[08 Phone Sensors and Camera Projection]] · Measured by [[11 Accuracy Evaluation]]

## Why
Phone compasses are typically off by **5–15°** (and much worse near cars, steel buildings, magnets in phone cases). The math in [[06 Math - Positions to Az El]] and [[07 Math - SGP4 Propagation]] is accurate to < 0.1°. **So the compass is ~99% of the label error.** Calibration is how we beat the "open projects already do this" risk → [[16 Risks and Mitigations]]

## Methods (cheap to expensive)
1. **Figure-8 prompt**: ask the user to wave the phone, which helps the OS calibrate the magnetometer. Free, but limited gain
2. **Tap a known object (main method)**:
   - Show a target list: ☀️ Sun (day, **don't look at it directly**, just aim the camera), 🌙 Moon, bright planets (Venus, Jupiter), or a **labelled aircraft** you can clearly see
   - The user taps the real object in the camera image
   - We know its true Az/El (from `astronomy-engine` or our own aircraft math) and the pixel they tapped → solve for the **yaw offset** (and pitch offset)
   - One tap fixes heading, two taps also give **FOV/focal length** and roll
3. **Auto-calibration from streaks** (night): when [[10 Night Mode Orbit Fit]] matches a streak to a satellite, the difference between predicted and observed track = the correction. Continuous and automatic, which makes for a great demo
4. **Horizon/gravity**: pitch and roll from the accelerometer are already good (±1°), so mostly only yaw needs fixing

## Solving the offset (1 reference)
```
predicted pixel p̂ = project(R_offset · R_sensor, azEl_true)
find yaw δ minimizing |p̂ − p_tap|   (1-D: closed form or a few Newton steps)
```
With multiple references → small least-squares (yaw, pitch, roll, f). A Gauss-Newton with 4 parameters is ~30 lines of JS.

## Persistence
- Store the offset per session. It drifts as the magnetometer re-calibrates, so show a "recalibrate" hint if gyro-integrated heading diverges from compass heading by > 3°
- Optionally **lock to gyro** after calibration: integrate gyro rotation and ignore the compass for ~minutes (gyro drift ~1°/min is less than compass noise)

## Expected result
| Stage | Typical label error |
|---|---|
| Raw sensors | 5–15° |
| + figure-8 | 3–10° |
| + 1-tap Sun/Moon | ~1–2° |
| + streak auto-fit / multi-point | < 1° |
