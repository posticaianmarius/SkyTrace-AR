---
tags: [sky-ar, brief]
---
# 01 Challenge Brief

Back to [[00 Home]]

## The spec, field by field
The spec row had these fields in this order: *Challenge · Hook · Source · Domain · Hardware · Difficulty · Wow · Judged on · Build in 48h · Tools · Risks*

| Field | Value | What it means for us |
|---|---|---|
| **Challenge** | ADS-B and satellite streaks annotated on a phone camera | Live camera view with labels drawn over planes and satellites |
| **Hook** | Point a phone at the sky and see every plane and satellite labelled on the camera view | The demo moment. It has to work at first try in front of judges. See [[02 Concept and User Flow]] |
| **Source** | Out of the box | Our own idea, not tied to a sponsor dataset |
| **Domain** | Space | Satellites are the "space" part; aircraft are the easy, always-visible part |
| **Hardware** | Phone | Camera + GPS + compass + gyroscope. See [[08 Phone Sensors and Camera Projection]] |
| **Difficulty** | 2 (out of 5, presumably) | Low-to-medium. The core is well-understood math plus open libraries |
| **Wow** | 4 | High visual payoff. A night-time streak matched to a named satellite is the strongest moment |
| **Judged on** | Label accuracy vs reference | Labels must sit *on* the object. We need a measurable error in degrees. See [[11 Accuracy Evaluation]] |
| **Build in 48h** | A phone AR overlay of ADS-B aircraft and satellite passes with a night-mode orbit fit | Must-have scope: aircraft overlay, satellite overlay, night-mode fit (fit can be the stretch). See [[15 Implementation Plan 48h]] |
| **Tools** | OpenSky ADS-B, CelesTrak, SGP4, Skylight | [[04 Data Source - ADS-B Aircraft]], [[05 Data Source - Satellites TLE]], [[07 Math - SGP4 Propagation]], [[14 Prior Art]] |
| **Risks** | Open projects already do most of it, and the night-mode orbit fit depends on clear skies | Differentiate on **accuracy + calibration + streak fit**. Have a fallback demo for cloudy nights. See [[16 Risks and Mitigations]] |

## In plain words
1. The phone knows **where it is** (GPS) and **where it points** (compass + gyro).
2. The internet tells us **where every plane is** (ADS-B) and **the orbit of every satellite** (TLE → SGP4).
3. Math converts each object into a **direction in your sky** (azimuth/elevation), then into a **pixel on the camera image**.
4. We draw a label there.
5. At night, satellites appear as **moving dots/streaks**. We detect them in the camera frames and **fit** them to the predicted orbit. That confirms the label and corrects the compass error.

## What "winning" looks like
- Labels within **~2° or better** of the real object after calibration (raw compass gives 5–15°)
- Smooth 30–60 fps overlay
- A live or recorded demo of a satellite streak auto-identified
- An accuracy chart comparing our labels to a reference → [[11 Accuracy Evaluation]]
