/** URL-ы кадров предбоевых анимаций: единый источник для предзагрузки и рендера. */
export type PreBattleAnimationKind = 'browning' | 'grenade';

export function prebattleFrameSources(gameId: string, kind: PreBattleAnimationKind): string[] {
  if (gameId !== 'zombie-blood') return [];
  const base = `/api/games/${encodeURIComponent(gameId)}/assets/effects`;
  if (kind === 'browning') {
    return Array.from(
      { length: 10 },
      (_, index) => `${base}/browning/machinegun-${String(index + 1).padStart(2, '0')}.png`,
    );
  }
  return [
    ...Array.from(
      { length: 5 },
      (_, index) => `${base}/grenade/throw/grenade-${String(index + 1).padStart(2, '0')}.png`,
    ),
    ...Array.from(
      { length: 5 },
      (_, index) => `${base}/grenade/explosion/explosion-${String(index + 1).padStart(2, '0')}.png`,
    ),
  ];
}

export function prebattleSoundUrl(gameId: string, kind: PreBattleAnimationKind): string | null {
  if (gameId !== 'zombie-blood') return null;
  const file = kind === 'browning' ? 'machinegun' : 'grenade-throw';
  return `/api/games/${encodeURIComponent(gameId)}/assets/sounds/effects/${file}.mp3`;
}
