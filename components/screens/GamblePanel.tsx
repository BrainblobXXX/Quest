'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import type { GambleDef, Game, GameState } from '@/lib/types';

const DIE_PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function DieFace({ value }: { value: number }) {
  const active = DIE_PIPS[value] ?? [];
  return (
    <span className="combat-die-face check-die-face" role="img" aria-label={`${value}`}>
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className={`combat-die-pip${active.includes(index + 1) ? ' on' : ''}`} />
      ))}
    </span>
  );
}

export default function GamblePanel({
  game,
  state,
  gamble,
  onDone,
}: {
  game: Game;
  state: GameState;
  gamble: GambleDef;
  onDone: (delta: number) => void;
}) {
  const money = Number(state.stats.money ?? 0);
  const statTitle = (game.stats?.[gamble.stat]?.title ?? gamble.stat).toUpperCase();
  const maxStake = Math.min(gamble.stake.max, Math.max(0, money));
  const [stake, setStake] = useState(Math.min(gamble.stake.min, maxStake));
  const [phase, setPhase] = useState<'offer' | 'rolling' | 'done'>('offer');
  const [faces, setFaces] = useState<[number, number]>([1, 1]);
  const [total, setTotal] = useState(0);
  const [delta, setDelta] = useState(0);
  const timer = useRef<number | null>(null);
  const interval = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (interval.current !== null) window.clearInterval(interval.current);
  }, []);

  const play = () => {
    if (phase !== 'offer' || stake <= 0 || stake > money) return;
    const a = 1 + Math.floor(Math.random() * 6);
    const b = 1 + Math.floor(Math.random() * 6);
    setFaces([a, b]);
    setPhase('rolling');
    audio.click();
    interval.current = window.setInterval(() => {
      setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    }, 80);
    timer.current = window.setTimeout(() => {
      if (interval.current !== null) {
        window.clearInterval(interval.current);
        interval.current = null;
      }
      timer.current = null;
      setFaces([a, b]);
      const result = a + b + Number(state.stats[gamble.stat] ?? 0);
      const change = result >= gamble.win ? stake : result >= gamble.push ? 0 : -stake;
      setTotal(result);
      setDelta(change);
      setPhase('done');
      audio.beep();
    }, 1300);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase === 'offer') {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          play();
          return;
        }
        if (/^[1-9]$/.test(event.key)) {
          const value = gamble.stake.min + Number(event.key) - 1;
          if (value <= gamble.stake.max && value <= money) {
            event.preventDefault();
            event.stopPropagation();
            setStake(value);
          }
        }
        return;
      }
      if (phase === 'done' && (event.key === 'Enter' || event.key === ' ' || event.key === '1')) {
        event.preventDefault();
        event.stopPropagation();
        onDone(delta);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phase, stake, money, delta]);

  return (
    <div className="gamble-panel" aria-label="Ставка">
      <div className="check-title">СТАВКА</div>
      <div className="check-formula">{statTitle} + 2d6 · у вас {money} серебра</div>
      {phase === 'offer' && (
        <>
          <div className="gamble-stakes">
            {Array.from({ length: gamble.stake.max - gamble.stake.min + 1 }, (_, index) => gamble.stake.min + index)
              .filter((value) => value <= money)
              .map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`choice${stake === value ? ' selected' : ''}`}
                  onClick={() => setStake(value)}
                >
                  {value}
                </button>
              ))}
          </div>
          <div className="choices check-choices">
            <button type="button" className="choice selected" onClick={play} disabled={maxStake <= 0}>
              1. ПОСТАВИТЬ {stake}
            </button>
          </div>
        </>
      )}
      {phase === 'rolling' && (
        <>
          <div className="check-dice">
            <DieFace value={faces[0]} />
            <DieFace value={faces[1]} />
          </div>
          <div className="check-note">БРОСОК…</div>
        </>
      )}
      {phase === 'done' && (
        <>
          <div className="check-result">
            {faces[0]} + {faces[1]} + {Number(state.stats[gamble.stat] ?? 0)} = {total}:{' '}
            {delta > 0 ? `ВЫИГРЫШ +${delta}` : delta < 0 ? `ПРОИГРЫШ ${delta}` : 'СТАВКА ВОЗВРАЩЕНА'}
          </div>
          <div className="choices check-choices">
            <button type="button" className="choice selected" onClick={() => onDone(delta)}>
              1. ПРОДОЛЖИТЬ
            </button>
          </div>
        </>
      )}
    </div>
  );
}
