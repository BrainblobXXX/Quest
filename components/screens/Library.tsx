'use client';

import { useEffect, useState } from 'react';
import type { GameIndexEntry } from '@/lib/types';

export default function Library({
  games,
  saves,
  sound,
  music,
  soundVolume,
  musicVolume,
  onStart,
  onToggleSound,
  onToggleMusic,
  onSoundVolume,
  onMusicVolume,
  onReset,
  buildAt,
}: {
  games: GameIndexEntry[];
  saves: Record<string, string | undefined>;
  sound: boolean;
  music: boolean;
  onStart: (id: string) => void;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  soundVolume: number;
  musicVolume: number;
  onSoundVolume: (value: number) => void;
  onMusicVolume: (value: number) => void;
  onReset: (id: string) => void;
  buildAt?: string | null;
}) {
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[1-9]$/.test(e.key)) {
        const entry = games[Number(e.key) - 1];
        if (entry) onStart(entry.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [games, onStart]);

  return (
    <div>
      <h1 className="screen-heading">=== БИБЛИОТЕКА ===</h1>
      {buildAt && (
        <div className="screen-note">
          СБОРКА {new Date(buildAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
        </div>
      )}

      {games.length === 0 && <div className="error">ИГРЫ НЕ НАЙДЕНЫ</div>}

      {games.map((g, i) => (
        <div key={g.id}>
          <button className="list-item" onClick={() => onStart(g.id)}>
            {i + 1}. {g.title.toUpperCase()}
            {saves[g.id] ? ` · ГЛАВА ${saves[g.id]}` : ''}
          </button>
          {saves[g.id] &&
            (confirmReset === g.id ? (
              <div className="reset-line">
                <button
                  className="reset-btn"
                  onClick={() => {
                    onReset(g.id);
                    setConfirmReset(null);
                  }}
                >
                  СБРОСИТЬ? ДА
                </button>
                <button className="reset-btn" onClick={() => setConfirmReset(null)}>
                  НЕТ
                </button>
              </div>
            ) : (
              <button className="reset-btn" onClick={() => setConfirmReset(g.id)}>
                СБРОСИТЬ ПРОГРЕСС
              </button>
            ))}
        </div>
      ))}

      <div style={{ marginTop: 18 }}>
        <div className="volume-group">
          <button className="list-item" onClick={onToggleSound}>
            ЗВУК: {sound ? 'ВКЛ' : 'ВЫКЛ'}
          </button>
          <div className="volume-row">
            <input
              className="volume"
              type="range"
              min={0}
              max={100}
              value={Math.round(soundVolume * 100)}
              onChange={(e) => onSoundVolume(Number(e.target.value) / 100)}
              aria-label="Громкость звука"
            />
            <span className="volume-value">{Math.round(soundVolume * 100)}%</span>
          </div>
        </div>

        <div className="volume-group">
          <button className="list-item" onClick={onToggleMusic}>
            МУЗЫКА: {music ? 'ВКЛ' : 'ВЫКЛ'}
          </button>
          <div className="volume-row">
            <input
              className="volume"
              type="range"
              min={0}
              max={100}
              value={Math.round(musicVolume * 100)}
              onChange={(e) => onMusicVolume(Number(e.target.value) / 100)}
              aria-label="Громкость музыки"
            />
            <span className="volume-value">{Math.round(musicVolume * 100)}%</span>
          </div>
        </div>
      </div>

      <div className="hint">
        ВЫБОР — МЫШЬЮ ИЛИ ЦИФРОЙ · ESC — В БИБЛИОТЕКУ · PRESS ANY KEY — ПРОПУСК ЗАГРУЗКИ
      </div>
    </div>
  );
}
