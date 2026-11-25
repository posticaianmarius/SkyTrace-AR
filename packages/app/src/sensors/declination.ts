/**
 * Magnetic declination from the World Magnetic Model (WMM2025, valid to 2029).
 * Phone compasses point to magnetic north; adding this gives true north.
 * Example: Bucharest ~ +6.4 deg (east), London ~ +1.1 deg.
 */
import { model as wmm, type GeomagnetismModel } from 'geomagnetism';

let model: GeomagnetismModel | null = null;

export function declinationDeg(lat: number, lon: number, date = new Date()): number {
  try {
    model ??= wmm(date);
    const d = model.point([lat, lon]).decl;
    return Number.isFinite(d) ? d : 0;
  } catch {
    return 0; // outside the model's date range etc.: no correction
  }
}
