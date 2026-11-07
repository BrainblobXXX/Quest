'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import type { CombatDef, Game, GameState } from '@/lib/types';

type Phase = 'loadout' | 'round' | 'rolling' | 'victory' | 'defeat';

type DamageRoll = {
  formula: string;
  rolls: number[];
  bonus: number;
  total: number;
};

type CombatSetup = {
  enemies: number[];
  stamina: number;
  log: string[];
  phase: Phase;
};

const ALIASES: Record<string, string> = { automatic: 'submachine' };
const FISTS = 'fists';

function rollDamage(formula: string): DamageRoll {
  const match = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(formula.trim());
  if (!match) {
    return { formula, rolls: [1 + Math.floor(Math.random() * 6)], bonus: 0, total: 1 };
  }
  const dice = Math.max(1, Number(match[1]));
  const faces = Math.max(2, Number(match[2]));
  const bonus = Number(match[3] ?? 0);
  const rolls: number[] = [];
  for (let i = 0; i < dice; i += 1) rolls.push(1 + Math.floor(Math.random() * faces));
  return {
    formula,
    rolls,
    bonus,
    total: Math.max(0, rolls.reduce((sum, value) => sum + value, 0) + bonus),
  };
}

function rollExpression(roll: DamageRoll): string {
  const parts = roll.rolls.map(String);
  const bonus = roll.bonus === 0 ? '' : roll.bonus > 0 ? ` + ${roll.bonus}` : ` − ${Math.abs(roll.bonus)}`;
  return `${parts.join(' + ')}${bonus}`;
}

function rollLabel(roll: DamageRoll): string {
  return `${rollExpression(roll)} = ${roll.total}`;
}

function applyDamage(enemies: number[], damage: number): { next: number[]; killed: number } {
  let remaining = damage;
  let killed = 0;
  const next = [...enemies];
  for (let i = 0; i < next.length && remaining > 0; i += 1) {
    if (next[i] <= 0) continue;
    const hit = Math.min(next[i], remaining);
    next[i] -= hit;
    remaining -= hit;
    if (next[i] <= 0) killed += 1;
  }
  return { next, killed };
}

export default function CombatPanel({
  game,
  state,
  combat,
  onWin,
  onExit,
}: {
  game: Game;
  state: GameState;
  combat: CombatDef;
  onWin: (result: GameState) => void;
  onExit: () => void;
}) {
  const enemy = combat.enemy;
  const count = Math.max(1, Math.floor(enemy.count ?? 1));
  const staminaId = 'stamina';
  const staminaDef = game.stats?.[staminaId];
  const staminaMax = Number(staminaDef?.max ?? 32);
  const staminaInitial = Number(staminaDef?.initial ?? state.stats[staminaId] ?? 20);
  const initialStamina = Number(state.stats[staminaId] ?? staminaInitial);
  const initialInventory = state.inventory;

  const [setup] = useState<CombatSetup>(() => {
    const previous = state.visited.length > 1 ? state.visited[state.visited.length - 2] : null;
    const preDamageAllowed =
      !combat.preDamageFrom || (previous !== null && combat.preDamageFrom.includes(previous));
    const next = Array.from({ length: count }, () => enemy.health);
    const lines = [`ВСТРЕЧА: ${enemy.name.toUpperCase()} × ${count}`];
    if (combat.preDamage && preDamageAllowed) {
      const prepared = rollDamage(combat.preDamage);
      const damage = applyDamage(next, prepared.total);
      next.splice(0, next.length, ...damage.next);
      lines.push(`ДО БОЯ: ${rollLabel(prepared)}. Убито ${damage.killed}.`);
    }
    let currentStamina = initialStamina;
    if (combat.preStamina !== undefined) {
      currentStamina = Math.max(0, currentStamina - Math.max(0, Number(combat.preStamina)));
      lines.push(`ДО БОЯ: −${combat.preStamina} Выносливости.`);
    }
    let initialPhase: Phase = 'loadout';
    if (next.every((hp) => hp <= 0)) initialPhase = 'victory';
    else if (currentStamina <= 0) initialPhase = 'defeat';
    return { enemies: next, stamina: currentStamina, log: lines, phase: initialPhase };
  });
  const [enemies, setEnemies] = useState<number[]>(setup.enemies);
  const [inventory, setInventory] = useState<Record<string, number>>(() => ({ ...initialInventory }));
  const [stamina, setStamina] = useState(setup.stamina);
  const [phase, setPhase] = useState<Phase>(setup.phase);
  const [round, setRound] = useState(1);
  const [selectedWeapon, setSelectedWeapon] = useState<string>(FISTS);
  const [weaponPicked, setWeaponPicked] = useState(false);
  const [grenadeUsed, setGrenadeUsed] = useState(false);
  const [roll, setRoll] = useState<DamageRoll | null>(null);
  const [log, setLog] = useState<string[]>(setup.log);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const alive = enemies.filter((hp) => hp > 0).length;
  const initialAlive = setup.enemies.filter((hp) => hp > 0).length;
  const enemyTotal = Math.max(1, initialAlive);
  const aliasedWeapons = (combat.weapon ?? []).map((id) => ALIASES[id] ?? id);
  const weaponOptions = [...new Set(aliasedWeapons)]
    .filter((id) => id !== 'grenade')
    .map((id) => {
      const item = game.items?.[id];
      const owned = (inventory[id] ?? 0) > 0;
      const ammoId = item?.ammo;
      const ammoOk = !ammoId || (inventory[ammoId] ?? 0) > 0;
      return {
        id,
        title: item?.title ?? id,
        damage: item?.damage ?? '1d6',
        owned,
        ammoOk,
        usable: owned && ammoOk,
        note: !owned ? 'нет в инвентаре' : !ammoOk ? 'нет патронов' : null,
      };
    });
  const usableOptions = weaponOptions.filter((option) => option.usable);
  const firstUsable = usableOptions[0]?.id ?? FISTS;
  const selected =
    weaponOptions.find((option) => option.id === selectedWeapon) ??
    { id: FISTS, title: 'Кулаки', damage: '1d6-3', usable: true, note: null };
  const selectedDamage = selected.id === FISTS ? '1d6-3' : selected.damage;
  const grenades = inventory.grenade ?? 0;
  const canUseMedkit = (inventory.medkit ?? 0) > 0 && stamina < staminaInitial;
  const weaponTitle = selected.id === FISTS ? 'КУЛАКИ' : selected.title.toUpperCase();

  useEffect(() => {
    if (weaponPicked) return;
    setSelectedWeapon(firstUsable);
  }, [firstUsable, weaponPicked]);

  const addLog = (...lines: string[]) => {
    setLog((current) => [...current, ...lines].slice(-6));
  };

  const start = () => {
    const chosen =
      weaponOptions.find((option) => option.id === selectedWeapon && option.usable) ??
      { id: FISTS, title: 'Кулаки', damage: '1d6-3' };
    setSelectedWeapon(chosen.id);
    setWeaponPicked(true);
    setPhase('round');
    addLog(`ОРУЖИЕ: ${chosen.id === FISTS ? 'КУЛАКИ' : chosen.title.toUpperCase()} · ${chosen.damage}`);
  };

  const attack = () => {
    if (phase !== 'round') return;
    const weaponRoll = rollDamage(selectedDamage);
    const bonusRoll = combat.bonusDamage ? rollDamage(combat.bonusDamage) : null;
    const total = weaponRoll.total + (bonusRoll?.total ?? 0);
    setRoll({ ...weaponRoll, total });
    setPhase('rolling');
    audio.click();
    timer.current = window.setTimeout(() => {
      const expression = `${rollExpression(weaponRoll)}${bonusRoll ? ` + ${rollExpression(bonusRoll)}` : ''} = ${total}`;
      if (combat.threshold) {
        if (total >= combat.threshold) {
          addLog(
            `РАУНД ${round}: ${expression}. Порог ${combat.threshold} пройден.`,
            'Зомби Конг уничтожен.',
          );
          setPhase('victory');
          audio.beep();
        } else {
          const nextStamina = Math.max(0, stamina - enemy.attack);
          setStamina(nextStamina);
          addLog(
            `РАУНД ${round}: ${expression}. Порог ${combat.threshold} не пройден.`,
            `Ответ: −${enemy.attack} Выносливости.`,
          );
          if (nextStamina <= 0) setPhase('defeat');
          else {
            setRound((value) => value + 1);
            setPhase('round');
          }
        }
        setRoll(null);
        timer.current = null;
        return;
      }

      const { next, killed } = applyDamage(enemies, total);
      const after = next.filter((hp) => hp > 0).length;
      const retaliation = after * enemy.attack;
      const nextStamina = Math.max(0, stamina - retaliation);
      setEnemies(next);
      setStamina(nextStamina);
      addLog(
        `РАУНД ${round}: ${expression} урона. Убито ${killed}.`,
        after > 0
          ? `Осталось ${after}. Ответ: −${retaliation} Выносливости.`
          : 'Все противники уничтожены.',
      );
      setRoll(null);
      if (after === 0) {
        setPhase('victory');
        audio.beep();
      } else if (nextStamina <= 0) {
        setPhase('defeat');
      } else {
        setRound((value) => value + 1);
        setPhase('round');
      }
      timer.current = null;
    }, 650);
  };

  const throwGrenade = () => {
    if (phase !== 'loadout' || grenadeUsed || grenades <= 0) return;
    const result = rollDamage('2d6+1');
    const { next, killed } = applyDamage(enemies, result.total);
    setInventory((current) => {
      const left = (current.grenade ?? 0) - 1;
      const updated = { ...current };
      if (left > 0) updated.grenade = left;
      else delete updated.grenade;
      return updated;
    });
    setGrenadeUsed(true);
    setEnemies(next);
    setRoll(result);
    addLog(`ГРАНАТА: ${rollLabel(result)}. Убито ${killed}.`);
    audio.click();
    if (next.every((hp) => hp <= 0)) {
      setPhase('victory');
      audio.beep();
    }
  };

  const useMedkit = () => {
    if (phase !== 'round' || !canUseMedkit) return;
    const heal = Math.min(staminaMax, staminaInitial) - stamina;
    setStamina(Math.min(staminaMax, staminaInitial));
    setInventory((current) => {
      const left = (current.medkit ?? 0) - 1;
      const updated = { ...current };
      if (left > 0) updated.medkit = left;
      else delete updated.medkit;
      return updated;
    });
    addLog(`АПТЕЧКА: +${heal} Выносливости.`);
    audio.beep();
  };

  const retry = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setEnemies(setup.enemies);
    setInventory({ ...initialInventory });
    setStamina(setup.stamina);
    setPhase(setup.phase);
    setRound(1);
    setSelectedWeapon(firstUsable);
    setWeaponPicked(false);
    setGrenadeUsed(false);
    setRoll(null);
    setLog(setup.log);
    audio.click();
  };

  const finish = () => {
    onWin({
      ...state,
      stats: { ...state.stats, [staminaId]: stamina },
      inventory,
    });
  };

  const onKey = (event: KeyboardEvent) => {
    if (phase !== 'round') return;
    const active = document.activeElement;
    const onButton = active instanceof HTMLElement && active.tagName === 'BUTTON';
    if (event.key === 'Enter' && !onButton) {
      event.preventDefault();
      attack();
    } else if (event.key === '1' && !onButton) {
      event.preventDefault();
      attack();
    } else if (event.key === '2' && !onButton && canUseMedkit) {
      event.preventDefault();
      useMedkit();
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const staminaPercent = Math.max(0, Math.min(100, (stamina / Math.max(1, staminaMax)) * 100));
  const enemyPercent = Math.max(0, Math.min(100, (alive / enemyTotal) * 100));

  return (
    <div className="combat-panel" role="region" aria-label={`Бой: ${enemy.name}`}>
      <div className="combat-head">
        <span>БОЙ · {enemy.name.toUpperCase()}</span>
        <span>РАУНД {round}</span>
      </div>

      <div className="combat-status">
        <div className="combat-row">
          <span>ВРАГИ</span>
          <span className="combat-value">{alive} / {enemyTotal}</span>
        </div>
        <div className="combat-bar combat-bar-enemy">
          <span style={{ width: `${enemyPercent}%` }} />
        </div>
        <div className="combat-row">
          <span>ВЫНОСЛИВОСТЬ</span>
          <span className="combat-value">{stamina} / {staminaMax}</span>
        </div>
        <div className="combat-bar combat-bar-stamina">
          <span style={{ width: `${staminaPercent}%` }} />
        </div>
        {combat.threshold !== undefined && (
          <div className="combat-row">
            <span>ПОРОГ УРОНА</span>
            <span className="combat-value">{combat.threshold}{combat.bonusDamage ? ` · ЭМИ +${combat.bonusDamage}` : ''}</span>
          </div>
        )}
      </div>

      {phase === 'loadout' && (
        <div className="combat-loadout">
          <div className="combat-section-title">ВЫБЕРИТЕ ОРУЖИЕ</div>
          <div className="combat-weapons">
            {weaponOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`combat-weapon${selected.id === option.id ? ' selected' : ''}`}
                disabled={!option.usable}
                onClick={() => {
                  setSelectedWeapon(option.id);
                  setWeaponPicked(true);
                }}
              >
                <span>{option.title.toUpperCase()}</span>
                <small>{option.damage}{option.note ? ` · ${option.note}` : ''}</small>
              </button>
            ))}
            <button
              type="button"
              className={`combat-weapon${selected.id === FISTS ? ' selected' : ''}`}
              onClick={() => {
                setSelectedWeapon(FISTS);
                setWeaponPicked(true);
              }}
            >
              <span>КУЛАКИ</span>
              <small>1d6−3</small>
            </button>
          </div>
          {grenades > 0 && !grenadeUsed && (
            <button type="button" className="combat-action combat-grenade" onClick={throwGrenade}>
              БРОСИТЬ ГРАНАТУ ×{grenades} · 2d6+1
            </button>
          )}
          <button type="button" className="combat-action combat-primary" onClick={start}>
            В БОЙ
          </button>
        </div>
      )}

      {phase === 'round' && (
        <div className="combat-actions">
          <div className="combat-weapon-line">
            <span>{weaponTitle}</span>
            <span>{selectedDamage}</span>
          </div>
          <button type="button" className="combat-action combat-primary" onClick={attack}>
            АТАКОВАТЬ
          </button>
          <div className="combat-secondary-actions">
            <button type="button" className="combat-action" onClick={useMedkit} disabled={!canUseMedkit}>
              АПТЕЧКА ×{inventory.medkit ?? 0}
            </button>
            <button type="button" className="combat-action" onClick={() => setPhase('loadout')}>
              СМЕНИТЬ ОРУЖИЕ
            </button>
          </div>
        </div>
      )}

      {phase === 'rolling' && roll && (
        <div className="combat-roll" aria-live="polite">
          <div className="combat-die">{roll.rolls.join('+')}</div>
          <div>{rollLabel(roll)}</div>
        </div>
      )}

      {phase === 'victory' && (
        <div className="combat-result combat-victory" aria-live="polite">
          <strong>ПОБЕДА</strong>
          <span>Выносливость {stamina} / {staminaMax}</span>
          <button type="button" className="combat-action combat-primary" onClick={finish}>
            ПРОДОЛЖИТЬ
          </button>
        </div>
      )}

      {phase === 'defeat' && (
        <div className="combat-result combat-defeat" aria-live="polite">
          <strong>ВЫ ПОГИБЛИ</strong>
          <span>Выносливость 0 — приключение окончено.</span>
          <div className="combat-secondary-actions">
            <button type="button" className="combat-action combat-primary" onClick={retry}>
              ПОПРОБОВАТЬ СНОВА
            </button>
            <button type="button" className="combat-action" onClick={onExit}>
              В БИБЛИОТЕКУ
            </button>
          </div>
        </div>
      )}

      <div className="combat-log" aria-live="polite">
        {log.map((line, index) => (
          <div key={`${line}-${index}`} className={index === log.length - 1 ? 'combat-log-last' : ''}>
            &gt; {line}
          </div>
        ))}
      </div>
    </div>
  );
}
