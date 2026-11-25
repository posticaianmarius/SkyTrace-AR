import type { TleRecord } from './types';

/** Parse CelesTrak 3-line TLE text (name / line 1 / line 2). */
export function parseTleText(text: string): TleRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  const out: TleRecord[] = [];
  for (let i = 0; i + 1 < lines.length; ) {
    const a = lines[i]!;
    const b = lines[i + 1];
    const c = lines[i + 2];
    if (b?.startsWith('1 ') && c?.startsWith('2 ')) {
      out.push({ name: a.trim(), line1: b, line2: c });
      i += 3;
    } else if (a.startsWith('1 ') && b?.startsWith('2 ')) {
      // 2-line format without a name line
      out.push({ name: `NORAD ${a.slice(2, 7).trim()}`, line1: a, line2: b });
      i += 2;
    } else {
      i += 1;
    }
  }
  return out;
}

/** NORAD catalog number from TLE line 1. */
export function noradId(line1: string): number {
  return Number.parseInt(line1.slice(2, 7), 10);
}

/** TLE epoch as a JS Date (from line 1, columns 19-32). */
export function tleEpoch(line1: string): Date {
  const yy = Number.parseInt(line1.slice(18, 20), 10);
  const doy = Number.parseFloat(line1.slice(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return new Date(Date.UTC(year, 0, 1) + (doy - 1) * 86400_000);
}
