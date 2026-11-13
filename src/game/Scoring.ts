import { CARRY_CAPACITY, PIGMENTS } from './Pigments';
import type { Pavilion } from '../world/World';

export interface DeliveryResult {
  points: number;
  count: number;
  requested: boolean;
}

export class Scoring {
  carried: [number, number, number] = [0, 0, 0];
  score = 0;
  combo = 1;
  comboTimer = 0;
  deliveries = 0;

  get total(): number {
    return this.carried[0] + this.carried[1] + this.carried[2];
  }

  get free(): number {
    return CARRY_CAPACITY - this.total;
  }

  reset(): void {
    this.carried = [0, 0, 0];
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.deliveries = 0;
  }

  add(type: 0 | 1 | 2): boolean {
    if (this.total >= CARRY_CAPACITY) return false;
    this.carried[type]++;
    return true;
  }

  update(dt: number): void {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 1;
    }
  }

  bank(pavilion: Pavilion): DeliveryResult | null {
    if (this.total === 0) return null;
    let base = 0;
    for (let i = 0; i < 3; i++) base += this.carried[i] * PIGMENTS[i].score;
    const requested = this.carried[pavilion.pigment] > 0;
    const multiplier = this.combo * (requested ? 1.5 : 1);
    const points = Math.round(base * multiplier);
    const count = this.total;

    this.score += points;
    this.deliveries++;
    this.combo = Math.min(5, this.combo + 0.5);
    this.comboTimer = 20;
    this.carried = [0, 0, 0];

    return { points, count, requested };
  }
}
