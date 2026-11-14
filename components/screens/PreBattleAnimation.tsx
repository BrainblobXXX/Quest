'use client';

import { useEffect, useMemo, useState } from 'react';
import { audio } from '@/lib/audio';
import { preBattleMs } from '@/lib/preBattleTiming';
import { combatSoundRate } from '@/lib/combatTiming';
import { preloadImages } from '@/lib/preload';
import {
  prebattleFrameSources,
  prebattleSoundUrl,
  type PreBattleAnimationKind,
} from '@/lib/prebattleFrames';
import type { Game } from '@/lib/types';

const FRAME_MS: Record<PreBattleAnimationKind, number> = {
  browning: preBattleMs(85),
  // граната замедлена относительно первой версии, но предбоевая анимация короче на 30%
  grenade: preBattleMs(300),
};

export type { PreBattleAnimationKind };

export default function PreBattleAnimation({
  game,
  kind,
}: {
  game: Game;
  kind: PreBattleAnimationKind;
}) {
  const frames = useMemo(() => prebattleFrameSources(game.id, kind), [game.id, kind]);
  const [frame, setFrame] = useState(0);
  const [ready, setReady] = useState(false);

  // Сначала скачиваем и декодируем все кадры и звук, только потом запускаем цикл.
  useEffect(() => {
    if (frames.length === 0) return;
    let active = true;
    setFrame(0);
    setReady(false);
    void Promise.all([
      preloadImages(frames),
      audio.preload(prebattleSoundUrl(game.id, kind)),
    ]).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [frames, game.id, kind]);

  useEffect(() => {
    if (!ready || frames.length === 0) return;

    const sound = prebattleSoundUrl(game.id, kind);
    const clip = sound
      ? audio.sfx(sound, kind === 'browning' ? 0.5 : 0.65, { rate: combatSoundRate() })
      : null;
    // Очередь Браунинга идёт по кругу, вместе с ней зациклен звук.
    if (clip && kind === 'browning') clip.loop = true;

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

    return () => {
      window.clearInterval(timer);
      if (!clip) return;
      try {
        clip.pause();
        clip.currentTime = 0;
        clip.src = '';
      } catch {
        // звук уже мог завершиться или быть выгружен
      }
    };
  }, [ready, frames, game.id, kind]);

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
