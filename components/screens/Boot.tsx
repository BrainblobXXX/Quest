'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';

const LINES = [
  'QUEST-BIOS v1.0',
  '',
  'MEMORY TEST ......... 16384 KB OK',
  'DETECTING DISK ...... OK',
  'LOADING GAMES ....... 2 FOUND',
  '',
  'PRESS ANY KEY',
];

export default function Boot({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    audio.beep();
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (shown >= LINES.length) {
      const t = setTimeout(finish, 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 250 : 260);
    return () => clearTimeout(t);
  }, [shown, finish]);

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
      {LINES.slice(0, shown).map((line, i) => (
        <div key={i} className="boot-line">
          {line || '\u00a0'}
        </div>
      ))}
      <span className="boot-cursor" />
    </div>
  );
}
