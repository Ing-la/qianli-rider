import type * as THREE from 'three';

export class DebugPanel {
  private el: HTMLElement | null = null;
  private acc = 0;
  private frames = 0;
  private fps = 0;

  constructor(private renderer: THREE.WebGLRenderer, private extra: () => string = () => '') {
    if (!new URLSearchParams(location.search).has('debug')) return;
    const el = document.getElementById('debug');
    if (!el) return;
    el.classList.remove('hidden');
    this.el = el;
  }

  update(dt: number): void {
    if (!this.el) return;
    this.acc += dt;
    this.frames++;
    if (this.acc >= 0.4) {
      this.fps = Math.round(this.frames / this.acc);
      this.frames = 0;
      this.acc = 0;
      const info = this.renderer.info;
      this.el.textContent =
        `${this.fps} fps · ${info.render.calls} calls · ${(info.render.triangles / 1000).toFixed(0)}k tris` +
        (this.extra() ? ` · ${this.extra()}` : '');
    }
  }
}
