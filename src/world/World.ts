import { clamp, dist2D, fbm2, lerp, smoothstep } from '../core/MathUtils';
import { mulberry32, type Rng } from '../core/PRNG';
import { BRIDGE_Z, centerX, RIVER_HALF_WIDTH, riverZ, WORLD_LENGTH } from './Path';

export const WATER_LEVEL = -0.55;
export const PLAYABLE_LATERAL = 55;
export const WORLD_HALF_WIDTH = 130;
export const BRIDGE_HALF_X = 5.2;
export const BRIDGE_HALF_Z = 10;
export const BRIDGE_RAMP = 26;
export const BRIDGE_DECK_Y = 2.4;

export type PigmentIndex = 0 | 1 | 2;

export interface Pavilion {
  index: number;
  name: string;
  x: number;
  z: number;
  padY: number;
  side: number;
  pigment: PigmentIndex;
  reveal: number;
  revealR: number;
  deliveries: number;
}

export const PAVILION_NAMES = ['青峦台', '碧涧亭', '叠翠阁', '烟霞榭', '远岫楼'] as const;
const PAVILION_Z = [110, 260, 410, 555, 700];

export class World {
  readonly seed: number;
  readonly rng: Rng;
  readonly pavilions: Pavilion[] = [];
  readonly spawnX: number;
  readonly spawnZ = 40;
  readonly bridgeX: number;

  constructor(seed = 1113) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.bridgeX = centerX(BRIDGE_Z);

    PAVILION_Z.forEach((z, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const x = centerX(z) + side * 40;
      const padY = this.rawHeightAt(x, z) + 0.12;
      this.pavilions.push({
        index: i,
        name: PAVILION_NAMES[i],
        x,
        z,
        padY,
        side,
        pigment: (i % 3) as PigmentIndex,
        reveal: 0,
        revealR: 0,
        deliveries: 0,
      });
    });

    this.spawnX = centerX(this.spawnZ);
  }

  resetRegions(): void {
    for (const p of this.pavilions) {
      p.reveal = 0;
      p.revealR = 0;
      p.deliveries = 0;
    }
  }

  /** Terrain height with no pavilion pads and no bridge. */
  rawHeightAt(x: number, z: number): number {
    const lat = x - centerX(z);
    const ridge = smoothstep(PLAYABLE_LATERAL, 120, Math.abs(lat));
    const floor = 1.6 + fbm2(x * 0.013, z * 0.010, 4, this.seed) * 3.6;

    const ridgeNoise = fbm2(x * 0.018 + 11.3, z * 0.014 + 7.7, 3, this.seed + 5);
    const gullies = fbm2(x * 0.06, z * 0.05, 3, this.seed + 9);
    const cliff = Math.pow(ridge, 1.65) * (86 + ridgeNoise * 42) - Math.pow(ridge, 2.1) * gullies * 16;
    let y = floor + cliff;

    const riverD = Math.abs(z - riverZ(x));
    const carve = 1 - smoothstep(RIVER_HALF_WIDTH, 26, riverD);
    const inValley = 1 - smoothstep(55, 85, Math.abs(lat));
    // shallow ford: the river slows a rider but never swallows them
    y = lerp(y, -0.9, carve * inValley);
    return y;
  }

  /** Deck surface height, including the approach ramps; null off the bridge. */
  bridgeYAt(x: number, z: number): number | null {
    const dz = Math.abs(z - BRIDGE_Z);
    if (Math.abs(x - this.bridgeX) > BRIDGE_HALF_X || dz > BRIDGE_RAMP) return null;
    const edge = this.rawHeightAt(x, z);
    const w = 1 - smoothstep(BRIDGE_HALF_Z - 2, BRIDGE_RAMP, dz);
    return lerp(edge, BRIDGE_DECK_Y, w);
  }

  /** Authoritative ground height used by the mesh and the bike. */
  heightAt(x: number, z: number): number {
    let y = this.rawHeightAt(x, z);

    for (const p of this.pavilions) {
      const d = dist2D(x, z, p.x, p.z);
      const w = 1 - smoothstep(9, 18, d);
      if (w > 0) y = lerp(y, p.padY, w);
    }

    const bridge = this.bridgeYAt(x, z);
    if (bridge !== null) y = Math.max(y, bridge);
    return y;
  }

  /** Push the rider out of pavilion plinths and keep them on the bridge deck. */
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

    if (Math.abs(pos.z - BRIDGE_Z) < BRIDGE_HALF_Z && Math.abs(pos.x - this.bridgeX) < BRIDGE_HALF_X) {
      const limit = BRIDGE_HALF_X - radius;
      pos.x = clamp(pos.x, this.bridgeX - limit, this.bridgeX + limit);
    }
  }

  gradient(x: number, z: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
    const e = 0.75;
    out.x = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    out.z = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return out;
  }

  lateralAt(x: number, z: number): number {
    return x - centerX(z);
  }

  isBridge(x: number, z: number): boolean {
    return Math.abs(x - this.bridgeX) < BRIDGE_HALF_X && Math.abs(z - BRIDGE_Z) < BRIDGE_HALF_Z;
  }

  isWater(x: number, z: number): boolean {
    if (this.isBridge(x, z)) return false;
    const riverD = Math.abs(z - riverZ(x));
    return riverD < RIVER_HALF_WIDTH && Math.abs(x - centerX(z)) < PLAYABLE_LATERAL + 35;
  }

  clampToWorld(pos: { x: number; z: number }): void {
    const z = clamp(pos.z, 8, WORLD_LENGTH - 8);
    const cx = centerX(z);
    const lat = clamp(pos.x - cx, -118, 118);
    pos.z = z;
    pos.x = cx + lat;
  }

  nearestPavilion(x: number, z: number, onlyIncomplete = false): { pavilion: Pavilion; dist: number } {
    let best = this.pavilions[0];
    let bestD = Infinity;
    for (const p of this.pavilions) {
      if (onlyIncomplete && p.deliveries >= 4) continue;
      const d = dist2D(x, z, p.x, p.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return { pavilion: best, dist: bestD };
  }

  allRegionsComplete(): boolean {
    return this.pavilions.every((p) => p.deliveries >= 4);
  }
}
