import type { Vec3 } from '@skytrace/shared';
import { normalize } from '../math/mat3';
import { easeOut, progress, smoothStep } from '../math/motion';

interface Track {
  revision: number;
  raw: Vec3;
  shown: Vec3;
  velocity: Vec3;
  offset: Vec3 | null;
  adjustedAt: number;
  acquiredAt: number;
  seenAt: number;
}

export class TrackMotion {
  private readonly tracks = new Map<string, Track>();
  private lastPruned = 0;

  clear() { this.tracks.clear(); }

  prune(now: number) {
    if(now - this.lastPruned < 1000) return;
    this.lastPruned = now;
    for(const [id, sample] of this.tracks) if(now - sample.seenAt > 1000) this.tracks.delete(id);
  }

  sample(id: string, revision: number, raw: Vec3, now: number, duration: number, reducedMotion: boolean) {
    let sample = this.tracks.get(id);
    if(!sample || now - sample.seenAt > 250) {
      sample = { revision, raw, shown: raw, velocity: [0, 0, 0], offset: null, adjustedAt: now, acquiredAt: now, seenAt: now };
      this.tracks.set(id, sample);
    }
    const dt = now - sample.seenAt;
    if(revision !== sample.revision) {
      const previous = sample.shown, velocity = sample.velocity;
      const offset: Vec3 = [previous[0] + dt * velocity[0] - raw[0], previous[1] + dt * velocity[1] - raw[1], previous[2] + dt * velocity[2] - raw[2]];
      const size = Math.hypot(...offset);
      sample.offset = size < .18 ? offset : null;
      sample.adjustedAt = now;
      sample.revision = revision;
    } else if(dt > 0) {
      sample.velocity = [(raw[0] - sample.raw[0]) / dt, (raw[1] - sample.raw[1]) / dt, (raw[2] - sample.raw[2]) / dt];
    }
    const t = progress(now, sample.adjustedAt, duration);
    if(t === 1) sample.offset = null;
    const amount = 1 - smoothStep(t), offset = sample.offset;
    const dir = offset ? normalize([raw[0] + amount * offset[0], raw[1] + amount * offset[1], raw[2] + amount * offset[2]]) : raw;
    sample.raw = raw;
    sample.shown = dir;
    sample.seenAt = now;
    const opacity = reducedMotion ? 1 : .42 + .58 * easeOut(progress(now, sample.acquiredAt, 185));
    return { dir, opacity };
  }
}
