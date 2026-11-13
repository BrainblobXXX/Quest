'use client';

import { useEffect, useRef, useState } from 'react';
import PreBattleAnimation from '@/components/screens/PreBattleAnimation';
import { DieFace } from '@/components/screens/Dice';
import { audio } from '@/lib/audio';
import { preBattleMs } from '@/lib/preBattleTiming';
import { rollFormula } from '@/lib/rng';
import { evalCond } from '@/lib/engine';
import { usePanelKeys } from '@/lib/usePanelKeys';
import type { AttritionDef, Choice, Game, GameState } from '@/lib/types';

type Phase = 'ready' | 'animation' | 'result';

export default function AttritionPanel({
  game,
  state,
  attrition,
  onResolve,
  onChoose,
}: {
  game: Game;
  state: GameState;
  attrition: AttritionDef;
  onResolve: (damage: number) => void;
  onChoose: (choice: Choice) => void;
}) {
  const encounter = state.encounters?.[attrition.encounter];
  const [phase, setPhase] = useState<Phase>('ready');
  const [result, setResult] = useState<{ total: number; text: string; faces: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  if (!encounter) {
    return <div className="choices error">СБОЙ: ВСТРЕЧА НЕ НАЙДЕНА</div>;
  }

  const itemLeft = attrition.consume ? Number(state.inventory[attrition.consume] ?? 0) : null;
  const canStart = itemLeft === null || itemLeft > 0;
  const choices = (attrition.choices ?? []).filter((choice) => !choice.if || evalCond(choice.if, state));

  const start = () => {
    if (phase !== 'ready' || busy || !canStart) return;
    setBusy(true);
    setPhase('animation');
    audio.click();
    timer.current = window.setTimeout(() => {
      const rolled = rollFormula(attrition.formula);
      setResult({ total: rolled.total, text: rolled.text, faces: rolled.rolls });
      setPhase('result');
      setBusy(false);
      onResolve(rolled.total);
      audio.beep();
    }, preBattleMs(3000));
  };

  usePanelKeys((event) => {
    if (phase !== 'ready') return false;
    if (event.key !== '1' && event.key !== 'Enter' && event.key !== ' ') return false;
    start();
    return true;
  });

  const animationKind = attrition.animation ?? (attrition.consume === 'grenade' ? 'grenade' : undefined);

  return (
    <div className="attrition-panel" role="region" aria-label="Столкновение с группой врагов">
      <div className="attrition-head">
        <span>{encounter.name.toUpperCase()}</span>
        <span>ОСТАЛОСЬ: {encounter.count}</span>
      </div>

      {phase === 'ready' && (
        <>
          <div className="attrition-formula">
            {attrition.consume ? 'ГРАНАТА' : 'ВЗРЫВ'} · {attrition.formula}
            {itemLeft !== null && ` · В ИНВЕНТАРЕ: ${itemLeft}`}
          </div>
          <div className="choices attrition-choices">
            <button type="button" className="choice selected" onClick={start} disabled={!canStart}>
              1. {attrition.consume ? 'БРОСИТЬ ГРАНАТУ' : 'ПРИМЕНИТЬ ЭФФЕКТ'}
            </button>
          </div>
          {!canStart && <div className="attrition-note">ГРАНАТ БОЛЬШЕ НЕТ.</div>}
        </>
      )}

      {phase === 'animation' && animationKind && (
        <PreBattleAnimation game={game} kind={animationKind} />
      )}

      {phase === 'result' && result && (
        <>
          <div className="attrition-dice">
            {result.faces.map((face, index) => <DieFace value={face} key={index} />)}
            <span>{result.text}</span>
          </div>
          <div className="attrition-result">
            УРОН: {result.total} · ОСТАЛОСЬ: {encounter.count}
          </div>
          {choices.length > 0 ? (
            <div className="choices attrition-choices">
              {choices.map((choice, index) => (
                <button
                  type="button"
                  className="choice"
                  key={`${choice.goto}-${index}`}
                  onClick={() => onChoose(choice)}
                >
                  {index + 1}. {choice.label.toUpperCase()}
                </button>
              ))}
            </div>
          ) : (
            <div className="attrition-note">ПЕРЕХОД…</div>
          )}
        </>
      )}
    </div>
  );
}
