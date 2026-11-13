import { catmullRom } from '../core/MathUtils';

export const WORLD_LENGTH = 800;
export const BRIDGE_Z = 340;
export const RIVER_HALF_WIDTH = 9;

/** Centerline control points, sampled every 100 m from z = 0..800. */
const CTRL_STEP = 100;
const CTRL_X = [-18, 6, -20, 18, -14, 22, 2, -6, 4];

/** Signed centerline x at a given z. Smooth Catmull-Rom through the controls. */
export function centerX(z: number): number {
  const u = Math.min(CTRL_X.length - 1, Math.max(0, z) / CTRL_STEP);
  const i = Math.min(CTRL_X.length - 2, Math.floor(u));
  const t = u - i;
  const p0 = CTRL_X[Math.max(0, i - 1)];
  const p1 = CTRL_X[i];
  const p2 = CTRL_X[i + 1];
  const p3 = CTRL_X[Math.min(CTRL_X.length - 1, i + 2)];
  return catmullRom(p0, p1, p2, p3, t);
}

/** The river runs east-west, meandering in z as it crosses the valley. */
export function riverZ(x: number): number {
  return BRIDGE_Z + 12 * Math.sin(x * 0.03);
}

export function bridgeX(): number {
  return centerX(BRIDGE_Z);
}
