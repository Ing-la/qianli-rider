import { PIGMENTS } from '../game/Pigments';
import { BOUNDARY_START, WORLD_HALF, type World } from '../world/World';

const PAD = 10;

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
    return PAD + ((x + WORLD_HALF) / (WORLD_HALF * 2)) * (this.width - PAD * 2);
  }

  private mapY(z: number): number {
    return this.height - PAD - ((z + WORLD_HALF) / (WORLD_HALF * 2)) * (this.height - PAD * 2);
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
    const size = this.width - PAD * 2;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = 'rgba(240, 233, 216, 0.92)';
    ctx.fillRect(0, 0, this.width, this.height);

    // hills as soft mounds
    for (const hill of world.hills) {
      const cx = this.mapX(hill.x);
      const cy = this.mapY(hill.z);
      const r = (hill.r / (WORLD_HALF * 2)) * size;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(2, r));
      const a = 0.2 + (hill.h / 44) * 0.32;
      g.addColorStop(0, `rgba(78, 104, 88, ${a})`);
      g.addColorStop(0.55, `rgba(96, 122, 104, ${a * 0.65})`);
      g.addColorStop(1, 'rgba(100, 126, 108, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, r), 0, Math.PI * 2);
      ctx.fill();
      if (hill.h >= 26) {
        ctx.beginPath();
        ctx.arc(cx, cy, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(58, 80, 66, 0.5)';
        ctx.fill();
      }
    }

    // boundary ring
    ctx.beginPath();
    const rim = (BOUNDARY_START / (WORLD_HALF * 2)) * size;
    ctx.arc(this.width / 2, this.height / 2, rim, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(70, 86, 80, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // pavilions
    for (const p of world.pavilions) {
      const px = this.mapX(p.x);
      const py = this.mapY(p.z);
      const color = PIGMENTS[p.pigment].color;
      const alpha = 0.3 + 0.7 * p.reveal;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(35, 48, 47, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const px = this.mapX(x);
    const py = this.mapY(z);

    if (target) {
      const tx = this.mapX(target.x);
      const ty = this.mapY(target.z);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(176, 140, 70, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();

      const pulse = 7 + Math.sin(performance.now() * 0.004) * 2.5;
      ctx.beginPath();
      ctx.arc(tx, ty, pulse, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${(target.color >> 16) & 255}, ${(target.color >> 8) & 255}, ${target.color & 255}, 0.95)`;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = 'rgba(35, 48, 47, 0.88)';
      ctx.font = 'bold 10px serif';
      ctx.textAlign = 'center';
      ctx.fillText('交', tx, ty - 12);
    }

    // rider arrow
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(yaw);
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.4, 4.8);
    ctx.lineTo(0, 2.4);
    ctx.lineTo(-4.4, 4.8);
    ctx.closePath();
    ctx.fillStyle = '#23302f';
    ctx.fill();
    ctx.restore();
  }
}
