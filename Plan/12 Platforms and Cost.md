---
tags: [sky-ar, platforms, cost]
---
# 12 Platforms and Cost: iPhone + Android for free?

Back to [[00 Home]]

## Short answer
**Yes, as a website (PWA).** It runs in Safari on iPhone and Chrome on Android, costs **€0**, needs no app store, no subscription, and no developer account. You host it on your Cloudflare domain for free → [[13 Cloudflare Hosting]]

Native apps are possible but **not free on iPhone** (see below).

## Options compared
| Option | iPhone | Android | Cost | 48h-friendly? |
|---|---|---|---|---|
| **Web app / PWA on your domain** ✅ | ✅ Safari (camera, GPS, compass work over HTTPS) | ✅ Chrome | **€0** (Cloudflare free tier) | ✅ Best |
| React Native / Expo, dev only | ✅ via the free **Expo Go** app (dev/testing) | ✅ Expo Go or APK | €0 to develop | OK, but can't hand to judges easily on iOS |
| Native Android APK (sideload) | ❌ | ✅ just send the .apk | €0 | OK |
| Google Play Store | n/a | ✅ | **$25 one-time** | No (review takes days) |
| Native iOS, free Apple ID | ✅ only on *your* phone, needs a **Mac + Xcode**, app **expires every 7 days** | n/a | €0 | Only for yourself |
| iOS App Store / TestFlight | ✅ | n/a | **$99 / year** | No (review) |

## What works in the browser (checked against our needs)
- Camera: ✅ both (HTTPS required)
- GPS: ✅ both
- Compass/orientation: ✅ both. iOS needs a **permission prompt triggered by a button tap**
- Running SGP4 for thousands of satellites: ✅ JS is plenty fast
- Image processing for streaks: ✅ Canvas / WebGL / OpenCV.js (WASM)
- Manual camera exposure / long exposure: ❌ not available in browsers, which is the one real limitation. We use frame stacking instead → [[10 Night Mode Orbit Fit]]
- Install to home screen + offline: ✅ PWA on both (iOS: Share → Add to Home Screen)

## Recommendation
1. Build the **PWA** first (covers 100% of the judged features)
2. If later you want a store app, wrap the same code with **Capacitor** (Android APK free, Play Store $25 once; iOS needs $99/yr)

## Running costs (all free tier)
| Service | Free allowance | Our use |
|---|---|---|
| Cloudflare Pages | unlimited static requests | site |
| Cloudflare Workers | 100 000 requests/day | API proxy |
| Workers KV | 100k reads/day, 1k writes/day | TLE cache |
| OpenSky | free account credits/day | via cache, stays well below |
| CelesTrak | free (be polite) | cron every 2–4 h |
| adsb.lol | free, open data | fallback |

Domain: you already own it, so the only cost is the yearly renewal you already pay.
