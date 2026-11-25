---
tags: [sky-ar, ar, sensors]
---
# 08 Phone Sensors and Camera Projection

Back to [[00 Home]] · Input: Az/El from [[06 Math - Positions to Az El]] · Corrected by [[09 Calibration]]

## Sensors (all available in the browser over HTTPS)
| Need | Web API | iPhone (Safari) | Android (Chrome) |
|---|---|---|---|
| Camera | `getUserMedia({video:{facingMode:'environment'}})` | ✅ | ✅ |
| Location | `navigator.geolocation.watchPosition` | ✅ | ✅ |
| Orientation | `DeviceOrientationEvent` | ✅ needs `DeviceOrientationEvent.requestPermission()` on a **tap**; gives `webkitCompassHeading` (true-north-ish) | ✅ use `deviceorientationabsolute` (absolute, magnetic-north based) |
| Gyro rate (smoothing) | `DeviceMotionEvent` | ✅ (same permission) | ✅ |
| WebXR AR | `navigator.xr` | ❌ not in Safari | ✅ but not needed |

→ We **don't** use WebXR; the "video + sensors + canvas" approach works on both. See [[12 Platforms and Cost]]

## Building the phone rotation
1. Read `alpha, beta, gamma` (Z-X'-Y'' Euler angles, W3C spec) → rotation matrix `R_device←world`
2. Account for **screen orientation** (`screen.orientation.angle`); lock to portrait to simplify
3. **Magnetic declination**: Android `alpha` is magnetic north. Add the local declination (from a small WMM lookup, or just a constant for the demo city, e.g. Romania ≈ +6° E). iOS `webkitCompassHeading` is magnetic too
4. Add the **calibration offset** (yaw, and optionally pitch/roll) → [[09 Calibration]]
5. **Smooth** with a complementary filter or slerp of quaternions (raw compass is jittery). Gyro for fast motion, compass for slow drift correction

## Projecting Az/El to a pixel
1. Az/El → unit vector in ENU: `v = [cos El·sin Az, cos El·cos Az, sin El]`
2. Rotate into the camera frame: `c = R_cam←world · v`. Camera looks along **−Z of the device** (out of the back)
3. If `c.z ≥ 0` (behind) → draw an edge arrow instead
4. Pinhole projection:
```
f = (videoWidth / 2) / tan(HFOV / 2)
x = cx + f · (c.x / -c.z)
y = cy − f · (c.y / -c.z)
```
5. Map from video pixels to screen pixels (the `<video>` is `object-fit: cover`, so account for the crop/scale)

## Field of view (HFOV)
The browser doesn't report the lens FOV. Options:
- A table of common phones (iPhone main cam ≈ 65–70° HFOV in 4:3, Android similar)
- **Measure it** in [[09 Calibration]]: tap two known stars/objects → solve for focal length
- Avoid the ultra-wide / zoom lens: request a resolution matching the main camera

## Rendering
- `<video>` full-screen, `<canvas>` on top, `requestAnimationFrame` loop
- Labels: dot + leader line + text box; declutter overlapping labels (simple greedy offset)
- Three.js is optional; Canvas 2D is enough and simpler

Error budget → [[11 Accuracy Evaluation]] · Risks → [[16 Risks and Mitigations]]
