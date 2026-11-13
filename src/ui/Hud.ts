import { CARRY_CAPACITY } from '../game/Pigments';

export interface HudState {
  carried: [number, number, number];
  combo: number;
  score: number;
  time: number;
  flying: boolean;
  nearest: {
    name: string;
    dist: number;
    angle: number;
    short: string;
    color: number;
    deliverable: boolean;
  } | null;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

export class Hud {
  private readonly hud = el('hud');
  private readonly counts = Array.from(document.querySelectorAll<HTMLElement>('.pig .count'));
  private readonly carry = el('carry');
  private readonly comboEl = el('combo');
  private readonly timerEl = el('timer');
  private readonly scoreEl = el('score');
  private readonly guide = el('guide');
  private readonly guideArrow = el('guide-arrow');
  private readonly guideLabel = el('guide-label');
  private readonly guideDist = el('guide-dist');
  private readonly objectiveDot = el('objective-dot');
  private readonly objectiveText = el('objective-text');
  private readonly wingsEl = el('wings');
  private readonly toastEl = el('toast');
  private toastTimer = 0;

  show(): void {
    this.hud.classList.remove('hidden');
  }

  hide(): void {
    this.hud.classList.add('hidden');
  }

  pickup(type: number): void {
    const node = document.querySelector<HTMLElement>(`.pig[data-pig="${type}"] .count`);
    if (!node) return;
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
  }

  toast(text: string, seconds = 3.5): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden', 'fade');
    this.toastTimer = seconds;
  }

  update(dt: number, s: HudState): void {
    const total = s.carried[0] + s.carried[1] + s.carried[2];
    this.counts.forEach((node, i) => {
      node.textContent = String(s.carried[i] ?? 0);
    });
    this.carry.textContent = `${total} / ${CARRY_CAPACITY}`;

    if (s.combo > 1.01) {
      this.comboEl.classList.remove('hidden');
      this.comboEl.textContent = `×${s.combo.toFixed(1)}`;
    } else {
      this.comboEl.classList.add('hidden');
    }

    const seconds = Math.floor(s.time);
    this.timerEl.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    this.scoreEl.textContent = `${s.score.toLocaleString()} 分`;

    if (s.nearest) {
      this.guide.classList.remove('hidden');
      this.guideArrow.style.transform = `rotate(${(-s.nearest.angle * 180) / Math.PI}deg)`;
      this.guideLabel.textContent = `${s.nearest.name} · 求${s.nearest.short}`;
      const dist = `${Math.round(s.nearest.dist)} m`;
      this.guideDist.textContent = s.nearest.deliverable ? `${dist} · 可交` : dist;
      this.objectiveText.textContent = s.nearest.deliverable
        ? `交付 → ${s.nearest.name} · ${dist}`
        : `拾颜料 → ${s.nearest.name} · ${dist}`;
      this.objectiveDot.style.color = `#${s.nearest.color.toString(16).padStart(6, '0')}`;
    } else {
      this.guide.classList.add('hidden');
      this.objectiveText.textContent = '山河已全部设色';
      this.objectiveDot.style.color = '#b08c46';
    }

    this.wingsEl.classList.toggle('hidden', !s.flying);

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.toastEl.classList.add('fade');
        window.setTimeout(() => this.toastEl.classList.add('hidden'), 400);
      }
    }
  }
}
