/**
 * Geodesy helpers: geodetic <-> ECEF <-> local ENU <-> azimuth/elevation.
 * Conventions:
 *  - ENU = [east, north, up]
 *  - azimuth: degrees clockwise from true north, 0..360
 *  - elevation: degrees above the horizon
 */
import type { Geodetic } from './types';

export type Vec3 = [number, number, number];

export const WGS84_A = 6378137; // semi-major axis, m
export const WGS84_E2 = 6.69437999014e-3; // first eccentricity squared
export const EARTH_MEAN_RADIUS_M = 6371008.8;

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export function normalizeDeg(d: number): number {
  const r = d % 360;
  return r < 0 ? r + 360 : r;
}

/** Signed smallest difference a - b in degrees, in (-180, 180]. */
export function deltaDeg(a: number, b: number): number {
  let d = normalizeDeg(a - b);
  if (d > 180) d -= 360;
  return d;
}

export function geodeticToEcef(p: Geodetic): Vec3 {
  const phi = p.lat * DEG;
  const lam = p.lon * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
  return [
    (n + p.altM) * cosPhi * Math.cos(lam),
    (n + p.altM) * cosPhi * Math.sin(lam),
    (n * (1 - WGS84_E2) + p.altM) * sinPhi,
  ];
}

/** Precomputed observer frame so many targets can be converted cheaply. */
export interface ObserverFrame {
  ecef: Vec3;
  sinPhi: number;
  cosPhi: number;
  sinLam: number;
  cosLam: number;
}

export function observerFrame(obs: Geodetic): ObserverFrame {
  const phi = obs.lat * DEG;
  const lam = obs.lon * DEG;
  return {
    ecef: geodeticToEcef(obs),
    sinPhi: Math.sin(phi),
    cosPhi: Math.cos(phi),
    sinLam: Math.sin(lam),
    cosLam: Math.cos(lam),
  };
}

/** ECEF target (meters) -> ENU vector (meters) relative to the observer. */
export function ecefToEnu(f: ObserverFrame, target: Vec3): Vec3 {
  const dx = target[0] - f.ecef[0];
  const dy = target[1] - f.ecef[1];
  const dz = target[2] - f.ecef[2];
  return [
    -f.sinLam * dx + f.cosLam * dy,
    -f.sinPhi * f.cosLam * dx - f.sinPhi * f.sinLam * dy + f.cosPhi * dz,
    f.cosPhi * f.cosLam * dx + f.cosPhi * f.sinLam * dy + f.sinPhi * dz,
  ];
}

export interface LookAngle {
  azDeg: number;
  elDeg: number;
  rangeM: number;
}

export function enuToAzEl(enu: Vec3): LookAngle {
  const [e, n, u] = enu;
  const horiz = Math.hypot(e, n);
  return {
    azDeg: normalizeDeg(Math.atan2(e, n) * RAD),
    elDeg: Math.atan2(u, horiz) * RAD,
    rangeM: Math.hypot(horiz, u),
  };
}

/** Unit ENU vector for a direction. */
export function azElToEnu(azDeg: number, elDeg: number): Vec3 {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  const c = Math.cos(el);
  return [c * Math.sin(az), c * Math.cos(az), Math.sin(el)];
}

export function lookAngles(f: ObserverFrame, target: Geodetic): LookAngle {
  return enuToAzEl(ecefToEnu(f, geodeticToEcef(target)));
}

/**
 * Atmospheric refraction (Saemundsson), degrees to ADD to the true elevation
 * to get the apparent elevation. Standard atmosphere; ~0.48 deg at the horizon.
 */
export function refractionDeg(trueElDeg: number): number {
  if (trueElDeg < -1.5) return 0;
  const h = trueElDeg;
  const arcmin = 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * DEG);
  return Math.max(0, arcmin / 60);
}

/** Great-circle angle between two unit-ish vectors, degrees. */
export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const na = Math.hypot(a[0], a[1], a[2]);
  const nb = Math.hypot(b[0], b[1], b[2]);
  const c = Math.min(1, Math.max(-1, dot / (na * nb)));
  return Math.acos(c) * RAD;
}

/**
 * Move a position along its track for `dtSec` seconds (flat-earth step,
 * accurate for the few-km extrapolations we need).
 */
export function deadReckon(
  p: Geodetic,
  spdMs: number,
  trkDeg: number,
  vrMs: number,
  dtSec: number,
): Geodetic {
  const dist = spdMs * dtSec;
  const trk = trkDeg * DEG;
  const dNorth = dist * Math.cos(trk);
  const dEast = dist * Math.sin(trk);
  const lat = p.lat + (dNorth / EARTH_MEAN_RADIUS_M) * RAD;
  const lon = p.lon + (dEast / (EARTH_MEAN_RADIUS_M * Math.cos(p.lat * DEG))) * RAD;
  return { lat, lon, altM: p.altM + vrMs * dtSec };
}
