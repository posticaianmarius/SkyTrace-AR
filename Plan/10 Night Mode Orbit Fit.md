---
tags: [sky-ar, space, wow, stretch]
---
# 10 Night Mode Orbit Fit (the "wow" feature)

Back to [[00 Home]] · Uses [[07 Math - SGP4 Propagation]] · Feeds [[09 Calibration]] · Main risk: weather, see [[16 Risks and Mitigations]]

## Idea
At night, sunlit satellites are visible as **slowly moving points** (ISS: very bright; Starlink trains; ~mag 3–5 for others). The phone camera sees the brighter ones. We:
1. **Detect** moving points / streaks in the camera frames
2. **Fit** a straight line or great-circle arc through the detections over time
3. **Match** that track to the SGP4-predicted tracks of satellites currently sunlit and above the horizon
4. Show **"Detected: STARLINK-3021 ✓ (0.4° off)"** and use the offset to **auto-correct the compass**

## Detection pipeline (browser)
1. Grab frames from `<video>` into an offscreen canvas at reduced resolution (e.g. 640×480) at 10–15 fps
2. Hold the phone **steady** (tripod/lean on something). Use the gyro to reject frames while moving
3. **Frame stacking**: average/max-stack N frames to boost faint dots (poor man's long exposure). Browsers can't set real long exposure; iOS gives no manual exposure via web
4. **Background subtraction**: `diff = frame − median(last K frames)`, so stars stay fixed (over seconds) and satellites move
5. **Threshold + blob detection** → list of (t, x, y)
6. Link blobs over time (nearest neighbour) → track
7. Optional: **Hough transform** on a max-stack image to find a streak line (OpenCV.js `HoughLinesP`)

## Matching
- Convert pixel tracks → Az/El using the current camera rotation (inverse of [[08 Phone Sensors and Camera Projection]])
- For every candidate sat (sunlit, El > 10°, near the view): compare predicted direction of motion + angular speed + position
- Score = position error + direction error + speed error → best match below a threshold
- Angular speed is a strong discriminator: aircraft (blinking lights, slower or faster depending on distance) vs LEO sats (~0.5–1°/s overhead)

## Orbit "fit" (two levels)
- **Level 1 (48h target)**: fit the **camera attitude offset** (yaw/pitch/roll) so the predicted track overlays the observed one. This is calibration via satellites
- **Level 2 (stretch)**: fit an **along-track time offset** to the TLE (how early/late the satellite is vs prediction). Real orbit-determination feel, a good talking point for judges
- Level 3 (out of scope): initial orbit determination from angles only (Gauss method). Mention only

## Clear-sky dependency: fallback plan
- **Record a video** on a clear night beforehand (with sensor log + GPS + timestamps) → replay mode in the app runs the full pipeline offline. **Build replay mode early** → [[15 Implementation Plan 48h]]
- Synthetic mode: render fake streaks from SGP4 predictions + noise, which proves the pipeline works
- Check forecast & pass times (ISS pass = best demo) on Heavens-Above before the event

## Hardware tips
- Phone on a tripod or propped against something, lowest zoom, screen brightness low
- The ISS and Starlink trains shortly after launch are the easiest targets
