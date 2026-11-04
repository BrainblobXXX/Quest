'use client';

import { useEffect, useRef, useState } from 'react';
import { availableChoices, inventoryLine, isEnding, roll as rollDice, sceneOf } from '@/lib/engine';
import { audio } from '@/lib/audio';
import type { Choice, Game, GameState, ParseProblem } from '@/lib/types';

function remark(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'замечание';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'замечания';
  return 'замечаний';
}

function assetUrl(game: Game, path: string): string {
  if (/^(https?:)?\//.test(path)) return path;
  return `/api/games/${game.id}/${path}`;
}

function InventoryPanel({ game, state }: { game: Game; state: GameState }) {
  const items = Object.entries(state.inventory).map(([id, n]) => ({
    id,
    n,
    title: game.items?.[id]?.title ?? id,
  }));

  return (
    <div className="inventory-panel">
      {items.length === 0 && <div className="inventory-empty">ПУСТО</div>}
      {items.map((it) => (
        <div key={it.id} className="inventory-row">
          <span>{it.title.toUpperCase()}</span>
          <span className="count">{it.n}</span>
        </div>
      ))}
    </div>
  );
}

export default function GameScreen({
  game,
  state,
  onChoose,
  onAdvance,
  onRestart,
  music,
  onToggleMusic,
  problems = [],
}: {
  game: Game;
  state: GameState;
  onChoose: (choice: Choice) => void;
  onAdvance: (value?: number) => void;
  onRestart: () => void;
  music: boolean;
  onToggleMusic: () => void;
  problems?: ParseProblem[];
}) {
  const scene = sceneOf(game, state);
  const [invOpen, setInvOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollKey = `${game.id}:${state.scene}`;
  const choices = availableChoices(game, state);
  const ending = isEnding(game, state);
  const hasNext = Boolean(scene.next);
  const dice = !ending && scene.next && typeof scene.next === 'object' ? scene.next : null;
  const isCoin = dice ? /d2$/i.test(dice.roll.trim()) : false;
  const [rollView, setRollView] = useState<{ kind: 'coin' | 'dice'; value: number; phase: 'spin' | 'result' } | null>(null);
  const [tick, setTick] = useState(0);
  const rollTimers = useRef<number[]>([]);

  const startRoll = () => {
    if (!dice || rollView) return;
    const value = rollDice(dice.roll);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spinMs = reduced ? 250 : 1300;
    const resultMs = reduced ? 500 : 900;
    setRollView({ kind: isCoin ? 'coin' : 'dice', value, phase: 'spin' });
    audio.click();
    rollTimers.current.push(
      window.setTimeout(() => setRollView((r) => (r ? { ...r, phase: 'result' } : r)), spinMs),
      window.setTimeout(() => {
        setRollView(null);
        onAdvance(value);
      }, spinMs + resultMs),
    );
  };

  useEffect(() => {
    setInvOpen(false);
  }, [scene.key]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = window.sessionStorage.getItem(`scroll:${scrollKey}`);
    el.scrollTop = saved ? Number(saved) : 0;
  }, [scrollKey]);

  const saveScroll = (e: React.UIEvent<HTMLDivElement>) => {
    window.sessionStorage.setItem(`scroll:${scrollKey}`, String(e.currentTarget.scrollTop));
  };

  useEffect(() => {
    setRollView(null);
    for (const id of rollTimers.current) window.clearTimeout(id);
    rollTimers.current = [];
  }, [scene.key]);

  useEffect(() => {
    if (!rollView || rollView.phase !== 'spin') return;
    const id = window.setInterval(() => setTick((t) => t + 1), 90);
    return () => window.clearInterval(id);
  }, [rollView?.phase]);

  useEffect(() => () => {
    for (const id of rollTimers.current) window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || ending) return;
      if (rollView) return;
      if (/^[1-9]$/.test(e.key)) {
        if (dice) {
          if (e.key === '1') startRoll();
          return;
        }
        const choice = choices[Number(e.key) - 1];
        if (choice) onChoose(choice);
      } else if (e.key === 'Enter' && hasNext) {
        if (dice) startRoll();
        else onAdvance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choices, ending, hasNext, onChoose, onAdvance, dice, rollView]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="title-line">
        <span>{scene.title.toUpperCase()}</span>
        <button
          className={`music-btn${music ? '' : ' off'}`}
          onClick={onToggleMusic}
          aria-pressed={music}
          aria-label="Музыка"
          title={music ? 'Выключить музыку' : 'Включить музыку'}
        >
          ♪
        </button>
        <button
          className="inventory-toggle"
          onClick={() => setInvOpen((v) => !v)}
          aria-expanded={invOpen}
          title="Инвентарь"
        >
          <span className="inv-inline">{inventoryLine(game, state) || 'ПУСТО'}</span>
          <span className="inv-label">инвентарь {invOpen ? '▲' : '▼'}</span>
        </button>
      </div>

      {invOpen && <InventoryPanel game={game} state={state} />}

      {problems.length > 0 && (
        <details className="parse-report">
          <summary>
            РАЗБОР: {problems.length} {remark(problems.length)}
          </summary>
          <ul className="parse-problems">
            {problems.slice(0, 50).map((problem, index) => (
              <li key={`${problem.code}-${index}`} data-level={problem.level}>
                <span className="parse-code">{problem.code}</span>
                {problem.scene ? ` [${problem.scene}]` : ''} {problem.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="scene-scroll" ref={scrollRef} onScroll={saveScroll}>
        {scene.image && (
          <figure className="scene-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl(game, scene.image)} alt="" />
          </figure>
        )}
        <div className="scene-text">{scene.text}</div>
      </div>

      {ending && (
        <div className="choices">
          <div className="green">КОНЕЦ</div>
          <button className="choice" onClick={onRestart}>
            1. НАЧАТЬ ЗАНОВО
          </button>
        </div>
      )}

      {!ending && choices.length > 0 && (
        <div className="choices">
          {choices.map((c, i) => (
            <button key={`${c.goto}-${i}`} className="choice" onClick={() => onChoose(c)}>
              {i + 1}. {c.label.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {!ending && choices.length === 0 && hasNext && !dice && (
        <div className="choices">
          <button className="choice" onClick={() => onAdvance()}>
            1. ДАЛЕЕ
          </button>
        </div>
      )}

      {!ending && dice && !rollView && (
        <div className="choices">
          <button className="choice" onClick={startRoll}>
            1. {isCoin ? 'БРОСИТЬ МОНЕТКУ' : 'БРОСИТЬ КУБИК'}
          </button>
        </div>
      )}

      {rollView && (
        <div className="roll-stage">
          <div className={rollView.kind === 'coin' ? 'roll-coin' : 'roll-die'}>
            {rollView.kind === 'coin'
              ? rollView.phase === 'result'
                ? rollView.value === 1
                  ? 'О'
                  : 'Р'
                : '◉'
              : rollView.phase === 'result'
                ? rollView.value
                : 1 + (tick % 6)}
          </div>
          <div className="roll-caption">
            {rollView.phase === 'result'
              ? rollView.kind === 'coin'
                ? rollView.value === 1
                  ? 'ОРЁЛ'
                  : 'РЕШКА'
                : `ВЫПАЛО ${rollView.value}`
              : rollView.kind === 'coin'
                ? 'БРОСАЕМ МОНЕТУ…'
                : 'БРОСАЕМ КУБИК…'}
          </div>
        </div>
      )}

      {!ending && choices.length === 0 && !hasNext && (
        <div className="choices error">СБОЙ: ТУПИК В СЦЕНЕ {scene.key}</div>
      )}

    </div>
  );
}
