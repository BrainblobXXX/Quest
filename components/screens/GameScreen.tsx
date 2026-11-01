'use client';

import { useEffect, useState } from 'react';
import { availableChoices, inventoryLine, isEnding, sceneOf } from '@/lib/engine';
import type { Choice, Game, GameState } from '@/lib/types';

function assetUrl(game: Game, path: string): string {
  if (/^(https?:)?\//.test(path)) return path;
  return `/games/${game.id}/${path}`;
}

export default function GameScreen({
  game,
  state,
  onChoose,
  onAdvance,
  onRestart,
}: {
  game: Game;
  state: GameState;
  onChoose: (choice: Choice) => void;
  onAdvance: () => void;
  onRestart: () => void;
}) {
  const [confirmRestart, setConfirmRestart] = useState(false);
  const scene = sceneOf(game, state);
  const choices = availableChoices(game, state);
  const ending = isEnding(game, state);
  const hasNext = Boolean(scene.next);

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
        <span className="inv">{inventoryLine(game, state)}</span>
        <button
          className="restart-btn"
          onClick={() => setConfirmRestart(true)}
          aria-label="Начать игру заново"
          title="Начать заново"
        >
          ⟲ <span className="restart-label">заново</span>
        </button>
      </div>

      <div className="scene-scroll">
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

      {confirmRestart && (
        <div className="confirm-overlay">
          <div className="confirm-box">
            <div>НАЧАТЬ ИГРУ ЗАНОВО?</div>
            <div className="choices">
              <button
                className="choice"
                onClick={() => {
                  setConfirmRestart(false);
                  onRestart();
                }}
              >
                1. ДА
              </button>
              <button className="choice" onClick={() => setConfirmRestart(false)}>
                2. НЕТ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
