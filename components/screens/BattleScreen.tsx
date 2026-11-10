'use client';

import { useCallback, useEffect, useState } from 'react';
import CombatPanel from '@/components/screens/CombatPanel';
import InitialRoll from '@/components/screens/InitialRoll';
import { STATE_VERSION, type Game, type GameState } from '@/lib/types';

type BattlePhase = 'health' | 'select' | 'intro' | 'combat';

type EnemyKind = 'zombie' | 'armed' | 'dogs' | 'rats' | 'kong' | 'yurr';

type EnemyOption = {
  id: EnemyKind;
  label: string;
  detail: string;
};

const ENEMY_OPTIONS: EnemyOption[] = [
  { id: 'zombie', label: 'ЗОМБИ', detail: 'без оружия' },
  { id: 'armed', label: 'ЗОМБИ С ОРУЖИЕМ', detail: 'вооружённые' },
  { id: 'dogs', label: 'СОБАКИ', detail: 'стая' },
  { id: 'rats', label: 'КРЫСЫ', detail: 'стая' },
  { id: 'kong', label: 'ЗОМБИ КОНГ', detail: 'босс' },
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
  const options = ENEMY_OPTIONS.map((option) => ({
    ...option,
    scenes: scenesForEnemyKind(game, option.id),
  }));

  const handleStaminaChange = useCallback((value: number, max: number) => {
    setLiveStamina({ value, max });
  }, []);

  const chooseEnemy = (kind: EnemyKind) => {
    const scenes = scenesForEnemyKind(game, kind);
    const scene = pickRandomScene(scenes, state?.scene || undefined);
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
      if (!Number.isInteger(number) || number < 1 || number > ENEMY_OPTIONS.length) return;
      event.preventDefault();
      const buttons = document.querySelectorAll<HTMLButtonElement>('.battle-select-choices .choice');
      buttons[number - 1]?.click();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phase]);

  return (
    <div className="battle-screen">
      <div className="battle-topbar">
        <span className="battle-title">{phase === 'select' ? 'БОЕВОЙ РЕЖИМ' : `СРАЖЕНИЕ: ${currentCombat?.enemies?.[0]?.name?.toUpperCase() ?? 'БОЙ'}`}</span>
        <div className="battle-top-right">
          <span className="battle-progress">
            {phase === 'health' ? 'ПОДГОТОВКА' : phase === 'select' ? 'ВЫБОР ПРОТИВНИКА' : 'БОЙ'}
          </span>
          {stat && state && (phase === 'select' || phase === 'intro' || phase === 'combat') && (
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
                onClick={() => chooseEnemy(option.id)}
                title={option.detail}
              >
                {index + 1}. {option.label} · {option.scenes.length}
              </button>
            ))}
          </div>
          <div className="battle-select-note">
            {lastVictory ? 'Выбери следующего противника.' : 'Для обычных врагов сцена выбирается случайно.'}
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
          <CombatPanel
            key={`${battleId}:${state.scene}`}
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
    </div>
  );
}
