import type { Game } from './types';

/** Иконки предметов «Крови зомби»: пути относительно каталога книги. */
const ZOMBIE_ITEM_ICONS: Record<string, string> = {
  penknife: 'assets/weapons/knife.png',
  baseball_bat: 'assets/weapons/bat.png',
  axe: 'assets/weapons/axe.png',
  sword: 'assets/weapons/sword.png',
  crowbar: 'assets/weapons/crowbar.png',
  pistol: 'assets/weapons/pistol.png',
  sawed_off: 'assets/weapons/sawed_off.png',
  shotgun: 'assets/weapons/shotgun.png',
  chainsaw: 'assets/weapons/chainsaw.png',
  submachine: 'assets/weapons/submachine.png',
  ammo: 'assets/items/ammo.png',
  shotgun_ammo: 'assets/items/shotgun_ammo.png',
  grenade: 'assets/items/grenade.png',
  medkit: 'assets/items/medkit.png',
  rubber_gloves: 'assets/items/rubber_gloves.png',
  lab_coat: 'assets/items/lab_coat.png',
  short_rope: 'assets/items/short_rope.png',
  climbing_rope: 'assets/items/climbing_rope.png',
  pulley: 'assets/items/pulley.png',
  hacksaw: 'assets/items/hacksaw.png',
  note_paper: 'assets/items/note_paper.png',
  note121: 'assets/items/note_paper.png',
  code161: 'assets/items/note_paper.png',
  note333: 'assets/items/note_paper.png',
  brass_key: 'assets/items/brass_key.png',
  keyring: 'assets/items/keyring.png',
  number9_key: 'assets/items/brass_key.png',
  number111_key: 'assets/items/brass_key.png',
  car_keys: 'assets/items/car_keys.png',
  money: 'assets/items/money.png',
};

function publicAsset(game: Game, path: string): string {
  if (/^(https?:)?\//.test(path)) return path;
  return `/api/games/${encodeURIComponent(game.id)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Возвращает URL иконки предмета или null, если ассета ещё нет. */
export function itemIconUrl(game: Game, id: string): string | null {
  const explicit = game.items?.[id]?.icon;
  if (explicit) return publicAsset(game, explicit);
  const path = game.id === 'zombie-blood' ? ZOMBIE_ITEM_ICONS[id] : undefined;
  return path ? publicAsset(game, path) : null;
}
