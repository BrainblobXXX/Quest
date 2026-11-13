'use client';

import type { ButtonHTMLAttributes } from 'react';
import { DieFace } from '@/components/screens/Dice';
import type { Choice, GameState } from '@/lib/types';
import type { StoryView } from '@/lib/mechanics/story';

export type StoryRollView = {
  kind: 'coin' | 'dice';
  value: number;
  phase: 'spin' | 'result';
};

type PressHandlers = (key: string) => ButtonHTMLAttributes<HTMLButtonElement>;

function diceMax(formula: string): number {
  const match = /^(\d+)d(\d+)$/i.exec(formula.trim());
  if (!match) return 6;
  return Math.max(1, Number(match[1]) * Number(match[2]));
}

export default function StoryActivity({
  state,
  story,
  selected,
  pressed,
  rollView,
  tick,
  blockedByInteraction,
  pressHandlers,
  onChoose,
  onAdvance,
  onRestart,
  onBack,
  onRoll,
}: {
  state: GameState;
  story: StoryView;
  selected: number;
  pressed: string | null;
  rollView: StoryRollView | null;
  tick: number;
  blockedByInteraction: boolean;
  pressHandlers: PressHandlers;
  onChoose: (choice: Choice) => void;
  onAdvance: (value?: number) => void;
  onRestart: () => void;
  onBack: () => void;
  onRoll: () => void;
}) {
  const sceneKey = state.scene;
  const { ending, canReturn, choices, hasNext, dice, isCoin } = story;

  return (
    <>
      {ending && (
        <div className="choices">
          <div className="green">КОНЕЦ</div>
          {canReturn ? (
            <>
              <button
                type="button"
                className={`choice${selected === 0 ? ' selected' : ''}${pressed === `${sceneKey}:back` ? ' pressed' : ''}`}
                onClick={onBack}
                {...pressHandlers('back')}
              >
                1. ВЕРНУТЬСЯ
              </button>
              <button
                type="button"
                className={`choice${selected === 1 ? ' selected' : ''}${pressed === `${sceneKey}:restart` ? ' pressed' : ''}`}
                onClick={onRestart}
                {...pressHandlers('restart')}
              >
                2. НАЧАТЬ ЗАНОВО
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`choice${selected === 0 ? ' selected' : ''}${pressed === `${sceneKey}:restart` ? ' pressed' : ''}`}
              onClick={onRestart}
              {...pressHandlers('restart')}
            >
              1. НАЧАТЬ ЗАНОВО
            </button>
          )}
        </div>
      )}

      {!ending && !blockedByInteraction && choices.length > 0 && (
        <div className="choices">
          {choices.map((choice, index) => (
            <button
              key={`${choice.goto}-${index}`}
              type="button"
              className={`choice${index === selected ? ' selected' : ''}${pressed === `${sceneKey}:c${index}` ? ' pressed' : ''}`}
              data-variant={choice.letter}
              onClick={() => onChoose(choice)}
              {...pressHandlers(`c${index}`)}
            >
              {index + 1}. {choice.label.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {!ending && !blockedByInteraction && choices.length === 0 && hasNext && !dice && (
        <div className="choices">
          <button
            type="button"
            className={`choice${selected === 0 ? ' selected' : ''}${pressed === `${sceneKey}:next` ? ' pressed' : ''}`}
            onClick={() => onAdvance()}
            {...pressHandlers('next')}
          >
            1. ДАЛЕЕ
          </button>
        </div>
      )}

      {!ending && dice && !rollView && (
        <div className="choices">
          <button
            type="button"
            className={`choice${selected === 0 ? ' selected' : ''}${pressed === `${sceneKey}:roll` ? ' pressed' : ''}`}
            onClick={onRoll}
            {...pressHandlers('roll')}
          >
            1. {isCoin ? 'БРОСИТЬ МОНЕТКУ' : 'БРОСИТЬ КУБИК'}
          </button>
        </div>
      )}

      {rollView && (
        <div className="roll-stage">
          <div className={rollView.kind === 'coin' ? 'roll-coin' : `roll-die${dice && diceMax(dice.roll) > 6 ? ' roll-die-d20' : ''}`}>
            {rollView.kind === 'coin'
              ? rollView.phase === 'result'
                ? rollView.value === 1
                  ? 'ОРЁЛ'
                  : 'РЕШКА'
                : '◉'
              : (
                <DieFace
                  value={rollView.phase === 'result' ? rollView.value : 1 + (tick % Math.max(1, dice ? diceMax(dice.roll) : 6))}
                  sides={dice ? diceMax(dice.roll) : 6}
                  className="roll-die-face combat-die-face"
                  numberClassName="roll-die-number"
                />
              )}
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

      {!blockedByInteraction && story.deadEnd && (
        <div className="choices error">СБОЙ: ТУПИК В СЦЕНЕ {sceneKey}</div>
      )}
    </>
  );
}
