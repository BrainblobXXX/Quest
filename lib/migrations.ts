import { STATE_VERSION, type Game, type GameState } from './types';

/**
 * Миграции состояния. Здесь живут только те исправления данных, которые нужны
 * старым сейвам; новые сейвы уже содержат актуальные значения.
 *
 * Книжная специфика допустима только в миграции конкретной версии, не в UI.
 */
function migrateZombieBlood(game: Game, state: GameState): GameState {
  if (game.id !== 'zombie-blood') return state;
  const requiredByScene: Record<string, Record<string, number>> = {
    '178': { short_rope: 1 },
    '291': { baseball_bat: 1 },
    '44': { pistol: 1, ammo: 1 },
    '92': { pistol: 1, ammo: 1 },
    '105': { submachine: 1, ammo: 1 },
    '136': { pistol: 1 },
    '222': { medkit: 1, pistol: 1 },
    '235': { medkit: 1, ammo: 2 },
    '293': { grenade: 1 },
    '302': { grenade: 3 },
    '373': { axe: 1 },
    '162': { medkit: 2, ammo: 6, shotgun_ammo: 6 },
    '181': { ammo: 2, shotgun_ammo: 3 },
    '213': { ammo: 3, shotgun_ammo: 3 },
    '236': { shotgun_ammo: 1 },
    '304': { ammo: 2, shotgun_ammo: 4 },
  };
  /** Старые сейвы складывали обычные и дробовые патроны в один счётчик. */
  const legacySplit: Record<string, number> = { '162': 6, '181': 3, '213': 3, '236': 1, '304': 4 };
  const inventory = { ...state.inventory };
  let changed = false;
  const split = legacySplit[state.scene];
  if (split && (inventory.shotgun_ammo ?? 0) === 0) {
    const currentAmmo = inventory.ammo ?? 0;
    const moved = Math.min(split, currentAmmo);
    if (moved > 0) {
      inventory.shotgun_ammo = moved;
      if (currentAmmo > moved) inventory.ammo = currentAmmo - moved;
      else delete inventory.ammo;
      changed = true;
    }
  }
  // старые сейвы §218: аптечка расходуется, без неё — смерть
  if (state.scene === '218') {
    if ((inventory.medkit ?? 0) > 0) {
      const left = inventory.medkit - 1;
      if (left > 0) inventory.medkit = left;
      else delete inventory.medkit;
      changed = true;
    } else {
      return {
        ...state,
        inventory,
        scene: '218_death',
        visited: [...state.visited, '218_death'],
        updated: new Date().toISOString(),
      };
    }
  }

  const required = requiredByScene[state.scene] ?? {};
  for (const [id, count] of Object.entries(required)) {
    if ((inventory[id] ?? 0) < count) {
      inventory[id] = count;
      changed = true;
    }
  }
  return changed ? { ...state, inventory } : state;
}

export function migrateState(game: Game, input: GameState): GameState {
  let state = input;
  if ((state.version ?? 0) < STATE_VERSION) {
    // Сейвы до версии 2: нормализуем журналы и прогоняем известные миграции.
    state = {
      ...state,
      knownCodes: state.knownCodes ?? [],
      gamblesDone: state.gamblesDone ?? [],
      version: 1,
    };
    state = migrateZombieBlood(game, state);
    state = { ...state, version: STATE_VERSION };
  }
  return state;
}
