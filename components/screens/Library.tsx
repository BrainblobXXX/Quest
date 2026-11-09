'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
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

type LibraryCategory = 'release' | 'beta' | 'alpha';

const CATEGORY_LABELS: Record<LibraryCategory, string> = {
  release: 'РЕЛИЗ',
  beta: 'БЕТА',
  alpha: 'АЛЬФА',
};

const CATEGORY_ORDER: LibraryCategory[] = ['release', 'beta', 'alpha'];

function categoryOf(status?: string): LibraryCategory {
  const value = (status ?? '').toLowerCase();
  if (value === 'release' || value === 'released' || value === 'complete') return 'release';
  if (value === 'alpha') return 'alpha';
  return 'beta';
}

function statusLabel(status?: string): string {
  if (!status) return '—';
  const normalized = status.toLowerCase();
  if (normalized === 'alpha') return 'АЛЬФА-ТЕСТ';
  if (normalized === 'beta') return 'БЕТА-ТЕСТ';
  if (normalized === 'release' || normalized === 'released') return 'РЕЛИЗ';
  if (normalized === 'complete') return 'ЗАВЕРШЕНА';
  return status.toUpperCase();
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

function coverUrl(id: string, cover: string): string {
  if (/^(https?:)?\//.test(cover)) return cover;
  return `/api/games/${encodeURIComponent(id)}/${cover.split('/').map(encodeURIComponent).join('/')}`;
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
  const [coverPreview, setCoverPreview] = useState<{ title: string; src: string } | null>(null);

  // Релиз сверху, затем бета и альфа; внутри категории — по названию.
  const orderedGames = useMemo(
    () =>
      [...games].sort((a, b) => {
        const byCategory = CATEGORY_ORDER.indexOf(categoryOf(a.status)) - CATEGORY_ORDER.indexOf(categoryOf(b.status));
        return byCategory || a.title.localeCompare(b.title, 'ru');
      }),
    [games],
  );

  // порядок пунктов меню: книги, затем перезагрузка, если список пуст
  const items = useMemo(
    () => [...orderedGames.map((g) => `game:${g.id}`), ...(orderedGames.length === 0 ? ['reload'] : [])],
    [orderedGames],
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
        const entry = orderedGames[Number(e.key) - 1];
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

      // на настоящей кнопке (Старт/Сброс/название) Enter и пробел обрабатывает она сама
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        /^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(active.tagName)
      ) {
        return;
      }

      if (e.key === 'Enter' && focusKey) {
        e.preventDefault();
        if (focusKey.startsWith('game:')) onStart(focusKey.slice(5));
        else if (focusKey === 'reload') onReload();
        return;
      }

      if ((e.key === ' ' || e.key === 'Spacebar') && focusKey) {
        e.preventDefault();
        if (focusKey.startsWith('game:')) {
          const id = focusKey.slice(5);
          setOpenId((prev) => (prev === id ? null : id));
          setConfirmReset(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [orderedGames, items, focusKey, onStart, onReload]);

  // подсветка выбранного пункта должна попадать в видимую область
  useEffect(() => {
    if (!focusKey) return;
    document
      .querySelector(`[data-menu-key="${CSS.escape(focusKey)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [focusKey, openId]);

  useEffect(() => {
    if (!coverPreview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setCoverPreview(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [coverPreview]);

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

            {orderedGames.map((g, i) => {
              const key = `game:${g.id}`;
              const open = openId === g.id;
              const focused = focusKey === key;
              const progress = saves[g.id];
              const category = categoryOf(g.status);
              const previousCategory = i > 0 ? categoryOf(orderedGames[i - 1].status) : null;
              const showGroup = category !== previousCategory;
              const groupCount = orderedGames.filter((item) => categoryOf(item.status) === category).length;

              return (
                <Fragment key={g.id}>
                {showGroup && (
                  <div className={`lib-group-row lib-group-${category}`} role="row">
                    <span role="columnheader">
                      {CATEGORY_LABELS[category]}
                      <span className="lib-group-count">{groupCount}</span>
                    </span>
                  </div>
                )}
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
                    {g.cover && (
                      <button
                        type="button"
                        className="lib-cover"
                        onClick={(event) => {
                          event.stopPropagation();
                          setCoverPreview({ title: g.title, src: coverUrl(g.id, g.cover!) });
                        }}
                        aria-label={`Увеличить обложку: ${g.title}`}
                        title="Увеличить обложку"
                      >
                        <img src={coverUrl(g.id, g.cover)} alt="" loading="lazy" />
                      </button>
                    )}
                    <button
                      type="button"
                      className={`lib-title${focused ? ' menu-focused' : ''}`}
                      data-menu-key={key}
                      aria-expanded={open}
                      aria-controls={`lib-details-${g.id}`}
                      onClick={() => toggleOpen(g.id)}
                      onKeyDown={(e) => {
                        // Enter — старт, пробел — детали; не даём кнопке
                        // сработать ещё раз как обычному button
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          onStart(g.id);
                        } else if (e.key === ' ' || e.key === 'Spacebar') {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleOpen(g.id);
                        }
                      }}
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
                            <span className="lib-k">Статус</span>
                            <span className={`lib-status lib-status-${(g.status ?? 'unknown').toLowerCase()}`}>
                              {statusLabel(g.status)}
                            </span>
                          </div>
                          <div>
                            <span className="lib-k">Прогресс</span>
                            {progress
                              ? /^\d+$/.test(progress)
                                ? `ГЛАВА ${progress}`
                                : progress === 'prolog' || progress === 'prologue'
                                  ? 'ПРОЛОГ'
                                  : progress === 'rules'
                                    ? 'ПРАВИЛА'
                                    : progress.toUpperCase()
                              : '—'}
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
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {coverPreview && (
        <div
          className="lib-cover-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Обложка: ${coverPreview.title}`}
          onClick={() => setCoverPreview(null)}
        >
          <button
            type="button"
            className="lib-cover-close"
            onClick={() => setCoverPreview(null)}
            aria-label="Закрыть обложку"
          >
            ×
          </button>
          <img src={coverPreview.src} alt={`Обложка: ${coverPreview.title}`} onClick={(event) => event.stopPropagation()} />
        </div>
      )}

      <div className="hint">
        МЕНЮ — ↑↓ · ENTER — СТАРТ · ПРОБЕЛ — ДЕТАЛИ · ЦИФРА — СТАРТ · ESC — В БИБЛИОТЕКУ
      </div>
    </div>
  );
}
