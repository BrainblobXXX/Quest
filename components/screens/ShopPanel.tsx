'use client';

import { useEffect, useState } from 'react';
import { audio } from '@/lib/audio';
import type { Game, GameState, ShopOffer } from '@/lib/types';

export default function ShopPanel({
  game,
  state,
  offers,
  onBuy,
  title = 'ЛАВКА БОРИСА',
  currency = '$',
}: {
  game: Game;
  state: GameState;
  offers: ShopOffer[];
  onBuy: (itemId: string, price: number) => void;
  title?: string;
  currency?: string;
}) {
  if (offers.length === 0) return null;
  const money = Number(state.stats.money ?? 0);
  const [selected, setSelected] = useState(0);

  const buttons = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('.shop-panel .shop-choices .choice'));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const list = buttons();
      if (list.length === 0) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        let next = selected;
        for (let step = 0; step < list.length; step += 1) {
          next = (next + direction + list.length) % list.length;
          if (!list[next].disabled) break;
        }
        setSelected(next);
        list[next]?.focus({ preventScroll: true });
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const target = !list[selected]?.disabled
          ? list[selected]
          : list.find((button) => !button.disabled);
        target?.click();
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        const target = list[Number(event.key) - 1];
        if (target && !target.disabled) {
          event.preventDefault();
          event.stopImmediatePropagation();
          target.click();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [selected]);

  return (
    <div className="shop-panel" aria-label={title}>
      <div className="shop-title">{title} · У ВАС {money} {currency}</div>
      <div className="choices shop-choices">
        {offers.map((offer, index) => {
          const item = game.items?.[offer.item];
          const owned = (state.inventory[offer.item] ?? 0) > 0;
          const disabled = owned || money < offer.price;
          return (
            <button
              key={offer.item}
              type="button"
              className={`choice${selected === index ? ' selected' : ''}`}
              disabled={disabled}
              onFocus={() => setSelected(index)}
              onClick={() => {
                audio.click();
                onBuy(offer.item, offer.price);
              }}
            >
              {owned
                ? `УЖЕ КУПЛЕНО: ${item?.title?.toUpperCase() ?? offer.item}`
                : `КУПИТЬ: ${item?.title?.toUpperCase() ?? offer.item} · ${offer.price} ${currency}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
