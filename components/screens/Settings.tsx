'use client';

import { useEffect, useState } from 'react';

const ITEMS = ['sound', 'soundVolume', 'music', 'musicVolume'] as const;

export default function Settings({
  sound,
  music,
  soundVolume,
  musicVolume,
  onToggleSound,
  onToggleMusic,
  onSoundVolume,
  onMusicVolume,
}: {
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  onSoundVolume: (value: number) => void;
  onMusicVolume: (value: number) => void;
}) {
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setFocus((prev) => {
          const current = prev ? ITEMS.indexOf(prev as (typeof ITEMS)[number]) : -1;
          if (current < 0) return ITEMS[step === 1 ? 0 : ITEMS.length - 1];
          return ITEMS[(current + step + ITEMS.length) % ITEMS.length];
        });
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!focus?.endsWith('Volume')) return;
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 0.05 : -0.05;
        if (focus === 'soundVolume') onSoundVolume(Math.round((soundVolume + step) * 100) / 100);
        else onMusicVolume(Math.round((musicVolume + step) * 100) / 100);
        return;
      }

      if (e.key === 'Enter' && focus) {
        e.preventDefault();
        if (focus === 'sound') onToggleSound();
        else if (focus === 'music') onToggleMusic();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, soundVolume, musicVolume, onSoundVolume, onMusicVolume, onToggleSound, onToggleMusic]);

  useEffect(() => {
    if (!focus) return;
    document
      .querySelector(`[data-menu-key="${CSS.escape(focus)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [focus]);

  const focusClass = (key: string) => (focus === key ? ' menu-focused' : '');

  return (
    <div>
      <h1 className="screen-heading">=== НАСТРОЙКИ ===</h1>
      <div className="screen-note">ЗВУК И МУЗЫКА ДЛЯ ВСЕХ ИГР</div>

      <div className="settings-panel">
        <div className="settings-block">
          <button
            className={`list-item${focusClass('sound')}`}
            data-menu-key="sound"
            onClick={onToggleSound}
            aria-pressed={sound}
          >
            ЗВУК: {sound ? 'ВКЛ' : 'ВЫКЛ'}
          </button>
          <div className="volume-row">
            <input
              className={`volume${focusClass('soundVolume')}`}
              data-menu-key="soundVolume"
              type="range"
              min={0}
              max={100}
              value={Math.round(soundVolume * 100)}
              onChange={(e) => onSoundVolume(Number(e.target.value) / 100)}
              aria-label="Громкость звука"
            />
            <span className="volume-value">{Math.round(soundVolume * 100)}%</span>
          </div>
          <div className="settings-note">щелчки, гул и писк</div>
        </div>

        <div className="settings-block">
          <button
            className={`list-item${focusClass('music')}`}
            data-menu-key="music"
            onClick={onToggleMusic}
            aria-pressed={music}
          >
            МУЗЫКА: {music ? 'ВКЛ' : 'ВЫКЛ'}
          </button>
          <div className="volume-row">
            <input
              className={`volume${focusClass('musicVolume')}`}
              data-menu-key="musicVolume"
              type="range"
              min={0}
              max={100}
              value={Math.round(musicVolume * 100)}
              onChange={(e) => onMusicVolume(Number(e.target.value) / 100)}
              aria-label="Громкость музыки"
            />
            <span className="volume-value">{Math.round(musicVolume * 100)}%</span>
          </div>
          <div className="settings-note">треки сцен, отдельно от эффектов</div>
        </div>
      </div>

      <div className="hint">
        МЕНЮ — ↑↓ И ENTER · ←→ — ГРОМКОСТЬ · ESC — В БИБЛИОТЕКУ · PRESS ANY KEY — ПРОПУСК ЗАГРУЗКИ
      </div>
    </div>
  );
}
