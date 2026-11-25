/** Observer or object position on the WGS-84 ellipsoid. */
export interface Geodetic {
  /** Latitude, degrees (+N). */
  lat: number;
  /** Longitude, degrees (+E). */
  lon: number;
  /** Height above the ellipsoid, meters. */
  altM: number;
}

/** One aircraft, normalized from any ADS-B source. SI units. */
export interface Aircraft {
  /** ICAO 24-bit address, lowercase hex. */
  id: string;
  /** Callsign / flight number, trimmed (may be empty). */
  cs: string;
  lat: number;
  lon: number;
  /** Geometric (GPS) altitude in meters, falling back to barometric. */
  altM: number;
  /** Ground speed, m/s. */
  spdMs: number;
  /** True track over ground, degrees clockwise from north. */
  trkDeg: number;
  /** Vertical rate, m/s (+ climbing). */
  vrMs: number;
  /** Unix time (seconds) of the position fix. */
  t: number;
  /** Aircraft type code if the source provides it (e.g. "A320"). */
  type?: string;
}

export interface AircraftResponse {
  source: 'opensky' | 'adsblol' | 'none';
  /** Server time (unix seconds) when the data was fetched upstream. */
  fetchedAt: number;
  aircraft: Aircraft[];
  error?: string;
}

export interface TleRecord {
  name: string;
  line1: string;
  line2: string;
}

export const TLE_GROUPS = ['visual', 'stations', 'starlink', 'gps-ops', 'weather'] as const;
export type TleGroup = (typeof TLE_GROUPS)[number];

export interface TleResponse {
  group: TleGroup;
  /** Unix seconds when the data was downloaded from CelesTrak. */
  fetchedAt: number;
  sats: TleRecord[];
  /** "fallback" when CelesTrak was down and a reduced bright-satellite list was used. */
  source?: 'celestrak' | 'fallback';
}
