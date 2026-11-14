'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import { usePanelKeys } from '@/lib/usePanelKeys';
import { useDecreasePulse } from '@/lib/useDecreasePulse';
import CombatVisual from '@/components/screens/CombatVisual';
import { DieFace } from '@/components/screens/Dice';
import { WeaponIcon } from '@/components/screens/WeaponIcon';
import { combatKey, combatKeyIndex } from '@/components/screens/combatKeys';
import { enemySkillPerRoundModifier, skillModifier, skillMultiplier } from '@/lib/effects';
import { expireCombatEffects } from '@/lib/effects';
import {
  enemySkillForRound,
  resolveDuelLuck,
  resolveDuelRound,
  resolveOnHit,
  type DuelRound,
} from '@/lib/mechanics/duel';
import type { CombatDef, CombatEnemy, Game, GameState, ItemDef } from '@/lib/types';

type Phase = 'round' | 'luck' | 'mercy' | 'victory' | 'defeat';

type Pending = {
  result: 'hit' | 'wound';
  baseDamage: number;
  target: number;
  poison: boolean;
  luckDamage: number;
};

type WeaponOption = {
  id: string;
  title: string;
  damage: number;
  skillBonus: number;
};

function flatDamage(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string') {
    const numeric = Number(value.trim());
    if (Number.isFinite(numeric)) return Math.max(0, numeric);
  }
  return Math.max(0, fallback);
}

function weaponOptions(game: Game, state: GameState, combat: CombatDef): WeaponOption[] {
  const options = Object.entries(state.inventory)
    .filter(([, count]) => count > 0)
    .flatMap(([id]) => {
      const item = game.items?.[id] as ItemDef | undefined;
      if (!item) return [];
      if (item.damage === undefined && item.kind !== 'weapon') return [];
      return [{
        id,
        title: item.title,
        damage: flatDamage(item.damage, combat.playerDamage ?? 2),
        skillBonus: Number(item.skill_bonus ?? 0),
      }];
    });
  return [{ id: 'fists', title: 'Кулаки', damage: Math.max(0, combat.playerDamage ?? 2), skillBonus: 0 }, ...options];
}

function enemySkill(enemy: CombatEnemy): number {
  return Number(enemy.skill ?? enemy.attack ?? 0);
}

export default function DuelCombatPanel({
  game,
  state,
  combat,
  onWin,
  onExit,
  onRestart,
  onOutcome,
  onStaminaChange,
  battleMode,
  visualImage,
}: {
  game: Game;
  state: GameState;
  combat: CombatDef;
  onWin: (result: GameState) => void;
  onExit: () => void;
  onRestart: () => void;
  onOutcome?: (result: GameState, target: string) => void;
  onStaminaChange?: (value: number, max: number) => void;
  battleMode?: boolean;
  visualImage?: string | null;
}) {
  const staminaId = game.stats?.stamina ? 'stamina' : game.stats?.hp ? 'hp' : 'stamina';
  const staminaDef = game.stats?.[staminaId];
  const staminaMax = Number(staminaDef?.max ?? 32);
  const initialStamina = Number(state.stats[staminaId] ?? staminaDef?.initial ?? 20);
  const luckId = game.stats?.luck ? 'luck' : null;
  const initialLuck = Number(luckId ? state.stats[luckId] ?? 0 : 0);
  const sourceEnemies = combat.enemies?.length ? combat.enemies : [combat.enemy];

  const [enemies, setEnemies] = useState<CombatEnemy[]>(() => sourceEnemies.map((enemy) => ({ ...enemy })));
  const [stamina, setStamina] = useState(initialStamina);
  const [luck, setLuck] = useState(initialLuck);
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState<Phase>(stamina <= 0 ? 'defeat' : 'round');
  const [weaponId, setWeaponId] = useState<string>(() => weaponOptions(game, state, combat)[0]?.id ?? 'fists');
  const [lastRoll, setLastRoll] = useState<DuelRound | null>(null);
  const [lastEnemySkill, setLastEnemySkill] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [log, setLog] = useState<string[]>([
    `ВСТРЕЧА: ${sourceEnemies.map((enemy) => enemy.name.toUpperCase()).join(', ')}`,
    'БРОСОК: 2d6 + МАСТЕРСТВО. РАНЕНИЕ: −2 ВЫНОСЛИВОСТИ.',
  ]);
  const logRef = useRef<HTMLDivElement>(null);

  // Держим свежие строки в зоне видимости, не двигая остальной бой.
  useEffect(() => {
    const element = logRef.current;
    if (!element) return;
    const frame = window.requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [log, lastRoll]);

  const options = weaponOptions(game, state, combat);
  const weapon = options.find((option) => option.id === weaponId) ?? options[0];
  const enemyIndex = enemies.findIndex((enemy) => Number(enemy.health) > 0);
  const enemy = enemies[enemyIndex];
  const enemyHealthPulse = useDecreasePulse(Number(enemy?.health ?? 0));
  const hasWeapon = options.some((option) => option.id !== 'fists');
  const noWeaponPenalty = hasWeapon ? 0 : -4;
  const passiveWeaponBonus = Object.entries(state.inventory).reduce((sum, [id, count]) => {
    if (count <= 0) return sum;
    const item = game.items?.[id];
    if (!item?.skill_bonus) return sum;
    if (item.skill_bonus_weapon && !weapon?.id.startsWith(item.skill_bonus_weapon)) return sum;
    return sum + Number(item.skill_bonus);
  }, 0);
  const playerSkill =
    Number(state.stats.skill ?? 0) * skillMultiplier(game, state) +
    skillModifier(game, state) +
    Number(weapon?.skillBonus ?? 0) +
    passiveWeaponBonus +
    noWeaponPenalty;
  const enemySkillPenalty = enemySkillPerRoundModifier(game, state);
  const playerDamage = Math.max(0, weapon?.damage ?? combat.playerDamage ?? 2);
  const enemyDamage = Math.max(0, Number(enemy?.damage ?? 2));
  const canLuck = combat.luck !== false && luckId !== null && luck > 0;

  useEffect(() => {
    onStaminaChange?.(stamina, staminaMax);
  }, [stamina, staminaMax, onStaminaChange]);

  const addLog = (...lines: string[]) => setLog((current) => [...current, ...lines]);

  function commit(nextPending: Pending, damage: number, nextLuck = luck) {
    let nextStamina = stamina;
    let nextEnemies = enemies;
    if (nextPending.result === 'hit') {
      nextEnemies = enemies.map((item, index) =>
        index === nextPending.target
          ? { ...item, health: Math.max(0, Number(item.health) - Math.max(0, damage)) }
          : item,
      );
      setEnemies(nextEnemies);
      addLog(`ВЫ РАНИЛИ: −${damage} ${enemy?.name?.toUpperCase() ?? 'ПРОТИВНИК'}.`);
    } else {
      nextStamina = Math.max(0, stamina - Math.max(0, damage));
      setStamina(nextStamina);
      addLog(`ВАС РАНИЛИ: −${damage} ВЫНОСЛИВОСТИ.`);
    }
    setLuck(nextLuck);
    setPending(null);
    setLastRoll(null);
    setLastEnemySkill(null);

    const alive = nextEnemies.some((item) => Number(item.health) > 0);
    if (!alive && nextPending.result === 'hit') {
      setPhase('victory');
      addLog('ПОБЕДА.');
      return;
    }
    if (nextPending.result === 'hit' && alive && combat.capture && combat.captureIf) {
      const target = nextEnemies.find((item) => Number(item.health) > 0);
      const atMost = combat.captureIf.enemyHealthAtMost ?? Number.POSITIVE_INFINITY;
      const atLeast = combat.captureIf.playerHealthAtLeast ?? 0;
      if (target && Number(target.health) <= atMost && nextStamina >= atLeast) {
        setPhase('mercy');
        addLog('ПРОТИВНИК РАНЕН. МОЖНО ПОЩАДИТЬ.');
        return;
      }
    }
    if (nextStamina <= 0) {
      setPhase('defeat');
      addLog('ВЫ ПОГИБЛИ.');
      return;
    }
    setPhase('round');
    setRound((value) => value + 1);
  }

  const attack = () => {
    if (phase !== 'round' || !enemy) return;
    const currentEnemySkill = Math.max(
      0,
      enemySkillForRound(enemy, round) + enemySkillPenalty * (round - 1),
    );
    const result = resolveDuelRound({
      stamina,
      enemyHp: Number(enemy.health),
      skill: playerSkill,
      enemySkill: currentEnemySkill,
      playerDamage,
      enemyDamage,
    });
    setLastRoll(result);
    setLastEnemySkill(currentEnemySkill);
    addLog(
      `РАУНД ${round}: ВЫ ${result.playerFaces.join('+')} + ${playerSkill} = ${result.playerTotal}; ` +
      `${enemy.name.toUpperCase()} ${result.enemyFaces.join('+')} + ${currentEnemySkill} = ${result.enemyTotal}.`,
    );

    if (result.result === 'parry') {
      addLog('ПАРИРОВАНО.');
      setPhase('round');
      setRound((value) => value + 1);
      return;
    }

    let baseDamage = result.result === 'hit' ? playerDamage : enemyDamage;
    let poison = false;
    let luckDamage = 2;
    if (result.result === 'wound') {
      const onHit = resolveOnHit(enemy);
      if (onHit?.triggered) {
        poison = true;
        baseDamage = onHit.damage;
        luckDamage = onHit.luckDamage;
        addLog(`ЯД: d6 = ${onHit.roll}. УРОН ${onHit.damage}, УДАЧА МОЖЕТ СНИЗИТЬ ДО ${onHit.luckDamage}.`);
      }
    }

    const nextPending: Pending = {
      result: result.result,
      baseDamage,
      target: enemyIndex,
      poison,
      luckDamage,
    };
    setPending(nextPending);
    if (canLuck) {
      setPhase('luck');
      return;
    }
    commit(nextPending, nextPending.baseDamage);
  };

  const useLuck = () => {
    if (phase !== 'luck' || !pending) return;
    const result = resolveDuelLuck(luck);
    const damage = pending.poison
      ? result.success ? pending.luckDamage : pending.baseDamage
      : pending.result === 'hit'
        ? result.success ? 4 : 1
        : result.success ? 1 : 3;
    const nextLuck = Math.max(0, luck - (combat.stealLuck !== false ? 1 : 0));
    addLog(`УДАЧА: ${result.roll} ${result.success ? '— ПОВЕЗЛО' : '— НЕ ПОВЕЗЛО'}.`);
    commit(pending, damage, nextLuck);
    audio.beep();
  };

  const skipLuck = () => {
    if (phase !== 'luck' || !pending) return;
    addLog('УДАЧА НЕ ИСПОЛЬЗОВАНА.');
    commit(pending, pending.baseDamage);
  };

  const finish = () => {
    onWin({
      ...state,
      effects: expireCombatEffects(state.effects),
      stats: {
        ...state.stats,
        [staminaId]: stamina,
        ...(luckId ? { [luckId]: luck } : {}),
      },
    });
  };

  const finishCapture = () => {
    if (!combat.capture) return;
    const result = {
      ...state,
      effects: expireCombatEffects(state.effects),
      stats: {
        ...state.stats,
        [staminaId]: stamina,
        ...(luckId ? { [luckId]: luck } : {}),
      },
    };
    if (onOutcome) onOutcome(result, combat.capture);
    else onWin(result);
  };

  usePanelKeys((event) => {
    if (document.querySelector('.rules-modal')) return false;
    const key = event.key;
    const letter = key.toUpperCase();
    if (phase === 'round') {
      const index = combatKeyIndex(key);
      if (index === options.length) {
        attack();
        return true;
      }
      if (index >= 0 && index < options.length) {
        setWeaponId(options[index].id);
        return true;
      }
      if (key === '1' || key === 'Enter' || key === ' ') {
        attack();
        return true;
      }
    }
    if (phase === 'luck') {
      if (letter === 'A' || key === '1' || key === 'Enter' || key === ' ') {
        useLuck();
        return true;
      }
      if (letter === 'B' || key === '2') {
        skipLuck();
        return true;
      }
    }
    if (phase === 'mercy') {
      if (letter === 'A' || key === '1') { finishCapture(); return true; }
      if (letter === 'B' || key === '2') { setPhase('round'); return true; }
    }
    if (phase === 'victory' && (letter === 'A' || key === '1' || key === 'Enter' || key === ' ')) {
      finish();
      return true;
    }
    if (phase === 'defeat') {
      if (letter === 'A' || key === '1') { onRestart(); return true; }
      if (letter === 'B' || key === '2') { onExit(); return true; }
    }
    return false;
  });

  return (
    <div className="combat-panel duel-panel" role="region" aria-label="Дуэльный бой">
      <div className={`combat-layout${battleMode ? ' combat-layout-with-visual' : ''}`}>
        <div className="combat-main">
          <div className="combat-status-line">
            <span>РАУНД: {round}.</span>
            <span>МАСТЕРСТВО: {playerSkill}.</span>
            <span>УДАЧА: {luck}.</span>
            <span>ВЫНОСЛИВОСТЬ: {stamina}/{staminaMax}.</span>
          </div>

          <div className="combat-log" aria-live="polite" ref={logRef}>
            {log.map((line, index) => (
              <div key={`${line}-${index}`} className={index === log.length - 1 ? 'combat-log-last' : ''}>
                &gt; {line}
              </div>
            ))}
            {lastRoll && (
              <div className="combat-roll-card actor-player" aria-live="polite">
                <div className="combat-roll-head">
                  <span>БРОСОК</span>
                </div>
                <div className="duel-dice">
                  <span>ВЫ: {lastRoll.playerFaces.join(' + ')} + {playerSkill} = {lastRoll.playerTotal}</span>
                  <span>
                    ВРАГ: {lastRoll.enemyFaces.join(' + ')} + {lastEnemySkill ?? enemySkill(enemy!)} = {lastRoll.enemyTotal}
                  </span>
                </div>
                <div className="duel-dice-faces">
                  {lastRoll.playerFaces.map((face, index) => <DieFace value={face} key={`p${index}`} />)}
                  {lastRoll.enemyFaces.map((face, index) => <DieFace value={face} key={`e${index}`} />)}
                </div>
              </div>
            )}
          </div>

          <div className="duel-enemy">
            <div className="duel-enemy-name">
              {enemy ? (
                <>
                  {enemy.name.toUpperCase()} · МАСТЕРСТВО {enemySkill(enemy)} ·{' '}
                  <span className={`duel-enemy-health${enemyHealthPulse ? ' plate-hit' : ''}`}>
                    ВЫНОСЛИВОСТЬ {enemy.health}
                  </span>
                </>
              ) : 'ПРОТИВНИКИ ПОБЕЖДЕНЫ'}
            </div>
          </div>

          {phase === 'round' && (
            <>
              <div className="combat-note">
                ОРУЖИЕ: {weapon?.title?.toUpperCase() ?? 'КУЛАКИ'} · УРОН {playerDamage}
              </div>
              <div className="choices combat-choices">
                {options.map((option, index) => (
                  <button
                    type="button"
                    key={option.id}
                    className={`choice${option.id === weapon?.id ? ' selected' : ''}`}
                    onClick={() => setWeaponId(option.id)}
                  >
                    <WeaponIcon weaponId={option.id} gameId={game.id} className="choice-weapon-icon" />
                    {combatKey(index)}. {option.title.toUpperCase()} · УРОН {option.damage}
                    {option.skillBonus !== 0
                      ? ` · МАСТЕРСТВО ${option.skillBonus > 0 ? '+' : ''}${option.skillBonus}`
                      : ''}
                  </button>
                ))}
                <button type="button" className="choice selected duel-attack-choice" onClick={attack}>
                  {combatKey(options.length)}. АТАКОВАТЬ
                </button>
              </div>
            </>
          )}

          {phase === 'luck' && pending && (
            <>
              <div className="combat-note">
                {pending.result === 'hit' ? 'ВЫ РАНИЛИ ВРАГА.' : 'ВАС РАНИЛИ.'} Испытать Удачу?
              </div>
              <div className="choices combat-choices">
                <button type="button" className="choice selected" onClick={useLuck}>
                  A. ИСПЫТАТЬ УДАЧУ
                </button>
                <button type="button" className="choice" onClick={skipLuck}>
                  B. ПРОДОЛЖИТЬ
                </button>
              </div>
            </>
          )}

          {phase === 'mercy' && (
            <>
              <div className="combat-note">
                ПРОТИВНИК РАНЕН. ПОЩАДИТЬ ИЛИ ДОБИТЬ?
              </div>
              <div className="choices combat-choices">
                <button type="button" className="choice selected" onClick={finishCapture}>
                  A. ПОЩАДИТЬ
                </button>
                <button type="button" className="choice" onClick={() => setPhase('round')}>
                  B. ДОБИТЬ
                </button>
              </div>
            </>
          )}

          {phase === 'victory' && (
            <>
              <div className="combat-note combat-victory-note">
                ПОБЕДА. ВЫНОСЛИВОСТЬ {stamina} / {staminaMax}.
              </div>
              <div className="choices combat-choices">
                <button type="button" className="choice selected" onClick={finish}>
                  A. ПРОДОЛЖИТЬ
                </button>
              </div>
            </>
          )}

          {phase === 'defeat' && (
            <>
              <div className="combat-note combat-defeat-note">
                ВЫ ПОГИБЛИ. ВЫНОСЛИВОСТЬ 0 — ПРИКЛЮЧЕНИЕ ОКОНЧЕНО.
              </div>
              <div className="choices combat-choices">
                <button type="button" className="choice selected" onClick={onRestart}>
                  A. НАЧАТЬ ЗАНОВО
                </button>
                <button type="button" className="choice" onClick={onExit}>
                  B. В БИБЛИОТЕКУ
                </button>
              </div>
            </>
          )}
        </div>

        {battleMode && (
          <CombatVisual
            enemyName={enemy?.name ?? 'ПРОТИВНИК'}
            image={visualImage}
            gameId={game.id}
            playerWeaponId={weapon?.id}
            enemyHealth={Number(enemy?.health ?? 0)}
            enemyPulse={enemyHealthPulse}
          />
        )}
      </div>
    </div>
  );

}
