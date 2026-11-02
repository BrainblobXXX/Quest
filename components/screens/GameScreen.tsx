'use client';

import { useEffect, useRef, useState } from 'react';
import { availableChoices, inventoryLine, isEnding, sceneOf } from '@/lib/engine';
import type { Choice, Game, GameState } from '@/lib/types';

function assetUrl(game: Game, path: string): string {
  if (/^(https?:)?\//.test(path)) return path;
  return `/games/${game.id}/${path}`;
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
}: {
  game: Game;
  state: GameState;
  onChoose: (choice: Choice) => void;
  onAdvance: () => void;
  onRestart: () => void;
  music: boolean;
  onToggleMusic: () => void;
}) {
  const scene = sceneOf(game, state);
  const [invOpen, setInvOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollKey = `${game.id}:${state.scene}`;
  const choices = availableChoices(game, state);
  const ending = isEnding(game, state);
  const hasNext = Boolean(scene.next);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return;
      if (ending) return;
      if (/^[1-9]$/.test(e.key)) {
        const choice = choices[Number(e.key) - 1];
        if (choice) onChoose(choice);
      } else if (e.key === 'Enter' && hasNext) {
        onAdvance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choices, ending, hasNext, onChoose, onAdvance]);

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

      {!ending && choices.length === 0 && hasNext && (
        <div className="choices">
          <button className="choice" onClick={onAdvance}>
            1. ДАЛЕЕ
          </button>
        </div>
      )}

      {!ending && choices.length === 0 && !hasNext && (
        <div className="choices error">СБОЙ: ТУПИК В СЦЕНЕ {scene.key}</div>
      )}

    </div>
  );
}
