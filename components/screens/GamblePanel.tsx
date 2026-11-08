'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import { usePanelKeys } from '@/lib/usePanelKeys';
import { rollDie, roll2d6 } from '@/lib/rng';
import { DieFace } from '@/components/screens/Dice';
import type { GambleDef, Game, GameState } from '@/lib/types';


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
    const rolled = roll2d6();
    const a = rolled.faces[0];
    const b = rolled.faces[1];
    setFaces([a, b]);
    setPhase('rolling');
    audio.click();
    interval.current = window.setInterval(() => {
      setFaces([rollDie(6), rollDie(6)]);
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

  usePanelKeys((event) => {
    if (phase === 'offer') {
      if (event.key === 'Enter' || event.key === ' ') {
        play();
        return true;
      }
      if (/^[1-9]$/.test(event.key)) {
        const value = gamble.stake.min + Number(event.key) - 1;
        if (value <= gamble.stake.max && value <= money) {
          setStake(value);
          return true;
        }
      }
      return false;
    }
    if (phase === 'done' && (event.key === 'Enter' || event.key === ' ' || event.key === '1')) {
      onDone(delta);
      return true;
    }
    return false;
  });

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
            <DieFace value={faces[0]} className="combat-die-face check-die-face" />
            <DieFace value={faces[1]} className="combat-die-face check-die-face" />
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
