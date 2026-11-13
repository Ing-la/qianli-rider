import { PIGMENTS } from '../game/Pigments';
import { centerX, riverZ } from '../world/Path';
import { WORLD_HALF_WIDTH } from '../world/World';
import type { World } from '../world/World';

const PAD = 12;

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly width: number;
  private readonly height: number;
  private acc = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.width = canvas.width;
    this.height = canvas.height;
  }

  private mapX(x: number): number {
    return PAD + ((x + WORLD_HALF_WIDTH) / (WORLD_HALF_WIDTH * 2)) * (this.width - PAD * 2);
  }

  private mapZ(z: number): number {
    return this.height - PAD - (z / 800) * (this.height - PAD * 2);
  }

  draw(
    dt: number,
    world: World,
    x: number,
    z: number,
    yaw: number,
    target: { x: number; z: number; color: number } | null = null,
  ): void {
    this.acc += dt;
    if (this.acc < 0.06) return;
    this.acc = 0;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = 'rgba(240, 233, 216, 0.9)';
    ctx.fillRect(0, 0, this.width, this.height);

    // river
    ctx.beginPath();
    for (let wx = -WORLD_HALF_WIDTH; wx <= WORLD_HALF_WIDTH; wx += 8) {
      const px = this.mapX(wx);
      const py = this.mapZ(riverZ(wx));
      if (wx === -WORLD_HALF_WIDTH) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = 'rgba(90, 130, 140, 0.55)';
    ctx.lineWidth = 5;
    ctx.stroke();

    // road
    ctx.beginPath();
    for (let wz = 0; wz <= 800; wz += 20) {
      const px = this.mapX(centerX(wz));
      const py = this.mapZ(wz);
      if (wz === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = 'rgba(35, 48, 47, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // pavilions
    for (const p of world.pavilions) {
      const px = this.mapX(p.x);
      const py = this.mapZ(p.z);
      const color = PIGMENTS[p.pigment].color;
      const alpha = 0.3 + 0.7 * p.reveal;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(35, 48, 47, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // route to the delivery target
    const px = this.mapX(x);
    const py = this.mapZ(z);
    if (target) {
      const tx = this.mapX(target.x);
      const ty = this.mapZ(target.z);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(176, 140, 70, 0.95)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();

      const pulse = 8 + Math.sin(performance.now() * 0.004) * 2.5;
      ctx.beginPath();
      ctx.arc(tx, ty, pulse, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${(target.color >> 16) & 255}, ${(target.color >> 8) & 255}, ${target.color & 255}, 0.95)`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tx, ty, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(176, 140, 70, 0.95)';
      ctx.fill();
      ctx.fillStyle = 'rgba(35, 48, 47, 0.9)';
      ctx.font = 'bold 10px serif';
      ctx.textAlign = 'center';
      ctx.fillText('交', tx, ty - 13);
    }

    // rider
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(yaw);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.6, 5);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.6, 5);
    ctx.closePath();
    ctx.fillStyle = '#23302f';
    ctx.fill();
    ctx.restore();
  }
}
