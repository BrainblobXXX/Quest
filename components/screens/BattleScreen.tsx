'use client';

import { useCallback, useEffect, useState } from 'react';
import CombatPanel from '@/components/screens/CombatPanel';
import InitialRoll from '@/components/screens/InitialRoll';
import { STATE_VERSION, type Game, type GameState } from '@/lib/types';

type BattlePhase = 'health' | 'intro' | 'combat' | 'victory';

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Перемешивает, по возможности не ставя одну и ту же комнату подряд. */
function shuffleDeck(items: string[]): string[] {
  const result = shuffle(items);
  for (let i = 1; i < result.length; i += 1) {
    if (result[i] !== result[i - 1]) continue;
    const swap = result.findIndex((id, index) => index > i && id !== result[i - 1]);
    if (swap !== -1) [result[i], result[swap]] = [result[swap], result[i]];
  }
  return result;
}

function battleScenes(game: Game): string[] {
  return Object.keys(game.combat ?? {}).filter((key) => {
    const enemies = game.combat?.[key]?.enemies ?? [];
    return !enemies.some((enemy) => {
      const name = enemy.name.toLowerCase();
      return name.includes('конг') || name.includes('юрр');
    });
  });
}

function sceneRepeats(game: Game, key: string): number {
  const enemies = game.combat?.[key]?.enemies ?? [];
  let repeats = 1;
  for (const enemy of enemies) {
    const name = enemy.name.toLowerCase();
    if (name.includes('собак')) repeats = Math.max(repeats, 5);
    if (name.includes('крыс')) repeats = Math.max(repeats, 10);
    // Вооружённые зомби: атака 2 и выше.
    if (name.includes('зомби') && Number(enemy.attack ?? 1) >= 2) repeats = Math.max(repeats, 2);
  }
  return repeats;
}

function buildBattleDeck(game: Game): string[] {
  const deck: string[] = [];
  for (const scene of battleScenes(game)) {
    const repeats = sceneRepeats(game, scene);
    for (let i = 0; i < repeats; i += 1) deck.push(scene);
  }
  return shuffleDeck(deck);
}

function healthStat(game: Game): string | null {
  for (const [id, def] of Object.entries(game.stats ?? {})) {
    if (def.roll) return id;
  }
  return null;
}

function battleInventory(game: Game): Record<string, number> {
  const inventory: Record<string, number> = {};
  for (const [id, item] of Object.entries(game.items ?? {})) {
    if (id === 'grenade') continue;
    if (item.damage) inventory[id] = 1;
  }
  for (const id of ['ammo', 'shotgun_ammo']) {
    if (game.items?.[id]) inventory[id] = 99;
  }
  if (game.items?.medkit) inventory.medkit = 1;
  return inventory;
}

function makeBattleState(game: Game, scene: string, health: number, stat: string | null): GameState {
  const stats: Record<string, number> = {};
  for (const [id, def] of Object.entries(game.stats ?? {})) {
    stats[id] = Number(def.initial ?? 0);
  }
  if (stat) stats[stat] = health;
  return {
    game: game.id,
    format: game.format,
    version: STATE_VERSION,
    rev: game.rev,
    scene,
    inventory: battleInventory(game),
    flags: [],
    knownCodes: [],
    gamblesDone: [],
    stats,
    initialStats: { ...stats },
    visited: [scene],
    itemChanges: [],
    updated: new Date().toISOString(),
  };
}

function sceneImageUrl(game: Game, image?: string): string | null {
  if (!image) return null;
  if (/^(https?:)?\//.test(image)) return image;
  return `/api/games/${encodeURIComponent(game.id)}/${image.split('/').map(encodeURIComponent).join('/')}`;
}

export default function BattleScreen({
  game,
  onExit,
}: {
  game: Game;
  onExit: () => void;
}) {
  const stat = healthStat(game);
  const initialDeck = buildBattleDeck(game);
  const [phase, setPhase] = useState<BattlePhase>(stat ? 'health' : 'intro');
  const [order, setOrder] = useState<string[]>(initialDeck);
  const [index, setIndex] = useState(0);
  const [liveStamina, setLiveStamina] = useState<{ value: number; max: number } | null>(null);
  const vitalTitle = stat ? game.stats?.[stat]?.title ?? 'Выносливость' : 'Выносливость';
  const [state, setState] = useState<GameState | null>(() => {
    if (stat) return null;
    return makeBattleState(game, initialDeck[0] ?? '', Number(game.stats?.stamina?.initial ?? 20), null);
  });

  const handleStaminaChange = useCallback((value: number, max: number) => {
    setLiveStamina({ value, max });
  }, []);

  const beginRun = () => {
    setLiveStamina(null);
    const nextDeck = buildBattleDeck(game);
    setOrder(nextDeck);
    setIndex(0);
    setState(stat ? null : makeBattleState(game, nextDeck[0] ?? '', Number(game.stats?.stamina?.initial ?? 20), null));
    setPhase(stat ? 'health' : 'intro');
  };

  const finishHealthRoll = (value: number) => {
    setLiveStamina(null);
    const nextDeck = buildBattleDeck(game);
    setOrder(nextDeck);
    setIndex(0);
    setState(makeBattleState(game, nextDeck[0] ?? '', value, stat));
    setPhase('intro');
  };

  const handleWin = (result: GameState) => {
    const next = index + 1;
    if (next >= order.length) {
      setPhase('victory');
      return;
    }
    const nextScene = order[next];
    setLiveStamina(null);
    setIndex(next);
    setState({ ...result, scene: nextScene, visited: [...result.visited, nextScene] });
    setPhase('intro');
  };

  const currentCombat = state ? game.combat?.[state.scene] : null;
  const currentScene = state ? game.scenes[state.scene] : null;
  const currentImage = currentScene ? sceneImageUrl(game, currentScene.image) : null;

  useEffect(() => {
    if (phase !== 'intro') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '1' && event.key !== 'Enter' && event.key !== ' ') return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.tagName === 'BUTTON') return;
      event.preventDefault();
      setPhase('combat');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phase]);

  return (
    <div className="battle-screen">
      <div className="battle-topbar">
        <span className="battle-title">СРАЖЕНИЕ С ЗОМБИ</span>
        <div className="battle-top-right">
          <span className="battle-progress">
            {phase === 'victory' ? 'ПОБЕДА' : phase === 'health' ? 'ПОДГОТОВКА' : `КОМНАТА ${index + 1} / ${order.length}`}
          </span>
          {stat && state && (phase === 'intro' || phase === 'combat') && (
            <div className="vital-hud battle-vital" aria-label={`${vitalTitle}: ${liveStamina?.value ?? state.stats[stat] ?? 0}`}>
              <span
                className={`vital-chip${(liveStamina?.value ?? state.stats[stat] ?? 0) <= 0 ? ' is-low' : ''}`}
                title={`${vitalTitle}: ${liveStamina?.value ?? state.stats[stat] ?? 0}`}
              >
                <svg className="vital-heart" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
                </svg>
                <span className="vital-value">{liveStamina?.value ?? state.stats[stat] ?? 0}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {phase === 'health' && stat && (
        <div className="battle-health">
          <div className="battle-kicker">ПЕРЕД БОЕМ</div>
          <InitialRoll game={game} statId={stat} onDone={finishHealthRoll} />
        </div>
      )}

      {phase === 'intro' && state && currentCombat && currentScene && (
        <div className="battle-room battle-intro">
          <div className="battle-room-head">
            <span>БОЙ {index + 1} / {order.length}</span>
          </div>
          {currentImage && (
            <figure className="battle-room-image">
              <img src={currentImage} alt="" draggable={false} />
            </figure>
          )}
          <div className="battle-room-text">{currentScene.text}</div>
          <div className="choices battle-intro-choices">
            <button type="button" className="choice selected" onClick={() => setPhase('combat')}>
              1. НАЧАТЬ БОЙ
            </button>
          </div>
        </div>
      )}

      {phase === 'combat' && state && currentCombat && currentScene && (
        <div className="battle-room">
          <div className="battle-room-head">
            <span>БОЙ {index + 1} / {order.length}</span>
          </div>
          <CombatPanel
            key={`${index}:${state.scene}`}
            game={game}
            state={state}
            combat={currentCombat}
            onWin={handleWin}
            onExit={onExit}
            onRestart={beginRun}
            onStaminaChange={handleStaminaChange}
          />
        </div>
      )}

      {phase === 'combat' && (!state || !currentCombat) && (
        <div className="battle-error">БОЕВЫЕ СЦЕНЫ НЕ НАЙДЕНЫ</div>
      )}

      {phase === 'victory' && (
        <div className="battle-victory">
          <div className="battle-kicker">ВСЕ КОМНАТЫ ПРОЙДЕНЫ</div>
          <h1>МИР СПАСЁН</h1>
          <p>
            Последний зомби падает. Вы стоите среди обломков и тишины, и постепенно
            понимаете, что больше никто не идёт на вас.
          </p>
          <p>
            Люди выходят из укрытий. Вас чествуют как спасителя мира, а история
            о человеке, который пережил все комнаты, передаётся из уст в уста.
          </p>
          <div className="choices battle-victory-choices">
            <button type="button" className="choice selected" onClick={beginRun}>
              1. НАЧАТЬ ЗАНОВО
            </button>
            <button type="button" className="choice" onClick={onExit}>
              2. В БИБЛИОТЕКУ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
