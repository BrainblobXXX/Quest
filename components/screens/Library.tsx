'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GameIndexEntry } from '@/lib/types';

export default function Library({
  games,
  saves,
  onStart,
  onReset,
  onReload,
  sourceAt,
}: {
  games: GameIndexEntry[];
  saves: Record<string, string | undefined>;
  onStart: (id: string) => void;
  onReset: (id: string) => void;
  onReload: () => void;
  sourceAt?: string | null;
}) {
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // порядок пунктов меню: книги, затем переключатели звука и музыки
  const items = useMemo(
    () => [...games.map((g) => `game:${g.id}`), ...(games.length === 0 ? ['reload'] : [])],
    [games],
  );

  const activate = (key: string) => {
    if (key.startsWith('game:')) onStart(key.slice(5));
    else if (key === 'reload') onReload();
  };

  useEffect(() => {
    // список мог обновиться — снимаем фокус с исчезнувшего пункта
    if (focusKey && !items.includes(focusKey)) setFocusKey(null);
  }, [items, focusKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // цифра открывает книгу сразу, как и раньше
      if (/^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const entry = games[Number(e.key) - 1];
        if (entry) onStart(entry.id);
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        // клавиатурный фокус важнее мышиного: иначе Enter нажмёт старую кнопку
        (document.activeElement as HTMLElement | null)?.blur();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setFocusKey((prev) => {
          const current = prev ? items.indexOf(prev) : -1;
          if (current < 0) return items[step === 1 ? 0 : items.length - 1] ?? null;
          return items[(current + step + items.length) % items.length] ?? null;
        });
        return;
      }

      if (e.key === 'Enter' && focusKey) {
        e.preventDefault();
        activate(focusKey);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [games, items, focusKey, onStart, onReload]);

  // подсветка выбранного пункта должна попадать в видимую область
  useEffect(() => {
    if (!focusKey) return;
    document
      .querySelector(`[data-menu-key="${CSS.escape(focusKey)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [focusKey]);

  return (
    <div>
      <h1 className="screen-heading">=== БИБЛИОТЕКА ===</h1>
      {sourceAt && new Date(sourceAt).getUTCFullYear() > 2000 && (
        <div className="screen-note">
          ИСТОЧНИК: {new Date(sourceAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
        </div>
      )}

      {games.length === 0 && (
        <>
          <div className="error">ИГРЫ НЕ НАЙДЕНЫ</div>
          <button
            className={`list-item${focusKey === 'reload' ? ' menu-focused' : ''}`}
            data-menu-key="reload"
            onClick={onReload}
          >
            ОБНОВИТЬ СПИСОК
          </button>
        </>
      )}

      {games.length > 0 && (
        <div className="lib-table" role="table" aria-label="Список книг">
          <div className="lib-row lib-head" role="row">
            <span role="columnheader">№</span>
            <span role="columnheader">Книга</span>
            <span role="columnheader">Автор</span>
            <span role="columnheader">Жанр</span>
            <span role="columnheader">Прогресс</span>
          </div>

          {games.map((g, i) => (
            <div
              className={`lib-row${focusKey === `game:${g.id}` ? ' menu-focused-row' : ''}`}
              role="row"
              key={g.id}
            >
              <span className="lib-num" role="cell">
                {i + 1}.
              </span>

              <div className="lib-main" role="cell">
                <button
                  className={`lib-title${focusKey === `game:${g.id}` ? ' menu-focused' : ''}`}
                  data-menu-key={`game:${g.id}`}
                  onClick={() => onStart(g.id)}
                  title={`Играть: ${g.title}`}
                >
                  <span className="lib-title-text">{g.title}</span>
                  <span className="lib-play">▶ играть</span>
                </button>

                <div className="lib-annotation">
                  <span className="lib-k">Аннотация</span>
                  {g.annotation || '—'}
                </div>

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

              <span className="lib-cell lib-author" role="cell">
                <span className="lib-k">Автор</span>
                {g.author || '—'}
              </span>

              <span className="lib-cell lib-genre" role="cell">
                <span className="lib-k">Жанр</span>
                {g.genre || '—'}
              </span>

              <span className="lib-cell lib-progress" role="cell">
                <span className="lib-k">Прогресс</span>
                {saves[g.id] ? `ГЛАВА ${saves[g.id]}` : '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="hint">
        МЕНЮ — ↑↓ И ENTER · ЦИФРА — ОТКРЫТЬ КНИГУ · НАСТРОЙКИ ЗВУКА — НА КОРПУСЕ · ESC — В БИБЛИОТЕКУ
      </div>
    </div>
  );
}
