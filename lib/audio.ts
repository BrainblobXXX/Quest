'use client';

type Ctx = AudioContext;

class AudioEngine {
  private ctx: Ctx | null = null;
  private humGain: GainNode | null = null;
  private enabled = true;

  get isEnabled() {
    return this.enabled;
  }

  /** вызывается после первого жеста игрока */
  start(): void {
    if (typeof window === 'undefined' || this.ctx) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.startHum();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.stopHum();
    } else if (this.ctx) {
      this.startHum();
    }
  }

  private startHum(): void {
    if (!this.ctx || this.humGain) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 55;
    gain.gain.value = this.enabled ? 0.015 : 0;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    this.humGain = gain;
  }

  private stopHum(): void {
    this.humGain?.disconnect();
    this.humGain = null;
  }

  click(): void {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 180;
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }

  beep(): void {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  }
}

export const audio = new AudioEngine();
