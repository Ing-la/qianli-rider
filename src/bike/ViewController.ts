import { clamp, damp } from '../core/MathUtils';

const MAX_YAW = 2.5;
const MIN_PITCH = -0.38;
const MAX_PITCH = 0.7;

export class ViewController {
  yaw = 0;
  pitch = 0;

  private targetYaw = 0;
  private targetPitch = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private idle = 0;
  private touchX = 0;
  private touchY = 0;
  private touchActive = false;

  constructor(private readonly canvas: HTMLElement) {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.idle = 0;
      this.canvas.classList.add('dragging');
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      const sens = e.pointerType === 'touch' ? 0.0052 : 0.0038;
      this.targetYaw = clamp(this.targetYaw - dx * sens, -MAX_YAW, MAX_YAW);
      this.targetPitch = clamp(this.targetPitch + dy * sens * 0.72, MIN_PITCH, MAX_PITCH);
      this.idle = 0;
    });

    const end = (): void => {
      if (!this.dragging) return;
      this.dragging = false;
      this.idle = 0;
      this.canvas.classList.remove('dragging');
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);
  }

  setTouchLook(x: number, y: number): void {
    this.touchX = x;
    this.touchY = y;
    this.touchActive = Math.abs(x) > 0.01 || Math.abs(y) > 0.01;
    if (this.touchActive) this.idle = 0;
  }

  reset(): void {
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.touchX = 0;
    this.touchY = 0;
    this.touchActive = false;
    this.dragging = false;
    this.idle = 0;
    this.canvas.classList.remove('dragging');
  }

  update(dt: number, speed: number): void {
    if (this.touchActive) {
      this.targetYaw = clamp(this.targetYaw - this.touchX * 1.8 * dt, -MAX_YAW, MAX_YAW);
      this.targetPitch = clamp(this.targetPitch + this.touchY * 1.15 * dt, MIN_PITCH, MAX_PITCH);
      this.idle = 0;
    } else if (!this.dragging) {
      this.idle += dt;
      if (this.idle > 1.2 && speed > 2) {
        const k = 1 - Math.exp(-2.2 * dt);
        this.targetYaw -= this.targetYaw * k;
        this.targetPitch -= this.targetPitch * k;
      }
    }
    this.yaw = damp(this.yaw, this.targetYaw, 10, dt);
    this.pitch = damp(this.pitch, this.targetPitch, 10, dt);
  }
}
