'use client';

import { useCallback, useEffect, useState } from 'react';
import CombatActivity from '@/components/mechanics/CombatActivity';
import InitialRoll from '@/components/screens/InitialRoll';
import EffectChips from '@/components/screens/EffectChips';
import { combatMode } from '@/lib/combat';
import { STATE_VERSION, type Game, type GameState } from '@/lib/types';

type BattlePhase = 'health' | 'select' | 'effects' | 'intro' | 'combat';

type EnemyKind = 'zombie' | 'armed' | 'dogs' | 'rats' | 'kong' | 'yurr';

type EnemyOption = {
  id: string;
  label: string;
  detail: string;
  scenes: string[];
};

const ZOMBIE_ENEMY_OPTIONS: Array<{ id: EnemyKind; label: string; detail: string }> = [
  { id: 'zombie', label: 'ЗОМБИ', detail: 'без оружия' },
  { id: 'armed', label: 'ЗОМБИ С ОРУЖИЕМ', detail: 'вооружённые' },
  { id: 'dogs', label: 'СОБАКИ', detail: 'стая' },
  { id: 'rats', label: 'КРЫСЫ', detail: 'стая' },
  { id: 'kong', label: 'ЗОМБИ-КОНГ', detail: 'босс' },
  { id: 'yurr', label: 'ЮРР', detail: 'босс' },
];

function enemyKindFor(name: string): EnemyKind | null {
  const lower = name.toLowerCase();
  if (lower.includes('конг')) return 'kong';
  if (lower.includes('юрр')) return 'yurr';
  if (lower.includes('собак')) return 'dogs';
  if (lower.includes('крыс')) return 'rats';
  if (lower.includes('с оружием')) return 'armed';
  if (lower.includes('зомби')) return 'zombie';
  return null;
}

function scenesForEnemyKind(game: Game, kind: EnemyKind): string[] {
  return Object.entries(game.combat ?? {})
    .filter(([, combat]) => (combat.enemies ?? []).some((enemy) => enemyKindFor(enemy.name) === kind))
    .map(([scene]) => scene);
}

function battleEnemyOptions(game: Game): EnemyOption[] {
  if (game.id === 'zombie-blood') {
    return ZOMBIE_ENEMY_OPTIONS.map((option) => ({
      ...option,
      scenes: scenesForEnemyKind(game, option.id),
    }));
  }
  const groups = new Map<string, { label: string; scenes: string[] }>();
  for (const [scene, combat] of Object.entries(game.combat ?? {})) {
    const enemies = (combat.enemies ?? [combat.enemy]).filter(Boolean);
    const label = enemies.map((enemy) => enemy.name.toUpperCase()).join(' + ');
    if (!label) continue;
    const key = label;
    const group = groups.get(key) ?? { label, scenes: [] };
    group.scenes.push(scene);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([id, group]) => ({
      id,
      label: group.label,
      detail: `${group.scenes.length} боевых сцен`,
      scenes: group.scenes.sort((a, b) => Number(a) - Number(b)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

type EffectSceneOption = {
  scene: string;
  kind: 'browning' | 'grenade';
  optional: boolean;
  formula: string;
  enemy: string;
  count: number;
};

function effectSceneOptions(game: Game): EffectSceneOption[] {
  return Object.entries(game.combat ?? {})
    .flatMap(([scene, combat]) => {
      const kind = combat.preDamageKind;
      if (kind !== 'browning' && kind !== 'grenade') return [];
      const enemy = combat.enemies?.[0] ?? combat.enemy;
      return [{
        scene,
        kind,
        optional: combat.preDamageOptional === true,
        formula: combat.preDamage ?? '—',
        enemy: enemy?.name ?? 'Противник',
        count: Math.max(1, Number(enemy?.count ?? 1)),
      }];
    })
    .sort((a, b) => {
      const order = { browning: 0, grenade: 1 };
      return order[a.kind] - order[b.kind] || Number(a.scene) - Number(b.scene);
    });
}

function pickRandomScene(scenes: string[], avoid?: string): string {
  const pool = scenes.length > 1 && avoid ? scenes.filter((scene) => scene !== avoid) : scenes;
  return pool[Math.floor(Math.random() * pool.length)] ?? scenes[0] ?? '';
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
    if (id === 'grenade') {
      // В боевом режиме Zombie Blood даём одну гранату для демонстрации эффекта.
      if (game.id === 'zombie-blood') inventory.grenade = 1;
      continue;
    }
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
    infiniteGrenades: true,
    flags: [],
    knownCodes: [],
    gamblesDone: [],
    stats,
    initialStats: { ...stats },
    visited: scene ? [scene] : [],
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
  const defaultHealth = Number(game.stats?.[stat ?? 'stamina']?.initial ?? 20);
  const [phase, setPhase] = useState<BattlePhase>(stat ? 'health' : 'select');
  const [state, setState] = useState<GameState | null>(() => (
    stat ? null : makeBattleState(game, '', defaultHealth, null)
  ));
  const [battleId, setBattleId] = useState(0);
  const [lastVictory, setLastVictory] = useState(false);
  const [liveStamina, setLiveStamina] = useState<{ value: number; max: number } | null>(null);
  const vitalTitle = stat ? game.stats?.[stat]?.title ?? 'Выносливость' : 'Выносливость';
  const options = battleEnemyOptions(game);
  const effectOptions = effectSceneOptions(game);

  const handleStaminaChange = useCallback((value: number, max: number) => {
    setLiveStamina({ value, max });
  }, []);

  const chooseEnemy = (option: EnemyOption) => {
    const scene = pickRandomScene(option.scenes, state?.scene || undefined);
    if (!scene) return;
    setLiveStamina(null);
    setState((previous) => {
      const base = previous ?? makeBattleState(game, '', defaultHealth, null);
      return { ...base, scene, visited: [scene] };
    });
    setBattleId((value) => value + 1);
    setLastVictory(false);
    setPhase('intro');
  };

  const chooseEffectScene = (scene: string) => {
    if (!game.combat?.[scene]) return;
    setLiveStamina(null);
    setState((previous) => {
      const base = previous ?? makeBattleState(game, '', defaultHealth, null);
      return { ...base, scene, visited: [scene], effects: [] };
    });
    setBattleId((value) => value + 1);
    setLastVictory(false);
    setPhase('intro');
  };

  const beginRun = () => {
    setLiveStamina(null);
    setLastVictory(false);
    setBattleId((value) => value + 1);
    setState(stat ? null : makeBattleState(game, '', defaultHealth, null));
    setPhase(stat ? 'health' : 'select');
  };

  const finishHealthRoll = (value: number) => {
    setLiveStamina(null);
    setLastVictory(false);
    setState(makeBattleState(game, '', value, stat));
    setPhase('select');
  };

  const handleWin = (result: GameState) => {
    setLiveStamina(null);
    setState({ ...result, scene: '', visited: [] });
    setLastVictory(true);
    setPhase('select');
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

  useEffect(() => {
    if (phase !== 'select') return;
    const onKey = (event: KeyboardEvent) => {
      const number = Number(event.key);
      if (!Number.isInteger(number) || number < 1 || number > options.length) return;
      event.preventDefault();
      const buttons = document.querySelectorAll<HTMLButtonElement>('.battle-select-choices .choice');
      buttons[number - 1]?.click();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phase, options.length]);

  useEffect(() => {
    if (phase !== 'effects') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPhase('select');
        return;
      }
      const number = Number(event.key);
      if (!Number.isInteger(number) || number < 1 || number > effectOptions.length) return;
      event.preventDefault();
      document.querySelectorAll<HTMLButtonElement>('.battle-effect-choices .choice')[number - 1]?.click();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phase, effectOptions.length]);

  return (
    <div className="battle-screen">
      <div className="battle-topbar">
        <span className="battle-title">{(phase === 'select' || phase === 'effects') ? 'БОЕВОЙ РЕЖИМ' : `СРАЖЕНИЕ: ${currentCombat?.enemies?.[0]?.name?.toUpperCase() ?? 'БОЙ'}`}</span>
        <div className="battle-top-right">
          <span className="battle-progress">
            {phase === 'health' ? 'ПОДГОТОВКА' : phase === 'select' ? 'ВЫБОР ПРОТИВНИКА' : phase === 'effects' ? 'ПРЕДБОЕВЫЕ ЭФФЕКТЫ' : 'БОЙ'}
          </span>
          {stat && state && (phase === 'select' || phase === 'effects' || phase === 'intro' || phase === 'combat') && (
            <div className="vital-hud battle-vital" aria-label={`${vitalTitle}: ${liveStamina?.value ?? state.stats[stat] ?? 0}`}>
              <EffectChips game={game} effects={state.effects} />
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

      {phase === 'select' && (
        <div className="battle-select">
          <div className="battle-kicker">{lastVictory ? 'ПРОТИВНИК ПОБЕЖДЁН' : 'ПЕРЕД БОЕМ'}</div>
          <h2 className="battle-select-title">ВЫБЕРИ ПРОТИВНИКА</h2>
          <div className="choices battle-select-choices">
            {options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                className={`choice${index === 0 ? ' selected' : ''}`}
                disabled={option.scenes.length === 0}
                onClick={() => chooseEnemy(option)}
                title={option.detail}
              >
                {index + 1}. {option.label} · {option.scenes.length}
              </button>
            ))}
          </div>
          {effectOptions.length > 0 && (
            <button type="button" className="battle-effects-toggle" onClick={() => setPhase('effects')}>
              ЭФФЕКТЫ ПРЕДБОЯ · {effectOptions.length}
            </button>
          )}
          <div className="battle-select-note">
            {lastVictory ? 'Выбери следующего противника.' : 'Для обычных врагов сцена выбирается случайно.'}
          </div>
        </div>
      )}

      {phase === 'effects' && (
        <div className="battle-select battle-effects-select">
          <div className="battle-kicker">ОТЛАДКА ПРЕДБОЕВЫХ ЭФФЕКТОВ</div>
          <h2 className="battle-select-title">ВЫБЕРИ СТРАНИЦУ</h2>
          <div className="choices battle-effect-choices">
            {effectOptions.map((option, index) => (
              <button key={option.scene} type="button" className={`choice${index === 0 ? ' selected' : ''}`} onClick={() => chooseEffectScene(option.scene)}>
                {index + 1}. §{option.scene} · {option.kind === 'browning' ? 'БРАУНИНГ' : 'ГРАНАТА'}
                {option.optional ? ' · ВЫБОР' : ' · АВТО'} · {option.formula} · {option.enemy} × {option.count}
              </button>
            ))}
          </div>
          <button type="button" className="battle-effects-back" onClick={() => setPhase('select')}>
            НАЗАД К ВЫБОРУ ПРОТИВНИКА
          </button>
          <div className="battle-select-note">
            Сцена запускается с соответствующей предбоевой анимацией и эффектом.
          </div>
        </div>
      )}

      {phase === 'intro' && state && currentCombat && currentScene && (
        <div className="battle-room battle-intro">
          <div className="battle-room-head">
            <span>ВЫБРАННЫЙ ПРОТИВНИК</span>
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
            <span>ВЫБРАННЫЙ ПРОТИВНИК</span>
          </div>
          <CombatActivity
            key={`${battleId}:${state.scene}`}
            game={game}
            state={state}
            activity={{ type: 'combat', combat: currentCombat, mode: combatMode(game, currentCombat) }}
            battleMode
            visualImage={currentImage}
            handlers={{
              onCombatWin: handleWin,
              onCombatExit: onExit,
              onRestart: beginRun,
              onCheck: () => {},
              onGamble: () => {},
              onStaminaChange: handleStaminaChange,
            }}
          />
        </div>
      )}

      {phase === 'combat' && (!state || !currentCombat) && (
        <div className="battle-error">БОЕВЫЕ СЦЕНЫ НЕ НАЙДЕНЫ</div>
      )}
    </div>
  );
}
