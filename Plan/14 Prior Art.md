---
tags: [sky-ar, research]
---
# 14 Prior Art (what exists, how we differ)

Back to [[00 Home]] · Linked risk: "open projects already do most of it" → [[16 Risks and Mitigations]]

| Project | What it does | Use for us |
|---|---|---|
| **Flightradar24 AR / Plane Finder AR** (commercial apps) | Camera AR labels for aircraft | Reference for UX and for [[11 Accuracy Evaluation]] |
| **Stellarium / Stellarium Mobile** (open source desktop) | Sky map incl. satellites from TLEs | **Ground truth** for satellite az/el |
| **Heavens-Above** | Satellite pass predictions | Pass times, references |
| **Sky Guide / SkyView / Star Walk** | Phone AR star maps | UX reference; shows phone-sensor AR is viable |
| **satellite.js** | SGP4 in JS | Core library → [[07 Math - SGP4 Propagation]] |
| **OpenSky Network** | ADS-B data API | [[04 Data Source - ADS-B Aircraft]] |
| **CelesTrak** | TLE/OMM catalog | [[05 Data Source - Satellites TLE]] |
| **"Skylight"** (listed in the spec's Tools) | ⚠️ Unclear which project the spec means. Possibly a sky-AR/satellite tool. **Verify with the organizers on day 1** | TBD |
| Open-source GitHub "ADS-B AR" / "satellite AR" demos | Hobby projects with web or Android overlays | Code reference; confirms feasibility |
| Satellite streak detection research (e.g. astro image pipelines, ASTRiDE) | Detecting streaks in astronomical images | Algorithms for [[10 Night Mode Orbit Fit]] |

## How we stand out
1. **Aircraft + satellites in one view** (most apps do one or the other)
2. **Measured accuracy** with a published error chart → [[11 Accuracy Evaluation]]
3. **Calibration by tapping Sun/Moon/aircraft** → [[09 Calibration]]
4. **Night-mode streak detection that auto-identifies the satellite and corrects the compass** → [[10 Night Mode Orbit Fit]]
5. **Zero install, free, both platforms** → [[12 Platforms and Cost]]
