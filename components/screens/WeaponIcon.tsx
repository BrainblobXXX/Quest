'use client';

/**
 * Векторные иконки оружия для боевой панели.
 * Рисуются в том же янтарном контурном стиле, что и CRT-интерфейс.
 */
const WEAPON_IMAGES: Record<string, string> = {
  baseball_bat: 'bat.png',
  penknife: 'knife.png',
  pistol: 'pistol.png',
  shotgun: 'shotgun.png',
  sawed_off: 'shotgun.png',
};

export function WeaponIcon({
  weaponId,
  className = 'weapon-icon',
  gameId,
}: {
  weaponId: string;
  className?: string;
  gameId?: string;
}) {
  const image = gameId === 'zombie-blood' ? WEAPON_IMAGES[weaponId] : undefined;
  if (image) {
    return (
      <img
        className={`${className} weapon-icon-image`}
        src={`/api/games/${gameId}/assets/weapons/${image}`}
        alt=""
        draggable={false}
      />
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`Оружие: ${weaponId}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {weaponId === 'penknife' && (
        <>
          <path d="M18 47 46 19l8 8-28 28H18v-8Z" />
          <path d="M8 58 24 42l10 10-16 10H8v-4Z" />
          <path d="M18 47 8 57" />
          <circle cx="28" cy="44" r="2.2" />
        </>
      )}
      {weaponId === 'baseball_bat' && (
        <>
          <path d="M13 53 48 18c4-4 8-4 11-1s3 7-1 11L23 63" />
          <path d="M13 53c-2 2-2 5 0 7s5 2 7 0" />
        </>
      )}
      {weaponId === 'axe' && (
        <>
          <path d="M14 56 46 24" />
          <path d="M39 17c8-5 17 4 12 12l-9 4-7-7 4-9Z" />
          <path d="m48 29 6-6" />
        </>
      )}
      {weaponId === 'sword' && (
        <>
          <path d="M32 6v35" />
          <path d="m32 6 5 7-5 24-5-24 5-7Z" />
          <path d="M17 43h30" />
          <path d="M27 43v9h10v-9" />
          <path d="M32 52v6" />
        </>
      )}
      {weaponId === 'chainsaw' && (
        <>
          <path d="M9 29h28v17H9z" />
          <path d="M37 32h19v11H37z" />
          <path d="M40 33v9M44 33v9M48 33v9M52 33v9" />
          <path d="M14 29v-7h10v7M15 46v8h8v-8" />
        </>
      )}
      {weaponId === 'crowbar' && (
        <>
          <path d="M17 57 45 21c4-5 9-5 12-2s1 9-4 12l-7 4" />
          <path d="m49 35 3 3" />
          <path d="M17 57c-3 2-6-1-3-4" />
        </>
      )}
      {weaponId === 'pistol' && (
        <>
          <path d="M10 25h35v12H31l-5 17H13l6-17H10z" />
          <path d="M45 28h9v6h-9" />
          <path d="M24 25v-5h12v5" />
        </>
      )}
      {(weaponId === 'shotgun' || weaponId === 'sawed_off') && (
        <>
          <path d="M7 27h35v10H7z" />
          <path d="M42 30h15v4H42z" />
          <path d="m16 37-8 16h10l8-16" />
          <path d="M13 27v-4h20v4" />
          {weaponId === 'sawed_off' && <path d="M7 31h32" />}
        </>
      )}
      {weaponId === 'submachine' && (
        <>
          <path d="M8 26h30v14H8z" />
          <path d="M38 30h18v5H38z" />
          <path d="M20 40v13h9V40" />
          <path d="M20 46h9" />
          <path d="M12 26v-5h9v5" />
        </>
      )}
      {weaponId === 'fists' && (
        <>
          <path d="M18 38V22c0-3 4-3 4 0v-4c0-3 4-3 4 0v-3c0-3 4-3 4 0v3c0-3 4-3 4 0v16" />
          <path d="M18 38c-3 4-3 9 0 13 4 5 10 7 17 7 9 0 15-5 15-13V29c0-3-4-3-4 0v-6c0-3-4-3-4 0v-2c0-3-4-3-4 0v18" />
        </>
      )}
      {!['penknife', 'baseball_bat', 'axe', 'sword', 'chainsaw', 'crowbar', 'pistol', 'shotgun', 'sawed_off', 'submachine', 'fists'].includes(weaponId) && (
        <>
          <path d="M12 50 46 16l8 8-34 34H12v-8Z" />
          <path d="m40 22 8 8" />
        </>
      )}
    </svg>
  );
}
