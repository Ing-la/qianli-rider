import { clamp } from './MathUtils';

export interface InputState {
  steer: number;
  throttle: number;
  boost: boolean;
  jump: boolean;
  ascend: boolean;
}

export class Input {
  private down = new Set<string>();
  private jumpEdge = false;
  private touchSteer = 0;
  private touchThrottle = 0;
  private touchBoost = false;
  private touchDive = false;
  private touchAscend = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      if (e.code === 'Space') this.jumpEdge = true;
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.jumpEdge = false;
    });
  }

  private has(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  setTouchAxis(steer: number, throttle: number): void {
    this.touchSteer = steer;
    this.touchThrottle = throttle;
  }

  setTouchBoost(active: boolean): void {
    this.touchBoost = active;
  }

  setTouchDive(active: boolean): void {
    this.touchDive = active;
  }

  setTouchAscend(active: boolean): void {
    this.touchAscend = active;
  }

  pressJump(): void {
    this.jumpEdge = true;
  }

  resetTouch(): void {
    this.touchSteer = 0;
    this.touchThrottle = 0;
    this.touchBoost = false;
    this.touchDive = false;
    this.touchAscend = false;
  }

  sample(): InputState {
    const keySteer = (this.has('KeyD', 'ArrowRight') ? 1 : 0) - (this.has('KeyA', 'ArrowLeft') ? 1 : 0);
    const keyThrottle = (this.has('KeyW', 'ArrowUp') ? 1 : 0) - (this.has('KeyS', 'ArrowDown') ? 1 : 0);
    const state: InputState = {
      steer: clamp(keySteer + this.touchSteer, -1, 1),
      throttle: clamp(keyThrottle + this.touchThrottle + (this.touchDive ? -1 : 0), -1, 1),
      boost: this.has('ShiftLeft', 'ShiftRight') || this.touchBoost,
      jump: this.jumpEdge,
      ascend: this.has('Space') || this.touchAscend,
    };
    this.jumpEdge = false;
    return state;
  }

  /** For the title screen: any key starts the ride. */
  anyPressed(): boolean {
    return (
      this.down.size > 0 ||
      Math.abs(this.touchSteer) > 0.01 ||
      Math.abs(this.touchThrottle) > 0.01 ||
      this.touchBoost ||
      this.touchDive ||
      this.touchAscend
    );
  }
}
