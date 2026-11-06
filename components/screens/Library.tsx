'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GameIndexEntry } from '@/lib/types';

/** тип книги для колонки «Тип»; неизвестное значение показываем как есть */
const TYPE_LABELS: Record<string, string> = {
  'story-book': 'стори-бук',
  storybook: 'стори-бук',
  'fighting-fantasy': 'фентези-батл',
  'fantasy-battle': 'фентези-батл',
  fantasy: 'фентези',
  rpg: 'рпг',
  hybrid: 'гибрид',
  demo: 'демо',
};

function typeLabel(type?: string): string {
  if (!type) return '—';
  return TYPE_LABELS[type.toLowerCase()] ?? type;
}

/** «фантастика · книга-игра» → «фантастика»: тип теперь в отдельной колонке */
function genreLabel(genre?: string): string {
  if (!genre) return '—';
  const clean = genre
    .replace(/\s*[·•,/]?\s*книга[\s-]?игра\s*/gi, ' ')
    .replace(/\s*[·•,/]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return clean || '—';
}

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
  const [openId, setOpenId] = useState<string | null>(null);

  // порядок пунктов меню: книги, затем перезагрузка, если список пуст
  const items = useMemo(
    () => [...games.map((g) => `game:${g.id}`), ...(games.length === 0 ? ['reload'] : [])],
    [games],
  );

  const toggleOpen = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
    setConfirmReset(null);
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
        // если фокус на настоящей кнопке (Старт/Сброс), Enter должен нажать её,
        // а не перехватываться глобальным меню
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          /^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(active.tagName)
        ) {
          return;
        }
        e.preventDefault();
        if (focusKey.startsWith('game:')) {
          // Enter раскрывает карточку; запуск — отдельной кнопкой «СТАРТ»
          const id = focusKey.slice(5);
          setOpenId((prev) => (prev === id ? null : id));
          setConfirmReset(null);
        } else if (focusKey === 'reload') {
          onReload();
        }
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
  }, [focusKey, openId]);

  return (
    <div className="library-screen">
      <div className="library-scroll">
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
              <span role="columnheader">Книга</span>
              <span role="columnheader">Жанр</span>
              <span role="columnheader">Тип</span>
              <span role="columnheader">Старт</span>
            </div>

            {games.map((g, i) => {
              const key = `game:${g.id}`;
              const open = openId === g.id;
              const focused = focusKey === key;
              const progress = saves[g.id];

              return (
                <div
                  className={`lib-row${focused ? ' menu-focused-row' : ''}${
                    open ? ' lib-row-open' : ''
                  }`}
                  role="row"
                  key={g.id}
                  onClick={(e) => {
                    // клик по пустому месту строки тоже раскрывает карточку;
                    // кнопки и раскрытый текст обрабатывают себя сами
                    const target = e.target as HTMLElement;
                    if (target.closest('button, .lib-details')) return;
                    toggleOpen(g.id);
                  }}
                >
                  <div className="lib-main" role="cell">
                    <button
                      type="button"
                      className={`lib-title${focused ? ' menu-focused' : ''}`}
                      data-menu-key={key}
                      aria-expanded={open}
                      aria-controls={`lib-details-${g.id}`}
                      onClick={() => toggleOpen(g.id)}
                      title={open ? 'Свернуть карточку' : 'Автор и аннотация'}
                    >
                      <span className="lib-num" aria-hidden="true">
                        {i + 1}.
                      </span>
                      <span className="lib-title-text">{g.title}</span>
                      <span className={`lib-chevron${open ? ' open' : ''}`} aria-hidden="true">
                        ▸
                      </span>
                    </button>
                  </div>

                  <span className="lib-cell lib-genre" role="cell">
                    <span className="lib-k">Жанр</span>
                    {genreLabel(g.genre)}
                  </span>

                  <span className="lib-cell lib-type" role="cell">
                    <span className="lib-k">Тип</span>
                    {typeLabel(g.type)}
                  </span>

                  <div className="lib-actions" role="cell">
                    <button
                      type="button"
                      className="lib-start"
                      onClick={() => onStart(g.id)}
                      title={`Начать: ${g.title}`}
                    >
                      Старт
                    </button>
                  </div>

                  {open && (
                    <div
                      className="lib-details"
                      id={`lib-details-${g.id}`}
                      role="cell"
                      aria-colspan={4}
                    >
                      <div className="lib-details-inner">
                        <div className="lib-details-meta">
                          <div>
                            <span className="lib-k">Автор</span>
                            {g.author || '—'}
                          </div>
                          <div>
                            <span className="lib-k">Прогресс</span>
                            {progress ? `ГЛАВА ${progress}` : '—'}
                          </div>
                        </div>

                        <div className="lib-annotation">
                          <span className="lib-k">Аннотация</span>
                          {g.annotation || '—'}
                        </div>

                        {progress &&
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="hint">
        МЕНЮ — ↑↓ И ENTER (РАСКРЫТЬ) · ЦИФРА — СТАРТ · ESC — В БИБЛИОТЕКУ
      </div>
    </div>
  );
}
