import type { Geodetic } from '@skytrace/shared';

/** Used when GPS is unavailable (desktop). Override with ?lat=..&lon=..&alt=.. */
const DEFAULT_LOCATION: Geodetic = { lat: 44.4268, lon: 26.1025, altM: 80 }; // Bucharest

export type LocationSource = 'gps' | 'url' | 'default';

export class Location {
  current: Geodetic = DEFAULT_LOCATION;
  source: LocationSource = 'default';
  accuracyM: number | null = null;
  private listeners: Array<(p: Geodetic) => void> = [];

  start() {
    const q = new URLSearchParams(location.search);
    const lat = Number(q.get('lat'));
    const lon = Number(q.get('lon'));
    if (q.has('lat') && q.has('lon') && Number.isFinite(lat) && Number.isFinite(lon)) {
      this.set({ lat, lon, altM: Number(q.get('alt') ?? 100) || 100 }, 'url');
      return; // explicit override wins (useful for testing)
    }
    this.set(DEFAULT_LOCATION, 'default');
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.watchPosition(
      (pos) => {
        this.accuracyM = pos.coords.accuracy;
        this.set(
          { lat: pos.coords.latitude, lon: pos.coords.longitude, altM: pos.coords.altitude ?? 100 },
          'gps',
        );
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  }

  onChange(fn: (p: Geodetic) => void) {
    this.listeners.push(fn);
    fn(this.current);
  }

  private set(p: Geodetic, source: LocationSource) {
    const moved =
      Math.abs(p.lat - this.current.lat) > 1e-4 ||
      Math.abs(p.lon - this.current.lon) > 1e-4 ||
      Math.abs(p.altM - this.current.altM) > 20 ||
      source !== this.source;
    this.current = p;
    this.source = source;
    if (moved) this.listeners.forEach((fn) => fn(p));
  }
}
