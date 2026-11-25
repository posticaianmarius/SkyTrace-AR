/**
 * Eval mode: the user taps where an object REALLY is; we log the angle between
 * that tap and where we predicted it. This is the "label accuracy vs reference"
 * measurement. Exported as CSV.
 */
import { angleBetweenDeg, enuToAzEl, type Vec3 } from '@skytrace/shared';
import type { SkyObject } from '../types';

export interface EvalRecord {
  time: string;
  kind: string;
  id: string;
  label: string;
  predAz: number;
  predEl: number;
  tapAz: number;
  tapEl: number;
  errorDeg: number;
  yawOffsetDeg: number;
  fovScale: number;
  calibrated: boolean;
  orientation: string;
}

const KEY = 'skytrace:eval';

export class EvalLog {
  records: EvalRecord[] = [];

  constructor() {
    try {
      this.records = JSON.parse(localStorage.getItem(KEY) ?? '[]') as EvalRecord[];
    } catch {
      this.records = [];
    }
  }

  add(obj: SkyObject, tapDir: Vec3, ctx: { yawOffsetDeg: number; fovScale: number; calibrated: boolean; orientation: string }): EvalRecord {
    const tap = enuToAzEl(tapDir);
    const r: EvalRecord = {
      time: new Date().toISOString(),
      kind: obj.kind,
      id: obj.id,
      label: obj.label,
      predAz: round(obj.azDeg),
      predEl: round(obj.elDeg),
      tapAz: round(tap.azDeg),
      tapEl: round(tap.elDeg),
      errorDeg: round(angleBetweenDeg(obj.dir, tapDir)),
      yawOffsetDeg: round(ctx.yawOffsetDeg),
      fovScale: round(ctx.fovScale),
      calibrated: ctx.calibrated,
      orientation: ctx.orientation,
    };
    this.records.push(r);
    this.save();
    return r;
  }

  clear() {
    this.records = [];
    this.save();
  }

  /** Median error, split into before/after calibration. */
  stats() {
    const med = (xs: number[]) => {
      if (xs.length === 0) return NaN;
      const s = [...xs].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
    };
    const raw = this.records.filter((r) => !r.calibrated).map((r) => r.errorDeg);
    const cal = this.records.filter((r) => r.calibrated).map((r) => r.errorDeg);
    return { n: this.records.length, medianRaw: med(raw), medianCalibrated: med(cal), nRaw: raw.length, nCal: cal.length };
  }

  download() {
    const cols = Object.keys(this.records[0] ?? { time: '' }) as Array<keyof EvalRecord>;
    const csv = [cols.join(','), ...this.records.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `skytrace-eval-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.records));
    } catch {
      /* ignore */
    }
  }
}

function round(x: number) {
  return Math.round(x * 1000) / 1000;
}
