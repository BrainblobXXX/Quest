'use client';

type Ctx = AudioContext;

class AudioEngine {
  private ctx: Ctx | null = null;
  private humGain: GainNode | null = null;
  private humOsc: OscillatorNode | null = null;
  private enabled = true;
  private music: HTMLAudioElement | null = null;
  /** Реально звучащий трек; старый не глушим, пока новый не начнёт играть. */
  private audibleTrack: HTMLAudioElement | null = null;
  /** все живые аудиоэлементы: гарантия, что играет ровно один трек */
  private tracks = new Set<HTMLAudioElement>();
  private musicUrl: string | null = null;
  private musicPlaylist: string[] = [];
  private musicPreloadedUrl: string | null = null;
  private musicFade: number | null = null;
  private pendingMusic: string | null = null;
  private readonly musicMax = 0.5;
  private musicVolume = 0.7;
  private soundVolume = 1;
  private musicEnabled = true;
  private crtEnabled = true;

  constructor() {
    // диагностика в dev: window.__questAudioDebug() показывает состояние треков
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      (window as unknown as { __questAudio?: AudioEngine }).__questAudio = this;
      (window as unknown as { __questAudioDebug?: () => unknown }).__questAudioDebug = () => ({
        url: this.musicUrl,
        enabled: this.enabled,
        musicEnabled: this.musicEnabled,
        soundVolume: Number(this.soundVolume.toFixed(2)),
        musicVolume: Number(this.musicVolume.toFixed(2)),
        tracks: [...this.tracks].map((track) => ({
          src: track.src.split('/').pop(),
          paused: track.paused,
          volume: Number(track.volume.toFixed(3)),
        })),
      });
    }
  }

  get isEnabled() {
    return this.enabled;
  }

  get isMusicEnabled() {
    return this.musicEnabled;
  }

  /** вызывается после первого жеста игрока */
  start(): void {
    if (typeof window === 'undefined' || this.ctx) return;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
    // только щелчки и писк; музыка живёт по своим настройкам
    this.enabled = on;
    if (!on) this.stopHum();
    else if (this.ctx) this.startHum();
  }

  /** Включает/выключает только фоновый гул ЭЛТ-монитора. */
  setCrtEnabled(on: boolean): void {
    this.crtEnabled = on;
    if (!on) this.stopHum();
    else if (this.ctx && this.enabled) this.startHum();
  }

  /** 0..1, влияет на гул, щелчки и писк */
  setSoundVolume(value: number): void {
    this.soundVolume = Math.min(1, Math.max(0, value));
    if (this.humGain) {
      this.humGain.gain.value = this.enabled && this.crtEnabled ? 0.015 * this.soundVolume : 0;
    }
  }

  /** 0..1, влияет только на музыку */
  setMusicVolume(value: number): void {
    this.musicVolume = Math.min(1, Math.max(0, value));
    if (this.music) this.music.volume = this.currentMusicVolume();
  }

  private currentMusicVolume(): number {
    if (!this.musicEnabled) return 0;
    return this.musicVolume * this.musicMax;
  }

  private clearFade(): void {
    if (this.musicFade !== null) {
      window.clearInterval(this.musicFade);
      this.musicFade = null;
    }
  }

  /** глушим и выбрасываем трек: используется и для смены, и для очистки */
  private dropTrack(track: HTMLAudioElement): void {
    try {
      track.pause();
      track.src = '';
      track.load();
    } catch {
      // элемент мог быть уже выгружен — не мешает
    }
    this.tracks.delete(track);
  }

  /** Выбрать и прогреть следующий трек плейлиста, пока играет текущий. */
  private preloadNextMusic(): void {
    if (this.musicPlaylist.length === 0) return;
    const candidates = this.musicPlaylist.filter((url) => url !== this.musicUrl);
    const pool = candidates.length > 0 ? candidates : this.musicPlaylist;
    const next = pool[Math.floor(Math.random() * pool.length)] ?? null;
    if (!next || next === this.musicUrl || next === this.musicPreloadedUrl) return;
    this.musicPreloadedUrl = next;
    void this.preload(next);
  }

  /**
   * Включить плейлист настроения: при смене выбирается случайный трек,
   * а следующий трек прогревается сразу после старта текущего.
   */
  playMusicPlaylist(urls: readonly string[], fade = 1.5, immediate = false): void {
    const playlist = [...new Set(urls.filter(Boolean))];
    this.musicPlaylist = playlist;
    if (playlist.length === 0) return;

    // Если текущий трек уже принадлежит новому плейлисту, не перезапускаем его.
    if (this.musicUrl && this.music && playlist.includes(this.musicUrl)) {
      // Игрок быстро вернулся на mood, который сейчас звучит. Отменяем
      // отложенный переход и начинаем удержание заново: следующий mood
      // должен подождать полный интервал, а текущий трек не перезапускается.
      const hadDeferredSwitch = this.musicDeferTimer !== null || this.deferredMusic !== null;
      this.clearMusicDefer();
      if (hadDeferredSwitch) this.musicStartedAt = Date.now();
      this.preloadNextMusic();
      return;
    }

    const candidates = playlist.filter((url) => url !== this.musicUrl);
    const pool = candidates.length > 0 ? candidates : playlist;
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (next) this.playMusic(next, fade, immediate);
  }

  private clearMusicDefer(): void {
    if (this.musicDeferTimer !== null) {
      window.clearTimeout(this.musicDeferTimer);
      this.musicDeferTimer = null;
    }
    this.deferredMusic = null;
  }

  private deferMusic(url: string, fade: number, delay: number): void {
    this.deferredMusic = { url, fade };
    // Не сдвигаем дедлайн при каждом новом mood: иначе при частых сценах
    // трек может не смениться вообще. Держим один интервал удержания.
    if (this.musicDeferTimer !== null) return;
    this.musicDeferTimer = window.setTimeout(() => {
      const next = this.deferredMusic;
      this.clearMusicDefer();
      if (next) this.playMusic(next.url, next.fade);
    }, Math.max(0, delay));
  }

  /**
   * Музыка по настроению сцены.
   * null — продолжать текущий трек (сцена без mood).
   * Повторный вызов с тем же url ничего не делает.
   *
   * Частые смены mood не должны превращать саундтрек в дёрганый:
   * новый трек ставится не раньше, чем через `minTrackMs`.
   */
  playMusic(url: string | null, fade = 1.5, immediate = false): void {
    if (typeof window === 'undefined' || !url) return;
    if (!this.ctx) {
      this.pendingMusic = url;
      return;
    }
    if (url === this.musicUrl && this.music) {
      this.clearMusicDefer();
      if (this.musicEnabled && this.music.paused) {
        void this.music.play().catch(() => {
          this.pendingMusic = url;
        });
      }
      return;
    }

    const elapsed = this.musicStartedAt ? Date.now() - this.musicStartedAt : Number.POSITIVE_INFINITY;
    // Исключение: бой с danger запускает свой трек сразу, без удержания.
    if (!immediate && this.music && elapsed < this.minTrackMs) {
      this.deferMusic(url, fade, this.minTrackMs - elapsed);
      return;
    }

    this.clearMusicDefer();
    this.musicUrl = url;
    document.documentElement.dataset.track = url;

    // Старый трек не глушим, пока новый реально не начал играть: иначе
    // при быстром листании и загрузке нового трека образуется тишина.
    this.clearFade();
    const prev = this.audibleTrack ?? this.music;
    for (const track of [...this.tracks]) {
      if (track !== prev) this.dropTrack(track);
    }

    const next = new Audio(url);
    next.loop = true;
    next.volume = 0;
    next.addEventListener('error', () => this.dropTrack(next));
    this.music = next;
    this.tracks.add(next);
    this.preloadNextMusic();
    if (this.musicEnabled) {
      void next.play().then(() => {
        if (this.music === next) beginCrossfade();
      }).catch(() => {
        // автовоспроизведение могло быть заблокировано — включим после жеста
        this.pendingMusic = url;
      });
    }

    let started = false;
    const beginCrossfade = () => {
      if (started || this.music !== next) return;
      started = true;
      this.audibleTrack = next;
      this.musicStartedAt = Date.now();
      this.clearFade();

      const from = prev && prev !== next ? prev : null;
      const startPrev = from?.volume ?? 0;
      const steps = 30;
      const dt = Math.max(20, (fade * 1000) / steps);
      let i = 0;

      this.musicFade = window.setInterval(() => {
        i += 1;
        const k = Math.min(1, i / steps);
        // громкость пересчитываем каждый тик: ползунок мог измениться во время фейда
        const target = this.currentMusicVolume();
        next.volume = Math.min(1, Math.max(0, target * k));
        if (from) from.volume = Math.min(1, Math.max(0, startPrev * (1 - k)));
        if (k >= 1) {
          this.clearFade();
          if (from && from !== next) this.dropTrack(from);
        }
      }, dt);
    };

    // Начинаем кроссфейд только после фактического старта воспроизведения.
    // `canplay` недостаточно: буфер готов, а play() ещё может ждать.
    next.addEventListener('playing', beginCrossfade, { once: true });
  }

  setMusicEnabled(on: boolean): void {
    this.musicEnabled = on;
    if (!on) {
      for (const track of this.tracks) track.pause();
      return;
    }
    if (this.music) {
      this.music.volume = this.currentMusicVolume();
      void this.music.play().catch(() => {});
    }
  }

  /**
   * Пауза всего звука при уходе из приложения: трек не выбрасывается,
   * чтобы после возврата продолжить с того же места.
   */
  pauseAll(): void {
    this.clearMusicDefer();
    this.clearFade();
    for (const track of this.tracks) {
      try {
        track.pause();
      } catch {
        // трек мог быть уже выгружен
      }
    }
    this.stopHum();
    void this.ctx?.suspend().catch(() => {});
  }

  /** Возврат в приложение: гул и текущий трек включаются по настройкам. */
  resumeAll(): void {
    if (!this.ctx) return;
    void this.ctx.resume().catch(() => {});
    if (this.enabled) this.startHum();
    if (!this.musicEnabled) return;
    if (this.music) {
      this.music.volume = this.currentMusicVolume();
      void this.music.play().catch(() => {});
      return;
    }
    if (this.pendingMusic) {
      const url = this.pendingMusic;
      this.pendingMusic = null;
      this.playMusic(url, 0.4);
    }
  }

  stopMusic(): void {
    this.clearMusicDefer();
    this.musicUrl = null;
    this.musicPlaylist = [];
    this.musicPreloadedUrl = null;
    this.musicStartedAt = 0;
    this.audibleTrack = null;
    this.pendingMusic = null;
    this.clearFade();
    for (const track of [...this.tracks]) this.dropTrack(track);
    this.music = null;
    delete document.documentElement.dataset.track;
  }

  private startHum(): void {
    if (!this.ctx || this.humGain || !this.enabled || !this.crtEnabled) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 55;
    gain.gain.value = this.enabled && this.crtEnabled ? 0.015 * this.soundVolume : 0;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    this.humOsc = osc;
    this.humGain = gain;
  }

  private stopHum(): void {
    this.humGain?.disconnect();
    this.humGain = null;
    try {
      this.humOsc?.stop();
    } catch {
      // осциллятор мог быть уже остановлен
    }
    this.humOsc?.disconnect();
    this.humOsc = null;
  }

  click(): void {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 180;
    gain.gain.setValueAtTime(0.05 * this.soundVolume, ctx.currentTime);
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
    gain.gain.setValueAtTime(0.06 * this.soundVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  }

  private sfxPreloads = new Map<string, Promise<void>>();
  private readonly maxSfxPreloads = 24;
  private musicStartedAt = 0;
  private deferredMusic: { url: string; fade: number } | null = null;
  private musicDeferTimer: number | null = null;
  private readonly minTrackMs = 10_000;

  /**
   * Прогрев звука: скачиваем и декодируем клип до первого боя.
   * Повторные вызовы возвращают уже созданный промис.
   */
  preload(url: string | null): Promise<void> {
    if (!url || typeof window === 'undefined') return Promise.resolve();
    const existing = this.sfxPreloads.get(url);
    if (existing) return existing;

    const promise = new Promise<void>((resolve) => {
      const clip = new Audio(url);
      clip.preload = 'auto';
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      clip.addEventListener('canplaythrough', done, { once: true });
      clip.addEventListener('loadeddata', done, { once: true });
      clip.addEventListener('error', done, { once: true });
      clip.load();
      window.setTimeout(done, 4000);
    });
    this.sfxPreloads.set(url, promise);
    while (this.sfxPreloads.size > this.maxSfxPreloads) {
      const oldest = this.sfxPreloads.keys().next().value;
      if (!oldest) break;
      this.sfxPreloads.delete(oldest);
    }
    return promise;
  }

  /** Сбросить прогретые звуки при запуске другой книги. */
  clearPreloads(): void {
    this.sfxPreloads.clear();
    this.musicPreloadedUrl = null;
  }

  /**
   * Короткий звуковой эффект (например, выстрел оружия).
   * `rate` ускоряет клип вместе с укороченной мобильной анимацией.
   */
  sfx(
    url: string,
    volume = 0.7,
    options: { rate?: number } = {},
  ): HTMLAudioElement | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    try {
      const clip = new Audio(url);
      clip.volume = Math.min(1, Math.max(0, this.soundVolume * volume));
      const rate = Number(options.rate);
      if (Number.isFinite(rate) && rate > 0) clip.playbackRate = Math.min(4, Math.max(0.25, rate));
      clip.addEventListener('ended', () => {
        clip.src = '';
      });
      void clip.play().catch(() => {
        // браузер мог заблокировать автозапуск — не ломаем бой
      });
      return clip;
    } catch {
      // звук не критичен для игрового процесса
      return null;
    }
  }
}

export const audio = new AudioEngine();
