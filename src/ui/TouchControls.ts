import type { Input } from '../core/Input';

export class TouchControls {
  static isTouchCapable(): boolean {
    return (
      (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
      navigator.maxTouchPoints > 0
    );
  }

  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly releases: Array<() => void> = [];
  private activeId: number | null = null;
  private centerX = 0;
  private centerY = 0;
  private radius = 52;

  constructor(private readonly input: Input) {
    this.stick = document.getElementById('stick') as HTMLElement;
    this.knob = document.getElementById('stick-knob') as HTMLElement;

    this.stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.activeId = e.pointerId;
      try {
        this.stick.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const rect = this.stick.getBoundingClientRect();
      this.centerX = rect.left + rect.width / 2;
      this.centerY = rect.top + rect.height / 2;
      this.radius = rect.width * 0.36;
      this.move(e.clientX, e.clientY);
    });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.activeId) this.move(e.clientX, e.clientY);
    });

    const endStick = (e: PointerEvent): void => {
      if (e.pointerId !== this.activeId) return;
      this.activeId = null;
      this.resetStick();
    };
    window.addEventListener('pointerup', endStick);
    window.addEventListener('pointercancel', endStick);

    const jump = document.getElementById('btn-jump') as HTMLElement;
    const boost = document.getElementById('btn-boost') as HTMLElement;
    const dive = document.getElementById('btn-dive') as HTMLElement;

    this.bindHold(
      jump,
      () => {
        this.input.pressJump();
        this.input.setTouchAscend(true);
      },
      () => this.input.setTouchAscend(false),
    );
    this.bindHold(
      boost,
      () => this.input.setTouchBoost(true),
      () => this.input.setTouchBoost(false),
    );
    this.bindHold(
      dive,
      () => this.input.setTouchDive(true),
      () => this.input.setTouchDive(false),
    );

    window.addEventListener('blur', () => this.releaseAll());
  }

  private bindHold(button: HTMLElement, down: () => void, up: () => void): void {
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      button.classList.add('active');
      try {
        button.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      down();
    });

    const release = (): void => {
      button.classList.remove('active');
      up();
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    this.releases.push(release);
  }

  private move(x: number, y: number): void {
    let dx = x - this.centerX;
    let dy = y - this.centerY;
    const len = Math.hypot(dx, dy);
    if (len > this.radius) {
      dx = (dx / len) * this.radius;
      dy = (dy / len) * this.radius;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;

    const dead = 0.1;
    const shaped = (v: number): number => {
      const a = Math.abs(v);
      if (a < dead) return 0;
      return Math.sign(v) * Math.min(1, (a - dead) / (1 - dead));
    };
    this.input.setTouchAxis(shaped(dx / this.radius), shaped(-dy / this.radius));
  }

  private resetStick(): void {
    this.knob.style.transform = 'translate(0, 0)';
    this.input.setTouchAxis(0, 0);
  }

  releaseAll(): void {
    this.activeId = null;
    this.resetStick();
    for (const release of this.releases) release();
  }
}
