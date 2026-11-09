'use client';

import type { Game, GameState } from '@/lib/types';

const ZOMBIE_WEAPON_ICONS: Record<string, string> = {
  baseball_bat: 'bat.png',
  penknife: 'knife.png',
  pistol: 'pistol.png',
  shotgun: 'shotgun.png',
  sawed_off: 'shotgun.png',
  axe: 'axe.png',
  submachine: 'submachine.png',
};

function itemIcon(game: Game, id: string): string | null {
  const icon = game.items?.[id]?.icon;
  if (icon) {
    if (/^(https?:)?\//.test(icon)) return icon;
    return `/api/games/${encodeURIComponent(game.id)}/${icon.split('/').map(encodeURIComponent).join('/')}`;
  }
  const zombieWeapon = game.id === 'zombie-blood' ? ZOMBIE_WEAPON_ICONS[id] : undefined;
  if (zombieWeapon) return `/api/games/${game.id}/assets/weapons/${zombieWeapon}`;
  return null;
}

/**
 * Предметы, полученные/потерянные в текущей сцене.
 * Иконка сверху, название снизу; без ассета — пустой плейсхолдер.
 */
export default function SceneItemChanges({ game, state }: { game: Game; state: GameState }) {
  const changes = state.itemChanges ?? [];
  if (changes.length === 0) return null;

  const found = changes.filter((change) => change.delta > 0);
  const lost = changes.filter((change) => change.delta < 0);

  const renderRow = (label: string, list: typeof changes, kind: 'found' | 'lost') => (
    <div className="item-change-row">
      <span className={`item-change-kind ${kind}`}>{label}</span>
      <div className="item-change-list">
        {list.length === 0 && <span className="item-change-empty">—</span>}
        {list.map((change) => {
          const icon = itemIcon(game, change.id);
          const title = game.items?.[change.id]?.title ?? change.id;
          const count = Math.abs(change.delta);
          return (
            <div className="item-change" key={change.id} title={`${title}${count > 1 ? ` ×${count}` : ''}`}>
              {icon ? (
                <img className="item-change-icon" src={icon} alt="" draggable={false} />
              ) : (
                <span className="item-change-icon item-change-placeholder" aria-hidden="true" />
              )}
              <span className="item-change-name">{title}</span>
              {count > 1 && <span className="item-change-count">×{count}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <section
      className="scene-item-changes"
      aria-label="Изменения предметов в этой сцене"
      aria-live="polite"
    >
      {renderRow('НАШЁЛ', found, 'found')}
      {renderRow('ПОТЕРЯЛ', lost, 'lost')}
    </section>
  );
}
