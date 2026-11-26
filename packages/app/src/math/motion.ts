export function progress(now: number, start: number, duration: number): number {
  return Math.max(0, Math.min(1, (now - start) / duration));
}

export function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function motionAlpha(dtMs: number, timeConstantMs: number): number {
  return -Math.expm1(-Math.max(0, dtMs) / timeConstantMs);
}
