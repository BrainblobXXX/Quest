'use client';

import { audio } from '@/lib/audio';
import type { Game, GameState, ShopOffer } from '@/lib/types';

export default function ShopPanel({
  game,
  state,
  offers,
  onBuy,
}: {
  game: Game;
  state: GameState;
  offers: ShopOffer[];
  onBuy: (itemId: string, price: number) => void;
}) {
  if (offers.length === 0) return null;
  const money = Number(state.stats.money ?? 0);

  return (
    <div className="shop-panel" aria-label="Лавка Бориса">
      <div className="shop-title">ЛАВКА БОРИСА · У ВАС {money} $</div>
      <div className="choices shop-choices">
        {offers.map((offer) => {
          const item = game.items?.[offer.item];
          const owned = (state.inventory[offer.item] ?? 0) > 0;
          const disabled = owned || money < offer.price;
          return (
            <button
              key={offer.item}
              type="button"
              className="choice"
              disabled={disabled}
              onClick={() => {
                audio.click();
                onBuy(offer.item, offer.price);
              }}
            >
              {owned
                ? `УЖЕ КУПЛЕНО: ${item?.title?.toUpperCase() ?? offer.item}`
                : `КУПИТЬ: ${item?.title?.toUpperCase() ?? offer.item} · ${offer.price} $`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
