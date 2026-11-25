---
tags: [sky-ar, data]
---
# 05 Data Source: Satellites (TLE / OMM from CelesTrak)

Back to [[00 Home]] · Used by [[03 Architecture]] · Feeds [[07 Math - SGP4 Propagation]]

## What a TLE is
A **Two-Line Element set** describes a satellite's orbit at a moment in time (the "epoch"). Example:
```
ISS (ZARYA)
1 25544U 98067A   26329.51782528  .00016717  00000-0  10270-3 0  9005
2 25544  51.6400 208.9163 0006317  69.9862  25.2906 15.49438371 12345
```
Feed it to **SGP4** to get the position at any time. Accuracy is roughly **1 km at epoch** and degrades a few km per day, which is fine for us (1 km at 500 km range ≈ 0.1°).

## CelesTrak GP API (free, no key)
- `https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle`: ~150 brightest, **best for the demo**
- `GROUP=stations`: ISS, Tiangong, etc.
- `GROUP=starlink`: ~7000+, impressive trains but heavy
- `GROUP=active`: all active (~10 000+)
- `FORMAT=json` gives OMM JSON, which `satellite.js` can also read (newer versions support `json2satrec`)

## Rules (important)
CelesTrak **blocks clients that download too often**. The data updates only about every 2 hours.
→ The Cloudflare Worker fetches each group **on a cron (every 2–4 h)** and stores it in **KV / Cache**. Phones only ever hit our Worker → [[13 Cloudflare Hosting]]

## Phone side
- Download once per session, store in `localStorage`/IndexedDB with a timestamp
- Parse into `satrec` objects once, then propagate every frame → [[07 Math - SGP4 Propagation]]

## Extras for labels
- Name, NORAD ID, from TLE
- Brightness (intrinsic magnitude) for the `visual` group, so we can show "naked-eye visible" vs "needs binoculars"
- Pass predictions ("ISS rises 21:04 NW") are a nice side panel

Related: [[14 Prior Art]] (Heavens-Above, Stellarium use the same data, which makes them good references for [[11 Accuracy Evaluation]])
