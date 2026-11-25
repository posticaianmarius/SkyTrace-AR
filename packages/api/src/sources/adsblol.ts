import type { Aircraft } from '@skytrace/shared';
import { USER_AGENT } from './common';

const FT = 0.3048;
const KT = 0.514444;
const FPM = FT / 60;

interface AdsbLolAc {
  hex: string;
  flight?: string;
  t?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | 'ground';
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  seen_pos?: number;
}

/** adsb.lol open data (ODbL). Radius is in km, converted to nautical miles. */
export async function fetchAdsbLol(lat: number, lon: number, radiusKm: number): Promise<Aircraft[]> {
  const nm = Math.min(250, Math.round(radiusKm / 1.852));
  const url = `https://api.adsb.lol/v2/point/${lat.toFixed(3)}/${lon.toFixed(3)}/${nm}`;
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`adsb.lol HTTP ${res.status}`);
  const json = (await res.json()) as { ac?: AdsbLolAc[]; now?: number };
  const nowSec = (json.now ?? Date.now()) / 1000;

  const out: Aircraft[] = [];
  for (const a of json.ac ?? []) {
    if (a.lat == null || a.lon == null || a.alt_baro === 'ground') continue;
    const altFt = a.alt_geom ?? (typeof a.alt_baro === 'number' ? a.alt_baro : undefined);
    if (altFt == null) continue;
    out.push({
      id: a.hex.toLowerCase(),
      cs: (a.flight ?? '').trim(),
      lat: a.lat,
      lon: a.lon,
      altM: altFt * FT,
      spdMs: (a.gs ?? 0) * KT,
      trkDeg: a.track ?? 0,
      vrMs: (a.geom_rate ?? a.baro_rate ?? 0) * FPM,
      t: nowSec - (a.seen_pos ?? 0),
      ...(a.t ? { type: a.t } : {}),
    });
  }
  return out;
}
