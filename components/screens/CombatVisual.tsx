'use client';

import { useEffect, useState } from 'react';
import { WeaponIcon } from '@/components/screens/WeaponIcon';

type CombatVisualProps = {
  enemyName: string;
  playerName?: string;
  image?: string | null;
  gameId?: string;
  playerWeaponId?: string;
  enemyCount?: number;
  enemyHealth?: number;
  enemyPulse?: boolean;
};

function Silhouette({ label, overlay = false }: { label: string; overlay?: boolean }) {
  return (
    <div
      className={`combat-placeholder-art${overlay ? ' is-overlay' : ''}`}
      aria-label={label}
      role="img"
    >
      <svg className="combat-placeholder-silhouette" viewBox="0 0 64 100" aria-hidden="true">
        <circle cx="32" cy="22" r="14" />
        <path d="M12 96c1-25 8-38 20-38s19 13 20 38H12Z" />
      </svg>
      <span className="combat-placeholder-note">АНИМАЦИЯ<br />НЕДОСТУПНА</span>
    </div>
  );
}

/**
 * Визуальный блок для боевого режима. Если у книги нет кадров анимации,
 * показывает нейтральную заглушку; подходящая иллюстрация сцены используется
 * как статичный портрет противника.
 */
export default function CombatVisual({
  enemyName,
  playerName = 'ИГРОК',
  image,
  gameId,
  playerWeaponId,
  enemyCount,
  enemyHealth,
  enemyPulse = false,
}: CombatVisualProps) {
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'invalid'>(
    image ? 'loading' : 'invalid',
  );

  useEffect(() => {
    setImageState(image ? 'loading' : 'invalid');
  }, [image]);

  const showImage = Boolean(image) && imageState === 'ready';

  return (
    <aside
      className="combat-visual combat-placeholder-visual"
      aria-label={`Игрок против ${enemyName}${enemyCount ? `, осталось ${enemyCount}` : ''}`}
    >
      <div className="combat-placeholder-side combat-placeholder-player">
        <div className="combat-fighter-label">{playerName}</div>
        {playerWeaponId && gameId ? (
          <div className="combat-placeholder-art combat-placeholder-player-weapon">
            <WeaponIcon
              weaponId={playerWeaponId}
              gameId={gameId}
              className="combat-placeholder-player-icon"
            />
          </div>
        ) : (
          <Silhouette label={`${playerName}: анимация недоступна`} />
        )}
      </div>
      <div className="combat-vs" aria-hidden="true">VS</div>
      <div className={`combat-placeholder-side combat-placeholder-enemy${enemyPulse ? ' is-hit' : ''}`}>
        <div className="combat-fighter-label">{enemyName.toUpperCase()}</div>
        {image ? (
          <div className="combat-placeholder-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={`combat-placeholder-image${showImage ? ' is-ready' : ''}${imageState === 'invalid' ? ' is-invalid' : ''}`}
              src={image}
              alt=""
              draggable={false}
              onLoad={(event) => {
                const img = event.currentTarget;
                const suitable = img.naturalWidth >= 160 && img.naturalHeight >= 120;
                setImageState(suitable ? 'ready' : 'invalid');
              }}
              onError={() => setImageState('invalid')}
            />
            {!showImage && (
              <Silhouette label={`${enemyName}: анимация недоступна`} overlay />
            )}
          </div>
        ) : (
          <Silhouette label={`${enemyName}: анимация недоступна`} />
        )}
        {(enemyCount !== undefined && enemyCount > 0) || (enemyHealth !== undefined && enemyHealth > 0) ? (
          <div className="zombie-badges combat-placeholder-badges">
            {enemyCount !== undefined && enemyCount > 1 && (
              <span className="zombie-count" aria-label={`Количество: ${enemyCount}`}>× {enemyCount}</span>
            )}
            {enemyHealth !== undefined && enemyHealth > 0 && (
              <span className="zombie-health" aria-label={`Здоровье: ${enemyHealth}`}>♥ {enemyHealth}</span>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
