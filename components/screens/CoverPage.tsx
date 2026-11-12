'use client';

import { useEffect } from 'react';
import type { Game } from '@/lib/types';

function coverUrl(game: Game, path: string): string {
  if (/^(https?:)?\//.test(path)) return path;
  return `/api/games/${game.id}/${path}`;
}

/** Первая страница книги: обложка, если она объявлена в пакете. */
export default function CoverPage({ game, onStart }: { game: Game; onStart: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key !== '1' && event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onStart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  if (!game.cover) return null;
  return (
    <div className="cover-screen">
      <div className="cover-kicker">КНИГА-ИГРА</div>
      <img className="cover-art" src={coverUrl(game, game.cover)} alt={`Обложка: ${game.title}`} />
      <div className="cover-title">{game.title.toUpperCase()}</div>
      <button type="button" className="choice selected cover-start" onClick={onStart}>
        1. ЧИТАТЬ
      </button>
    </div>
  );
}
