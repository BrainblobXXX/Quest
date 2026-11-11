'use client';

import { itemIconUrl } from '@/lib/itemIcons';
import type { Game, GameState } from '@/lib/types';

/**
 * Предметы, полученные/потерянные в текущей сцене.
 * Иконка сверху, название снизу; без ассета — пустой плейсхолдер.
 */
export default function SceneItemChanges({ game, state }: { game: Game; state: GameState }) {
  const changes = state.itemChanges ?? [];
  if (changes.length === 0) return null;

  const found = changes.filter((change) => change.delta > 0);
  const lost = changes.filter((change) => change.delta < 0);
  const foundShop = found.filter((change) => change.reason === 'shop');
  const foundOther = found.filter((change) => change.reason !== 'shop');
  const lostShop = lost.filter((change) => change.reason === 'shop');
  const lostOther = lost.filter((change) => change.reason !== 'shop');

  const renderRow = (label: string, list: typeof changes, kind: 'found' | 'lost') => (
    <div className="item-change-row">
      <span className={`item-change-kind ${kind}`}>{label}</span>
      <div className="item-change-list">
        {list.map((change) => {
          const icon = itemIconUrl(game, change.id);
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
      {foundOther.length > 0 && renderRow('НАШЁЛ', foundOther, 'found')}
      {foundShop.length > 0 && renderRow('КУПИЛ', foundShop, 'found')}
      {lostOther.length > 0 && renderRow('ПОТЕРЯЛ', lostOther, 'lost')}
      {lostShop.length > 0 && renderRow('ОТДАЛ', lostShop, 'lost')}
    </section>
  );
}
