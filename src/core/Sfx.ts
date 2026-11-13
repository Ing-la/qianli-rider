export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.42;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  toggle(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.42;
    return this.muted;
  }

  private tone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.1, delay = 0): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  pickup(type: number): void {
    const scale = [523.25, 587.33, 659.25, 783.99, 880];
    const freq = scale[type] ?? 523.25;
    this.tone(freq, 0.2, 'triangle', 0.07);
    this.tone(freq * 2, 0.11, 'sine', 0.03, 0.01);
  }

  wings(): void {
    [392, 523.25, 783.99].forEach((freq, i) => {
      this.tone(freq, 0.6, 'sine', 0.05, i * 0.08);
    });
  }

  deliver(): void {
    [392, 523.25, 659.25, 783.99].forEach((freq, i) => {
      this.tone(freq, 0.55, 'triangle', 0.06, i * 0.07);
    });
  }

  splash(): void {
    this.tone(110, 0.28, 'sine', 0.1);
    this.tone(70, 0.4, 'sine', 0.07, 0.03);
  }

  finish(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      this.tone(freq, 1.1, 'sine', 0.055, i * 0.12);
    });
  }
}
