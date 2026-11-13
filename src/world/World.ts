import { clamp, dist2D, fbm2, lerp, smoothstep } from '../core/MathUtils';
import { mulberry32, type Rng } from '../core/PRNG';
import { DELIVERIES_PER_REGION } from '../game/Pigments';

export const WORLD_HALF = 560;
export const PLAY_RADIUS = 470;
export const BOUNDARY_START = 470;
export const BOUNDARY_END = 560;

export type PigmentIndex = 0 | 1 | 2;

export interface Hill {
  x: number;
  z: number;
  r: number;
  h: number;
}

/** The first five hills carry the pavilions; the rest fill the meadow. */
const HILLS: Hill[] = [
  { x: -150, z: -170, r: 140, h: 38 },
  { x: -40, z: 120, r: 150, h: 42 },
  { x: 300, z: 220, r: 130, h: 36 },
  { x: 220, z: -360, r: 135, h: 34 },
  { x: -330, z: 300, r: 125, h: 30 },
  { x: 150, z: -100, r: 100, h: 24 },
  { x: -250, z: 250, r: 110, h: 28 },
  { x: 60, z: 330, r: 110, h: 32 },
  { x: 360, z: 60, r: 100, h: 28 },
  { x: -330, z: -280, r: 120, h: 32 },
  { x: 420, z: -140, r: 100, h: 30 },
  { x: -450, z: -120, r: 100, h: 34 },
  { x: -180, z: 430, r: 100, h: 26 },
  { x: 450, z: 400, r: 90, h: 22 },
  { x: 250, z: 430, r: 100, h: 26 },
  { x: -100, z: -40, r: 90, h: 16 },
  { x: 0, z: -250, r: 80, h: 16 },
  { x: 180, z: 60, r: 70, h: 12 },
  { x: -120, z: 320, r: 75, h: 14 },
  { x: 30, z: -450, r: 85, h: 18 },
  { x: -350, z: -380, r: 80, h: 16 },
  { x: 150, z: 150, r: 60, h: 10 },
  { x: -260, z: -60, r: 65, h: 12 },
  { x: 60, z: -60, r: 55, h: 8 },
  { x: 380, z: 320, r: 70, h: 12 },
  { x: -430, z: 50, r: 70, h: 14 },
];

export interface Pavilion {
  index: number;
  name: string;
  x: number;
  z: number;
  padY: number;
  pigment: PigmentIndex;
  reveal: number;
  revealR: number;
  deliveries: number;
}

export const PAVILION_NAMES = ['青峦台', '碧涧亭', '叠翠阁', '烟霞榭', '远岫楼'] as const;

export class World {
  readonly seed: number;
  readonly rng: Rng;
  readonly hills: Hill[] = HILLS;
  readonly pavilions: Pavilion[] = [];
  readonly spawnX = 0;
  readonly spawnZ = 0;

  constructor(seed = 1113) {
    this.seed = seed;
    this.rng = mulberry32(seed);

    for (let i = 0; i < 5; i++) {
      const hill = this.hills[i];
      const padY = this.rawHeightAt(hill.x, hill.z) + 0.1;
      this.pavilions.push({
        index: i,
        name: PAVILION_NAMES[i],
        x: hill.x,
        z: hill.z,
        padY,
        pigment: (i % 3) as PigmentIndex,
        reveal: 0,
        revealR: 0,
        deliveries: 0,
      });
    }
  }

  resetRegions(): void {
    for (const p of this.pavilions) {
      p.reveal = 0;
      p.revealR = 0;
      p.deliveries = 0;
    }
  }

  /** Open meadow with scattered, rideable hills and a ring of boundary peaks. */
  rawHeightAt(x: number, z: number): number {
    let y = 2.2 + fbm2(x * 0.006 + 3.7, z * 0.006 + 9.1, 4, this.seed) * 7;

    for (const hill of this.hills) {
      const d = Math.hypot(x - hill.x, z - hill.z);
      const t = clamp(d / hill.r, 0, 1);
      // gentle shoulders, broad summit: rideable from every direction
      const s = 1 - smoothstep(0.1, 1, t);
      y += hill.h * s;
    }

    const detail = fbm2(x * 0.022 + 7.1, z * 0.022 + 2.3, 3, this.seed + 4) - 0.5;
    y += detail * 1.6;

    const radius = Math.hypot(x, z);
    const rim = smoothstep(BOUNDARY_START, BOUNDARY_END, radius);
    y += Math.pow(rim, 1.6) * 180 + rim * (fbm2(x * 0.012, z * 0.012, 3, this.seed + 9) - 0.5) * 30;
    return y;
  }

  heightAt(x: number, z: number): number {
    let y = this.rawHeightAt(x, z);
    for (const p of this.pavilions) {
      const d = dist2D(x, z, p.x, p.z);
      const w = 1 - smoothstep(8, 16, d);
      if (w > 0) y = lerp(y, p.padY, w);
    }
    return y;
  }

  resolveCollisions(pos: { x: number; z: number; y: number }, radius = 0.45): void {
    for (const p of this.pavilions) {
      if (pos.y > p.padY + 5) continue;
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const d = Math.hypot(dx, dz);
      const min = 4.9 + radius;
      if (d <= 0.0001) {
        pos.x = p.x + min;
        pos.z = p.z;
      } else if (d < min) {
        pos.x = p.x + (dx / d) * min;
        pos.z = p.z + (dz / d) * min;
      }
    }
  }

  gradient(x: number, z: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
    const e = 0.75;
    out.x = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    out.z = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return out;
  }

  clampToWorld(pos: { x: number; z: number }): void {
    const limit = WORLD_HALF - 18;
    pos.x = clamp(pos.x, -limit, limit);
    pos.z = clamp(pos.z, -limit, limit);
  }

  nearestPavilion(x: number, z: number, onlyIncomplete = false): { pavilion: Pavilion; dist: number } {
    let best = this.pavilions[0];
    let bestD = Infinity;
    for (const p of this.pavilions) {
      if (onlyIncomplete && p.deliveries >= DELIVERIES_PER_REGION) continue;
      const d = dist2D(x, z, p.x, p.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return { pavilion: best, dist: bestD };
  }

  allRegionsComplete(): boolean {
    return this.pavilions.every((p) => p.deliveries >= DELIVERIES_PER_REGION);
  }
}
