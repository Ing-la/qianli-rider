import { clamp } from '../core/MathUtils';
import type { World } from '../world/World';
import { DELIVERIES_PER_REGION } from './Pigments';

/** Softly animate each region's reveal level and paint radius. */
export function updateRegions(world: World, dt: number): void {
  for (const p of world.pavilions) {
    const progress = clamp(p.deliveries / DELIVERIES_PER_REGION, 0, 1);
    const targetReveal = progress;
    const targetRadius = progress > 0 ? 40 + 55 * progress : 1;
    const k1 = 1 - Math.exp(-2.4 * dt);
    const k2 = 1 - Math.exp(-1.8 * dt);
    p.reveal += (targetReveal - p.reveal) * k1;
    p.revealR += (targetRadius - p.revealR) * k2;
  }
}

export function regionComplete(world: World, index: number): boolean {
  return world.pavilions[index].deliveries >= DELIVERIES_PER_REGION;
}

export function completedRegions(world: World): number {
  return world.pavilions.filter((p) => p.deliveries >= DELIVERIES_PER_REGION).length;
}
