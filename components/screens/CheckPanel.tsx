'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import { usePanelKeys } from '@/lib/usePanelKeys';
import { rollDie } from '@/lib/rng';
import { DieFace } from '@/components/screens/Dice';
import {
  checkLabel,
  checkValue,
  isDeterministicCheck,
  resolveDeterministicCheck,
  resolveRolledCheck,
} from '@/lib/mechanics/check';
import type { CheckDef, Game, GameState } from '@/lib/types';

export default function CheckPanel({
  game,
  state,
  check,
  onResolve,
}: {
  game: Game;
  state: GameState;
  check: CheckDef;
  onResolve: (success: boolean, moraleCost?: number) => void;
}) {
  const value = checkValue(state, check);
  const deterministic = isDeterministicCheck(game, check);
  const [phase, setPhase] = useState<'offer' | 'rolling' | 'done'>('offer');
  const [faces, setFaces] = useState<[number, number]>([1, 1]);
  const [success, setSuccess] = useState(false);
  const [moraleCost, setMoraleCost] = useState(0);
  const timer = useRef<number | null>(null);
  const interval = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (interval.current !== null) window.clearInterval(interval.current);
  }, []);

  const resolve = () => {
    if (phase !== 'offer') return;
    if (deterministic) {
      const result = resolveDeterministicCheck(game, state, check);
      setSuccess(result.success);
      setMoraleCost(result.moraleCost);
      setPhase('done');
      audio.beep();
      return;
    }

    const a = rollDie(6);
    const b = rollDie(6);
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
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      setFaces([a, b]);
      const result = resolveRolledCheck(state, check, [a, b]);
      setSuccess(result.success);
      setPhase('done');
      audio.beep();
    }, 1300);
  };

  usePanelKeys((event) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== '1') return false;
    if (phase === 'offer') {
      resolve();
      return true;
    }
    if (phase === 'done') {
      onResolve(success, moraleCost);
      return true;
    }
    return false;
  });

  const label = checkLabel(game, check);

  return (
    <div className="check-panel" aria-label="Проверка">
      <div className="check-title">ПРОВЕРКА</div>
      <div className="check-formula">{label}</div>
      {!deterministic && phase !== 'offer' && (
        <div className="check-dice">
          <DieFace value={faces[0]} className="combat-die-face check-die-face" />
          <DieFace value={faces[1]} className="combat-die-face check-die-face" />
        </div>
      )}
      {phase === 'offer' && (
        <div className="choices check-choices">
          <button type="button" className="choice selected" onClick={resolve}>
            1. {deterministic ? 'ПРОВЕРИТЬ' : 'БРОСИТЬ ПРОВЕРКУ'}
          </button>
        </div>
      )}
      {phase === 'rolling' && <div className="check-note">БРОСОК…</div>}
      {phase === 'done' && (
        <>
          <div className={`check-result ${success ? 'ok' : 'fail'}`}>
            {deterministic
              ? `${value} ${check.compare ?? `против сложности ${check.difficulty}`}: ${success ? 'УСПЕХ' : 'ПРОВАЛ'}`
              : `${faces[0]} + ${faces[1]} + ${value} = ${faces[0] + faces[1] + value}: ${success ? 'УСПЕХ' : 'ПРОВАЛ'}`}
          </div>
          {game.type === 'rpg' && check.skill && (
            <div className="check-result">МОРАЛЬ −{moraleCost}</div>
          )}
          <div className="choices check-choices">
            <button type="button" className="choice selected" onClick={() => onResolve(success, moraleCost)}>
              1. ПРОДОЛЖИТЬ
            </button>
          </div>
        </>
      )}
    </div>
  );
}
