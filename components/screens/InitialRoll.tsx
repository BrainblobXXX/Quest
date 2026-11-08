'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import { usePanelKeys } from '@/lib/usePanelKeys';
import { rollDie } from '@/lib/rng';
import { DieFace } from '@/components/screens/Dice';
import type { Game } from '@/lib/types';

type Phase = 'offer' | 'rolling' | 'done';


function diceCount(formula: string): number {
  const match = /^(\d+)d/i.exec(formula.trim());
  return Math.max(1, Number(match?.[1] ?? 1));
}

export default function InitialRoll({
  game,
  statId,
  onDone,
}: {
  game: Game;
  statId: string;
  onDone: (value: number) => void;
}) {
  const stat = game.stats?.[statId];
  const title = (stat?.title ?? statId).toUpperCase();
  const base = Number(stat?.initial ?? 0);
  const formula = stat?.roll ?? '2d6';
  const count = diceCount(formula);
  const [phase, setPhase] = useState<Phase>('offer');
  const [faces, setFaces] = useState<number[]>([]);
  const [rolls, setRolls] = useState<number[]>([]);
  const timer = useRef<number | null>(null);
  const interval = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (interval.current !== null) window.clearInterval(interval.current);
  }, []);

  const roll = () => {
    if (phase !== 'offer') return;
    const values = Array.from({ length: count }, () => rollDie(6));
    setRolls(values);
    setFaces(Array.from({ length: count }, () => rollDie(6)));
    setPhase('rolling');
    audio.click();
    interval.current = window.setInterval(() => {
      setFaces(Array.from({ length: count }, () => rollDie(6)));
    }, 80);
    timer.current = window.setTimeout(() => {
      if (interval.current !== null) {
        window.clearInterval(interval.current);
        interval.current = null;
      }
      setFaces(values);
      setPhase('done');
      timer.current = null;
      audio.beep();
    }, 1500);
  };

  const sum = rolls.reduce((total, value) => total + value, 0);
  const total = base + sum;

  usePanelKeys((event) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== '1') return false;
    if (document.activeElement instanceof HTMLElement && document.activeElement.tagName === 'BUTTON') {
      return false;
    }
    if (phase === 'offer') roll();
    else if (phase === 'done') onDone(total);
    return true;
  });

  return (
    <div className="stamina-roll">
      <div className="stamina-roll-kicker">НАЧАЛО ПРИКЛЮЧЕНИЯ</div>
      <h1 className="stamina-roll-title">БРОСОК: {title}</h1>
      <div className="stamina-roll-text">
        Чтобы определить начальную {title.toLowerCase()}, бросьте {count > 1 ? 'два кубика' : 'кубик'} и добавьте {base}.
      </div>

      <div className="stamina-roll-stage">
        {faces.map((face, index) => (
          <DieFace value={face} key={index} className="combat-die-face stamina-die-face" />
        ))}
        {faces.length === 0 && <span className="stamina-roll-empty">—</span>}
      </div>

      {phase === 'offer' && (
        <div className="choices stamina-roll-choices">
          <button type="button" className="choice selected" onClick={roll}>
            1. БРОСИТЬ КУБИКИ
          </button>
        </div>
      )}

      {phase === 'rolling' && <div className="stamina-roll-note">БРОСОК…</div>}

      {phase === 'done' && (
        <>
          <div className="stamina-roll-result">
            ВЫПАЛО: {rolls.join(' + ')} = {sum}
          </div>
          <div className="stamina-roll-result">
            {title}: {base} + {sum} = <strong>{total}</strong>
          </div>
          <div className="choices stamina-roll-choices">
            <button type="button" className="choice selected" onClick={() => onDone(total)}>
              1. ПРОДОЛЖИТЬ
            </button>
          </div>
        </>
      )}
    </div>
  );
}
