/** Generic client name; no personal data in outbound requests. */
export const USER_AGENT = 'SkyTrace-AR/0.1 (open-source sky AR demo)';

export interface BBox {
  lamin: number;
  lomin: number;
  lamax: number;
  lomax: number;
}

const KM_PER_DEG_LAT = 111.32;

export function bboxAround(lat: number, lon: number, radiusKm: number): BBox {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const dLon = radiusKm / (KM_PER_DEG_LAT * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  return {
    lamin: Math.max(-90, lat - dLat),
    lamax: Math.min(90, lat + dLat),
    lomin: Math.max(-180, lon - dLon),
    lomax: Math.min(180, lon + dLon),
  };
}

/** Snap to a grid so nearby users share one cached upstream request. */
export function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}
