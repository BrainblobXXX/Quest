'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { LoadProgress, LoadStage } from '@/lib/games';

/**
 * Экран загрузки книги в духе MS-DOS: строки BIOS-загрузчика появляются по мере
 * чтения пакета, счётчик байт настоящий, а поток шестнадцатеричных пар тикает,
 * пока сервер отдаёт файлы. Он нужен именно на медленном хостинге: игрок видит,
 * что приложение работает, а не зависло.
 */

const RANK: Record<LoadStage, number> = {
  mount: 0,
  manifest: 1,
  story: 2,
  items: 3,
  parse: 4,
  ready: 5,
};

const STAGE_STATUS: Record<LoadStage, string> = {
  mount: 'чтение каталога',
  manifest: 'разбор обложки',
  story: 'чтение текста книги',
  items: 'загрузка предметов',
  parse: 'сборка сцен',
  ready: 'книга загружена',
};

const LOG_LINES = 10;
const BAR_CELLS = 16;

type RowState = 'ok' | 'active' | 'wait';

function kb(bytes: number): string {
  return String(Math.max(0, Math.ceil(bytes / 1024)));
}

function percent(progress: LoadProgress): number {
  switch (progress.stage) {
    case 'mount':
      return 3;
    case 'manifest':
      return 10;
    case 'story': {
      // 12–68%: реальная доля прочитанного story.md
      const total = progress.total ?? 0;
      const part = total > 0 ? Math.min(1, (progress.loaded ?? 0) / total) : 0;
      return Math.min(68, Math.round(12 + 56 * part));
    }
    case 'items':
      return 72;
    case 'parse':
      return 82;
    case 'ready':
      return 100;
    default:
      return 0;
  }
}

/** псевдослучайный, но воспроизводимый поток байт: одинаков на сервере и клиенте */
function hexBytes(seed: number, count: number): string {
  let x = (Math.imul(seed + 1, 2654435761) >>> 0) || 1;
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out.push((x & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  }
  return out.join(' ');
}

function rowState(done: boolean, active: boolean): RowState {
  if (done) return 'ok';
  return active ? 'active' : 'wait';
}

export default function Loading({
  id,
  title,
  progress,
  scenes,
}: {
  id: string;
  title: string;
  progress: LoadProgress;
  scenes?: number;
}) {
  const [shown, setShown] = useState(1);
  const [tick, setTick] = useState(0);

  // строки появляются одна за другой, как в BIOS
  useEffect(() => {
    if (shown >= LOG_LINES) return;
    const t = setTimeout(() => setShown((n) => Math.min(LOG_LINES, n + 1)), shown === 1 ? 140 : 90);
    return () => clearTimeout(t);
  }, [shown]);

  // точка и счётчики «живут», пока идёт загрузка
  useEffect(() => {
    const every = progress.stage === 'ready' ? 240 : 90;
    const t = setInterval(() => setTick((n) => n + 1), every);
    return () => clearInterval(t);
  }, [progress.stage]);

  const rank = RANK[progress.stage];
  const p = percent(progress);
  const done = rank >= 5;

  const packageDone = rank >= 1;
  const storyDone = rank >= 3;
  const storyActive = progress.stage === 'manifest' || progress.stage === 'story';
  const scenesActive = progress.stage === 'items' || progress.stage === 'parse';

  const waiting = `WAIT${'.'.repeat(1 + (tick % 3))}`;
  const loadedBytes = progress.total
    ? Math.min(progress.loaded ?? 0, progress.total)
    : (progress.loaded ?? 0);
  const loadedKb = kb(loadedBytes);
  const totalKb = progress.total ? kb(progress.total) : '';

  const packageValue = packageDone ? 'OK' : waiting;
  const storyWaiting =
    !storyDone && (progress.stage !== 'story' || (!progress.loaded && !progress.total));
  const hasSize = progress.loaded !== undefined || progress.total !== undefined;
  const storyValue = storyDone
    ? hasSize
      ? `${totalKb || loadedKb} KB`
      : 'OK'
    : storyWaiting
      ? waiting
      : totalKb
        ? `${loadedKb} / ${totalKb} KB`
        : `${loadedKb} KB`;
  const scenesValue = done ? `${scenes ?? '?'} SCENES` : scenesActive ? waiting : '...';

  const filled = Math.round((p / 100) * BAR_CELLS);
  const meter = `${'█'.repeat(filled)}${'░'.repeat(BAR_CELLS - filled)}`;
  const sizeText = hasSize
    ? totalKb
      ? `${loadedKb} / ${totalKb} KB`
      : `${loadedKb} KB`
    : '';
  const seed = tick * 7 + Math.floor((progress.loaded ?? 0) / 2048) + rank * 13 + 1;

  const line = (
    key: string,
    label: string,
    value: string,
    state: RowState | 'title',
    cursor = false,
  ): ReactNode => (
    <div className="bookload-line" key={key}>
      <span className="bookload-label">{label}</span>
      <span className={`bookload-value bookload-${state}`}>{value}</span>
      {cursor && <span className="boot-cursor bookload-cursor" aria-hidden="true" />}
    </div>
  );

  const rows: ReactNode[] = [
    <div className="bookload-raw" key="bios">
      QUEST-BIOS v1.0
    </div>,
    <div className="bookload-raw bookload-dim" key="loader">
      BOOK LOADER v2.11 · {id.toUpperCase()}
    </div>,
    <div className="bookload-gap" key="gap1" />,
    line('book', 'LOADING BOOK .......', title.toUpperCase(), 'title'),
    line(
      'package',
      'READ PACKAGE .......',
      packageValue,
      rowState(packageDone, progress.stage === 'mount'),
      progress.stage === 'mount',
    ),
    line(
      'story',
      'READ STORY .........',
      storyValue,
      rowState(storyDone, storyActive),
      storyActive,
    ),
    line(
      'scenes',
      'DECODE SCENES ......',
      scenesValue,
      rowState(done, scenesActive),
      done || scenesActive,
    ),
    <div className="bookload-gap" key="gap2" />,
    <div className="bookload-bar" key="bar">
      <span className="bookload-meter" aria-hidden="true">
        [{meter}]
      </span>
      <span className="bookload-percent">{p}%</span>
      {sizeText && <span className="bookload-bytes">{sizeText}</span>}
    </div>,
    <div className={`bookload-hex${done ? ' bookload-hex-ready' : ''}`} key="hex" aria-hidden="true">
      {done ? 'READY.' : hexBytes(seed, 14)}
    </div>,
  ];

  return (
    <div className="bookload" aria-busy={!done}>
      <span className="bookload-sr" role="status" aria-live="polite">
        {done
          ? `Книга «${title}» загружена.`
          : `Загрузка книги «${title}»: ${STAGE_STATUS[progress.stage]}.`}
      </span>
      {rows.slice(0, shown)}
    </div>
  );
}
