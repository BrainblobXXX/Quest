'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import { usePanelKeys } from '@/lib/usePanelKeys';
import { rollDie } from '@/lib/rng';
import { DieFace } from '@/components/screens/Dice';
import type { CheckDef, Game, GameState } from '@/lib/types';


function evalExpr(expr: string, stats: Record<string, number>): number {
  const tokens = expr.match(/max|[a-z_][a-z0-9_]*|\d+|[()+\-*/]/gi) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  function atom(): number {
    const token = next();
    if (token === undefined) return 0;
    if (token === '(') {
      const value = sum();
      if (peek() === ')') next();
      return value;
    }
    if (token.toLowerCase() === 'max') {
      if (peek() === '(') next();
      const a = sum();
      if (peek() === ',') next();
      const b = sum();
      if (peek() === ')') next();
      return Math.max(a, b);
    }
    if (/^\d+$/.test(token)) return Number(token);
    return Number(stats[token] ?? 0);
  }

  function product(): number {
    let value = atom();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const right = atom();
      value = op === '*' ? value * right : right === 0 ? 0 : value / right;
    }
    return value;
  }

  function sum(): number {
    let value = product();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const right = product();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  return sum();
}

function statTitle(game: Game, id: string | undefined): string {
  if (!id) return 'ПРОВЕРКА';
  return (game.stats?.[id]?.title ?? id).toUpperCase();
}

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
  const checkStat = check.stat;
  const value = checkStat ? Number(state.stats[checkStat] ?? 0) : Number(state.stats[check.skill ?? ''] ?? 0);
  const deterministic = game.type === 'rpg' || Boolean(check.skill && check.difficulty !== undefined);
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
      const compare = check.compare?.match(/^\s*(>=|<=|!=|=|>|<)\s*(.+)$/);
      let ok = false;
      if (compare) {
        const right = evalExpr(compare[2], state.stats);
        ok =
          compare[1] === '>=' ? value >= right :
          compare[1] === '<=' ? value <= right :
          compare[1] === '>' ? value > right :
          compare[1] === '<' ? value < right :
          compare[1] === '!=' ? value !== right : value === right;
      } else if (check.difficulty !== undefined) {
        ok = value >= check.difficulty;
      }
      // Fallout: проверка навыка стоит (1d6 − навык) × 4 морали.
      let cost = 0;
      if (game.type === 'rpg' && check.skill) {
        const die = rollDie(6);
        cost = Math.max(0, (die - value) * 4);
        setMoraleCost(cost);
      }
      setSuccess(ok);
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
      const roll = a + b + value;
      const compare = check.compare?.match(/^\s*(>=|<=|!=|=|>|<)\s*(.+)$/);
      let ok = false;
      if (compare) {
        const right = evalExpr(compare[2], state.stats);
        ok =
          compare[1] === '>=' ? roll >= right :
          compare[1] === '<=' ? roll <= right :
          compare[1] === '>' ? roll > right :
          compare[1] === '<' ? roll < right :
          compare[1] === '!=' ? roll !== right : roll === right;
      }
      setSuccess(ok);
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

  const label = deterministic
    ? check.skill
      ? `${statTitle(game, check.skill)} · СЛОЖНОСТЬ ${check.difficulty}`
      : `${statTitle(game, check.stat)} ${check.compare ?? ''}`
    : `${statTitle(game, check.stat)} + 2d6 ${check.compare ?? ''}`;

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
