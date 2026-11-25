---
tags: [sky-ar, data]
---
# 04 Data Source: ADS-B Aircraft

Back to [[00 Home]] · Used by [[03 Architecture]]

## What ADS-B is
Aircraft broadcast their GPS position, altitude, speed and callsign about twice a second on 1090 MHz. Volunteer receivers collect this and publish it online. Each aircraft has a 24-bit **ICAO address** (`icao24`).

## Primary: OpenSky Network REST API
- Endpoint: `GET https://opensky-network.org/api/states/all?lamin=..&lomin=..&lamax=..&lomax=..`
- Use a **bounding box** around the user (about ±1° lat/lon ≈ 100 km), which costs fewer API credits
- Returns a "state vector" per aircraft: `icao24, callsign, origin_country, time_position, last_contact, longitude, latitude, baro_altitude, on_ground, velocity, true_track, vertical_rate, sensors, geo_altitude, squawk, spi, position_source`
- **Use `geo_altitude`** (GPS height, meters) for the math, not `baro_altitude` → [[06 Math - Positions to Az El]]
- Limits: anonymous users get a small daily credit budget and 10 s resolution. A free account gets more. New accounts use **OAuth2 client credentials** (client id + secret), so the secret must live in the **Cloudflare Worker**, never in the phone code → [[13 Cloudflare Hosting]]
- Non-commercial / research use. A hackathon is fine
- ⚠️ Verify the current limits and auth flow on the OpenSky docs on day 1 (they changed in 2025)

## Fallbacks (free, no key)
| Source | Endpoint style | Note |
|---|---|---|
| **adsb.lol** | `https://api.adsb.lol/v2/point/{lat}/{lon}/{radius_nm}` | Open data (ODbL), no key, good coverage in Europe |
| airplanes.live | `/v2/point/{lat}/{lon}/{radius}` | Free for non-commercial, rate limited |
| adsb.fi | similar | Open data |

The Worker normalizes all of them into one format:
```json
{ "id":"4b1814", "cs":"SWR12", "lat":46.9, "lon":7.4, "alt_m":10970,
  "spd_ms":231, "trk_deg":82, "vr_ms":0, "t":1764081234 }
```

## Latency and dead-reckoning
Data is typically **5–15 s old**. A jet at 230 m/s moves ~2–3 km in that time, which at 10 km distance is **10°+ of error**. So we must **extrapolate to "now"**:
```
dt = now - t
lat += (spd * cos(trk) * dt) / R_earth   (radians)
lon += (spd * sin(trk) * dt) / (R_earth * cos(lat))
alt += vr * dt
```
This is one of the biggest accuracy wins → [[11 Accuracy Evaluation]]

## Bonus (optional)
- Route/airline lookup from the callsign (e.g. adsbdb.com free API), for nicer labels
- Own receiver: an RTL-SDR dongle (~€30) + dump1090 gives zero-latency local data. Not needed, but a nice "wow" if available

Risks → [[16 Risks and Mitigations]]
