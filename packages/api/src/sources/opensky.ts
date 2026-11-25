import type { Aircraft } from '@skytrace/shared';
import { USER_AGENT, type BBox } from './common';

const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const STATES_URL = 'https://opensky-network.org/api/states/all';

export interface OpenSkyCredentials {
  clientId?: string;
  clientSecret?: string;
}

let cachedToken: { token: string; expires: number } | null = null;

async function getToken(creds: OpenSkyCredentials): Promise<string | null> {
  if (!creds.clientId || !creds.clientSecret) return null; // anonymous access
  if (cachedToken && cachedToken.expires > Date.now() + 30_000) return cachedToken.token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`OpenSky token HTTP ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return cachedToken.token;
}

// State vector indices, see https://openskynetwork.github.io/opensky-api/rest.html
type StateVector = [
  string, // 0 icao24
  string | null, // 1 callsign
  string, // 2 origin_country
  number | null, // 3 time_position
  number, // 4 last_contact
  number | null, // 5 longitude
  number | null, // 6 latitude
  number | null, // 7 baro_altitude (m)
  boolean, // 8 on_ground
  number | null, // 9 velocity (m/s)
  number | null, // 10 true_track (deg)
  number | null, // 11 vertical_rate (m/s)
  unknown, // 12 sensors
  number | null, // 13 geo_altitude (m)
  ...unknown[],
];

export async function fetchOpenSky(bbox: BBox, creds: OpenSkyCredentials): Promise<Aircraft[]> {
  const token = await getToken(creds);
  const url = new URL(STATES_URL);
  url.searchParams.set('lamin', bbox.lamin.toFixed(3));
  url.searchParams.set('lomin', bbox.lomin.toFixed(3));
  url.searchParams.set('lamax', bbox.lamax.toFixed(3));
  url.searchParams.set('lomax', bbox.lomax.toFixed(3));
  const headers: Record<string, string> = { 'user-agent': USER_AGENT };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`);
  const json = (await res.json()) as { time: number; states: StateVector[] | null };

  const out: Aircraft[] = [];
  for (const s of json.states ?? []) {
    const lon = s[5];
    const lat = s[6];
    if (lat == null || lon == null || s[8]) continue; // no position or on ground
    const alt = s[13] ?? s[7];
    if (alt == null) continue;
    out.push({
      id: s[0],
      cs: (s[1] ?? '').trim(),
      lat,
      lon,
      altM: alt,
      spdMs: s[9] ?? 0,
      trkDeg: s[10] ?? 0,
      vrMs: s[11] ?? 0,
      t: s[3] ?? s[4],
    });
  }
  return out;
}
