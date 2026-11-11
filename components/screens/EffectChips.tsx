'use client';

import { activeEffectViews, effectModifierLabel } from '@/lib/effects';
import type { ActiveEffect, Game } from '@/lib/types';

function EffectIcon({ icon }: { icon?: string }) {
  if (icon === 'concussion') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3a6 6 0 0 0-6 6v1.2c0 1.4.5 2.7 1.4 3.7l1.1 1.1v3h7v-3l1.1-1.1A5.8 5.8 0 0 0 18 10.2V9a6 6 0 0 0-6-6Z" />
        <path d="M8.5 10h7M9 13h6" className="effect-icon-line" />
        <path d="M9.5 3.8 8 7.5M14.5 3.8 16 7.5" className="effect-icon-line" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4 21 20H3L12 4Z" />
      <path d="M12 9v5M12 17v.5" className="effect-icon-line" />
    </svg>
  );
}

export default function EffectChips({
  game,
  effects,
}: {
  game: Game;
  effects?: ActiveEffect[];
}) {
  const views = activeEffectViews(game, { effects });
  if (views.length === 0) return null;
  return (
    <div className="effect-chips" aria-label="Временные эффекты">
      {views.map((effect) => {
        const label = `${effect.def.title}: ${effectModifierLabel(effect)}`;
        return (
          <span
            key={effect.id}
            className={`effect-chip ${effect.def.kind === 'buff' ? 'is-buff' : 'is-debuff'}`}
            title={label}
            aria-label={label}
          >
            <EffectIcon icon={effect.def.icon} />
          </span>
        );
      })}
    </div>
  );
}
