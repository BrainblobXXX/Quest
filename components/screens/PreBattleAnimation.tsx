'use client';

import { useEffect, useMemo, useState } from 'react';
import { audio } from '@/lib/audio';
import type { Game } from '@/lib/types';

export type PreBattleAnimationKind = 'browning' | 'grenade';

const FRAME_MS: Record<PreBattleAnimationKind, number> = {
  browning: 85,
  // граната замедлена вдвое относительно первой версии
  grenade: 300,
};

export default function PreBattleAnimation({
  game,
  kind,
}: {
  game: Game;
  kind: PreBattleAnimationKind;
}) {
  const frames = useMemo(() => {
    if (game.id !== 'zombie-blood') return [];
    const base = `/api/games/${encodeURIComponent(game.id)}/assets/effects`;
    if (kind === 'browning') {
      return Array.from({ length: 10 }, (_, index) => `${base}/browning/machinegun-${String(index + 1).padStart(2, '0')}.png`);
    }
    return [
      ...Array.from({ length: 5 }, (_, index) => `${base}/grenade/throw/grenade-${String(index + 1).padStart(2, '0')}.png`),
      ...Array.from({ length: 5 }, (_, index) => `${base}/grenade/explosion/explosion-${String(index + 1).padStart(2, '0')}.png`),
    ];
  }, [game.id, kind]);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (frames.length === 0) return;
    const base = `/api/games/${encodeURIComponent(game.id)}/assets/sounds/effects`;
    const clip = audio.sfx(
      `${base}/${kind === 'browning' ? 'machinegun' : 'grenade-throw'}.mp3`,
      kind === 'browning' ? 0.5 : 0.65,
    );
    // Очередь Браунинга идёт по кругу, вместе с ней зациклен звук.
    if (clip && kind === 'browning') clip.loop = true;
    return () => {
      if (!clip) return;
      try {
        clip.pause();
        clip.currentTime = 0;
        clip.src = '';
      } catch {
        // звук уже мог завершиться или быть выгружен
      }
    };
  }, [game.id, kind, frames.length]);

  useEffect(() => {
    if (frames.length === 0) return;
    setFrame(0);
    // Браунинг зациклен, граната проигрывается один раз и остаётся на последнем кадре.
    const loop = kind === 'browning';
    const timer = window.setInterval(() => {
      setFrame((current) => {
        if (current >= frames.length - 1) {
          if (loop) return 0;
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, FRAME_MS[kind]);
    return () => window.clearInterval(timer);
  }, [frames.length, kind]);

  if (frames.length === 0) return null;

  return (
    <div
      className={`combat-prebattle-animation is-${kind}`}
      role="status"
      aria-label={kind === 'browning' ? 'Очередь пулемёта' : 'Взрыв гранаты'}
    >
      <img
        src={frames[frame]}
        alt={kind === 'browning' ? 'Пулемёт ведёт очередь' : 'Взрыв гранаты'}
        draggable={false}
      />
    </div>
  );
}
