import { advance, choose, goToScene, inventoryDiff, mergeItemChanges, resolveRoll, useCode } from './engine';
import { type Rng } from './rng';
import type { Choice, Game, GameState } from './types';

/**
 * Чистые действия игрока.
 *
 * UI вызывает applyAction и занимается только звуком/отображением. Вся
 * арифметика состояния, проверки, покупки и переходы находятся здесь.
 */
export type GameAction =
  | { type: 'choose'; choice: Choice }
  | { type: 'advance'; value?: number }
  | { type: 'back' }
  | { type: 'code'; id: string }
  | { type: 'gamble'; delta: number }
  | { type: 'check'; success: boolean; moraleCost?: number }
  | { type: 'buy'; itemId: string; price: number; currencyItem?: string }
  | { type: 'combat-win'; result: GameState }
  | { type: 'combat-outcome'; result: GameState; target: string }
  | { type: 'attrition'; damage: number };

export function applyAction(
  game: Game,
  state: GameState,
  action: GameAction,
  rng: Rng = Math.random,
): GameState | null {
  switch (action.type) {
    case 'choose':
      return choose(game, state, action.choice, rng);

    case 'advance':
      return action.value === undefined
        ? advance(game, state, rng)
        : resolveRoll(game, state, action.value);

    case 'back': {
      const previous = state.visited[state.visited.length - 2];
      if (!previous) return null;
      return goToScene(game, state, previous, rng);
    }

    case 'code':
      return useCode(game, state, action.id, rng);

    case 'gamble': {
      if (!game.gambles?.[state.scene]) return null;
      const money = Math.max(0, Number(state.stats.money ?? 0) + action.delta);
      return {
        ...state,
        stats: { ...state.stats, money },
        gamblesDone: [...new Set([...(state.gamblesDone ?? []), state.scene])],
        updated: new Date().toISOString(),
      };
    }

    case 'check': {
      const check = game.checks?.[state.scene];
      if (!check) return null;
      let prepared = state;
      const moraleCost = Math.max(0, Number(action.moraleCost ?? 0));
      if (moraleCost > 0) {
        const moraleBefore = Number(state.stats.morale ?? 0);
        const fromMorale = Math.min(moraleBefore, moraleCost);
        const overflow = moraleCost - fromMorale;
        prepared = {
          ...state,
          stats: {
            ...state.stats,
            morale: moraleBefore - fromMorale,
            hp: Math.max(0, Number(state.stats.hp ?? 0) - overflow),
          },
        };
      }
      return goToScene(game, prepared, action.success ? check.success : check.failure, rng);
    }

    case 'buy': {
      if (!game.items?.[action.itemId]) return null;
      if ((state.inventory[action.itemId] ?? 0) > 0) return null;
      const cost = Math.max(0, Number(action.price) || 0);
      if (action.currencyItem) {
        if ((state.inventory[action.currencyItem] ?? 0) < cost) return null;
        const inventory = { ...state.inventory };
        inventory[action.itemId] = (inventory[action.itemId] ?? 0) + 1;
        const left = (inventory[action.currencyItem] ?? 0) - cost;
        if (left > 0) inventory[action.currencyItem] = left;
        else delete inventory[action.currencyItem];
        return {
          ...state,
          inventory,
          itemChanges: mergeItemChanges(state.itemChanges, inventoryDiff(state.inventory, inventory, 'shop')),
          updated: new Date().toISOString(),
        };
      }
      if (Number(state.stats.money ?? 0) < cost) return null;
      const inventory = { ...state.inventory, [action.itemId]: 1 };
      return {
        ...state,
        stats: { ...state.stats, money: Number(state.stats.money ?? 0) - cost },
        inventory,
        itemChanges: mergeItemChanges(state.itemChanges, inventoryDiff(state.inventory, inventory, 'shop')),
        updated: new Date().toISOString(),
      };
    }

    case 'combat-win': {
      const target = game.combat?.[action.result.scene]?.win;
      if (!target) return null;
      return goToScene(game, action.result, target, rng);
    }

    case 'combat-outcome':
      if (!action.target) return null;
      return goToScene(game, action.result, action.target, rng);

    case 'attrition': {
      const attrition = game.scenes[state.scene]?.attrition;
      if (!attrition) return null;
      const encounter = state.encounters?.[attrition.encounter];
      if (!encounter) return null;
      const damage = Math.max(0, Math.floor(Number(action.damage) || 0));
      const count = Math.max(0, encounter.count - damage);
      const inventory = { ...state.inventory };
      if (attrition.consume) {
        const left = (inventory[attrition.consume] ?? 0) - 1;
        if (left > 0) inventory[attrition.consume] = left;
        else delete inventory[attrition.consume];
      }
      const updated: GameState = {
        ...state,
        inventory,
        encounters: {
          ...(state.encounters ?? {}),
          [encounter.id]: {
            ...encounter,
            count,
            history: [...(encounter.history ?? []), { scene: state.scene, roll: damage, damage }],
          },
        },
        itemChanges: mergeItemChanges(state.itemChanges, inventoryDiff(state.inventory, inventory)),
        updated: new Date().toISOString(),
      };
      const next = count <= 0 ? attrition.empty ?? attrition.next : attrition.next;
      if (next) return goToScene(game, updated, next, rng);
      return updated;
    }

    default:
      return null;
  }
}
