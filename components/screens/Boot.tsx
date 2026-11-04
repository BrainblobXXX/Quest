'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';

const LINES = [
  'QUEST-BIOS v1.0',
  '',
  'MEMORY TEST ......... 16384 KB OK',
  'DETECTING DISK ...... OK',
  'LOADING GAMES ....... {N} FOUND',
  '',
  'PRESS ANY KEY',
];

/** дата сборки игр из /games/build.json — по ней видно, какая версия загружена */
function stamp(buildAt?: string | null): string | null {
  if (!buildAt) return null;
  const iso = new Date(buildAt);
  if (Number.isNaN(iso.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${iso.getUTCFullYear()}-${pad(iso.getUTCMonth() + 1)}-${pad(iso.getUTCDate())} ${pad(
    iso.getUTCHours(),
  )}:${pad(iso.getUTCMinutes())} UTC`;
}

export default function Boot({
  buildAt,
  gamesCount,
  onDone,
}: {
  buildAt?: string | null;
  gamesCount?: number;
  onDone: () => void;
}) {
  const [shown, setShown] = useState(0);
  const doneRef = useRef(false);

  const seen = stamp(buildAt);
  const base = LINES.map((line) =>
    line.replace('{N}', String(gamesCount ?? 0)),
  );
  const lines = seen ? [...base.slice(0, 6), `GAMES SOURCE ........ ${seen}`, ...base.slice(6)] : base;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    audio.beep();
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (shown >= lines.length) {
      const t = setTimeout(finish, 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 250 : 260);
    return () => clearTimeout(t);
  }, [shown, finish, lines.length]);

  useEffect(() => {
    const skip = () => finish();
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [finish]);

  return (
    <div>
      {lines.slice(0, shown).map((line, i) => (
        <div key={i} className="boot-line">
          {line || '\u00a0'}
        </div>
      ))}
      <span className="boot-cursor" />
    </div>
  );
}
