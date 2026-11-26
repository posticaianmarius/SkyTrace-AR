import { describe, expect, it } from 'vitest';
import catalog from './catalog.json';
import { computeStarSky, CONSTELLATIONS } from './constellations';

describe('constellation catalog', () => {
  it('has 88 unique figures with valid coordinates and two distinct Serpens paths', () => {
    expect(CONSTELLATIONS).toHaveLength(88);
    expect(new Set(CONSTELLATIONS.map(({ id }) => id)).size).toBe(88);
    const serpens = catalog.figures.find(({ id }) => id === 'Ser')!;
    expect(serpens.name).toBe('Serpens');
    expect(serpens.paths).toHaveLength(2);
    expect(CONSTELLATIONS.find(({ id }) => id === 'Ser')?.segments.length).toBe(serpens.paths[0]!.length + serpens.paths[1]!.length - 2);
    const indices = [...catalog.figures.flatMap(({ paths }) => paths.flat()), ...catalog.references.map(({ position }) => position)];
    expect(indices.every((i) => Number.isInteger(i) && i >= 0 && i < catalog.positions.length)).toBe(true);
  });

  it('projects Orion’s Belt and Sirius to local positions consistent with Stellarium', () => {
    const sky = computeStarSky({ lat: 47.01, lon: 28.86, altM: 80 }, Date.parse('2026-11-26T20:00:00Z'));
    // Stellarium Web's ICRF-to-observed transform using the same catalog coordinates.
    const expected = [['Alnitak', 121.95780, 23.93455], ['Alnilam', 122.50411, 25.19416], ['Mintaka', 122.88137, 26.53589], ['Sirius', 118.09798, 2.80993]] as const;
    for(const [name, az, el] of expected) {
      const ref = sky.references.find(({ label }) => label === name)!;
      expect(ref.kind).toBe('star');
      expect(Math.abs(ref.azDeg - az)).toBeLessThan(0.02);
      expect(Math.abs(ref.elDeg - el)).toBeLessThan(0.02);
    }
    expect(sky.references.every(({ elDeg }) => elDeg > 0)).toBe(true);
  });
});
