'use client';

type Ctx = AudioContext;

class AudioEngine {
  private ctx: Ctx | null = null;
  private humGain: GainNode | null = null;
  private enabled = true;
  private music: HTMLAudioElement | null = null;
  private musicUrl: string | null = null;
  private musicFade: number | null = null;
  private pendingMusic: string | null = null;
  private readonly musicVolume = 0.35;
  private musicEnabled = true;

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
    if (this.pendingMusic) {
      const url = this.pendingMusic;
      this.pendingMusic = null;
      this.playMusic(url, 0.4);
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.stopHum();
      if (this.music) this.music.volume = 0;
    } else if (this.ctx) {
      this.startHum();
      if (this.music) this.music.volume = this.musicVolume;
    }
  }

  /**
   * Музыка по настроению сцены.
   * null — продолжать текущий трек (сцена без mood).
   * Повторный вызов с тем же url ничего не делает.
   */
  playMusic(url: string | null, fade = 1.5): void {
    if (typeof window === 'undefined' || !url) return;
    if (!this.ctx) {
      this.pendingMusic = url;
      return;
    }
    if (url === this.musicUrl) return;

    this.musicUrl = url;
    document.documentElement.dataset.track = url;

    if (this.musicFade !== null) {
      window.clearInterval(this.musicFade);
      this.musicFade = null;
    }

    const prev = this.music;
    const next = new Audio(url);
    next.loop = true;
    next.volume = 0;
    if (this.musicEnabled) void next.play().catch(() => {});
    this.music = next;

    const target = this.enabled ? this.musicVolume : 0;
    const startPrev = prev?.volume ?? 0;
    const steps = 30;
    const dt = Math.max(20, (fade * 1000) / steps);
    let i = 0;

    this.musicFade = window.setInterval(() => {
      i += 1;
      const k = Math.min(1, i / steps);
      next.volume = target * k;
      if (prev && prev !== next) prev.volume = Math.max(0, startPrev * (1 - k));
      if (k >= 1) {
        if (this.musicFade !== null) window.clearInterval(this.musicFade);
        this.musicFade = null;
        if (prev && prev !== next) {
          prev.pause();
          prev.src = '';
        }
      }
    }, dt);
  }

  setMusicEnabled(on: boolean): void {
    this.musicEnabled = on;
    if (!on) {
      this.music?.pause();
    } else if (this.music) {
      void this.music.play().catch(() => {});
    }
  }

  get isMusicEnabled() {
    return this.musicEnabled;
  }

  stopMusic(): void {
    this.musicUrl = null;
    this.pendingMusic = null;
    if (this.musicFade !== null) window.clearInterval(this.musicFade);
    this.musicFade = null;
    this.music?.pause();
    this.music = null;
    delete document.documentElement.dataset.track;
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
