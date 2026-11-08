'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import { DieFace } from '@/components/screens/Dice';
import { usePanelKeys } from '@/lib/usePanelKeys';
import { combatKey, combatKeyIndex } from '@/components/screens/combatKeys';
import { rollDie } from '@/lib/rng';
import { applyPoolDamage, resolvePoolRound } from '@/lib/combat';
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
const DICE_ROLL_MS = 2000;
const DICE_RANDOM_MS = 1500;
const FISTS = 'fists';

function rollDamage(formula: string): DamageRoll {
  const match = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(formula.trim());
  if (!match) {
    return { formula, rolls: [rollDie(6)], bonus: 0, total: 1 };
  }
  const dice = Math.max(1, Number(match[1]));
  const faces = Math.max(2, Number(match[2]));
  const bonus = Number(match[3] ?? 0);
  const rolls: number[] = [];
  for (let i = 0; i < dice; i += 1) rolls.push(rollDie(faces));
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


export default function CombatPanel({
  game,
  state,
  combat,
  onWin,
  onExit,
  onRestart,
}: {
  game: Game;
  state: GameState;
  combat: CombatDef;
  onWin: (result: GameState) => void;
  onExit: () => void;
  onRestart: () => void;
}) {
  const enemy = combat.enemy;
  const count = Math.max(1, Math.floor(enemy.count ?? 1));
  const staminaId = game.stats?.stamina ? 'stamina' : game.stats?.hp ? 'hp' : 'stamina';
  const staminaDef = game.stats?.[staminaId];
  const healthTitle = staminaId === 'hp' ? 'Здоровье' : 'Выносливость';
  const staminaMax = Number(staminaDef?.max ?? 32);
  const staminaInitial = Number(
    state.initialStats?.[staminaId] ?? staminaDef?.initial ?? state.stats[staminaId] ?? 20,
  );
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
      const damage = applyPoolDamage(next, prepared.total);
      next.splice(0, next.length, ...damage.enemies);
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
  const [diceFaces, setDiceFaces] = useState<number[]>([]);
  const [log, setLog] = useState<string[]>(setup.log);
  const [selectedChoice, setSelectedChoice] = useState(0);
  const timer = useRef<number | null>(null);
  const faceTimer = useRef<number | null>(null);
  const diceInterval = useRef<number | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const choiceButtons = () =>
    Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('.combat-choices .choice') ?? []);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (faceTimer.current !== null) window.clearTimeout(faceTimer.current);
    if (diceInterval.current !== null) window.clearInterval(diceInterval.current);
  }, []);

  useEffect(() => {
    const element = logRef.current?.closest('.scene-scroll') as HTMLElement | null;
    if (!element) return;
    // ждём раскладку после добавления абзаца/смены фазы
    const frame = window.requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [log, phase]);

  useEffect(() => {
    setSelectedChoice(0);
  }, [phase]);

  useEffect(() => {
    const buttons = choiceButtons();
    if (buttons.length === 0) return;
    setSelectedChoice((current) => {
      if (current >= 0 && current < buttons.length && !buttons[current].disabled) return current;
      const first = buttons.findIndex((button) => !button.disabled);
      return first >= 0 ? first : 0;
    });
  }, [phase, weaponPicked, grenadeUsed, log.length]);

  const alive = enemies.filter((hp) => hp > 0).length;
  const initialAlive = setup.enemies.filter((hp) => hp > 0).length;
  const enemyTotal = Math.max(1, initialAlive);
  const damageWeapons = Object.entries(game.items ?? {})
    .filter(([id, item]) => id !== 'grenade' && Boolean(item.damage))
    .map(([id]) => id);
  const explicitWeapons = combat.weapon ?? [];
  const aliasedWeapons = (combat.weapon === undefined
    ? damageWeapons
    : explicitWeapons.length === 0
      ? []
      : [...explicitWeapons, ...damageWeapons]
  ).map((id) => ALIASES[id] ?? id);
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
        note: !ammoOk ? 'нет патронов' : null,
      };
    })
    .filter((option) => option.owned);
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
    setLog((current) => [...current, ...lines]);
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
    const finalFaces = [...weaponRoll.rolls, ...(bonusRoll?.rolls ?? [])];
    const randomFace = () => rollDie(6);
    setDiceFaces(Array.from({ length: finalFaces.length }, randomFace));
    diceInterval.current = window.setInterval(() => {
      setDiceFaces(Array.from({ length: finalFaces.length }, randomFace));
    }, 80);
    faceTimer.current = window.setTimeout(() => {
      setDiceFaces(finalFaces);
      if (diceInterval.current !== null) {
        window.clearInterval(diceInterval.current);
        diceInterval.current = null;
      }
      faceTimer.current = null;
    }, DICE_RANDOM_MS);
    setRoll({ ...weaponRoll, total });
    setPhase('rolling');
    audio.click();
    timer.current = window.setTimeout(() => {
      if (faceTimer.current !== null) {
        window.clearTimeout(faceTimer.current);
        faceTimer.current = null;
      }
      if (diceInterval.current !== null) {
        window.clearInterval(diceInterval.current);
        diceInterval.current = null;
      }
      const expression = `${rollExpression(weaponRoll)}${bonusRoll ? ` + ${rollExpression(bonusRoll)}` : ''} = ${total}`;
      const result = resolvePoolRound({
        stamina,
        enemies,
        enemyAttack: Number(enemy.attack),
        total,
        threshold: combat.threshold,
      });
      setEnemies(result.enemies);
      setStamina(result.stamina);
      if (combat.threshold !== undefined) {
        if (result.outcome === 'victory') {
          addLog(
            `РАУНД ${round}: ${expression}. Порог ${combat.threshold} пройден.`,
            `${enemy.name} уничтожен.`,
            `ИТОГ РАУНДА ${round}: противников ${result.after}, ${healthTitle} ${result.stamina}/${staminaMax}.`,
          );
          setPhase('victory');
          audio.beep();
        } else {
          addLog(
            `РАУНД ${round}: ${expression}. Порог ${combat.threshold} не пройден.`,
            `Ответ: −${enemy.attack} Выносливости.`,
            `ИТОГ РАУНДА ${round}: противников ${result.after}, ${healthTitle} ${result.stamina}/${staminaMax}.`,
          );
          setPhase(result.outcome === 'defeat' ? 'defeat' : 'round');
          if (result.outcome === 'round') setRound((value) => value + 1);
        }
        setRoll(null);
        timer.current = null;
        return;
      }
      addLog(
        `РАУНД ${round}: ${expression} урона. Убито ${result.killed}.`,
        result.after > 0
          ? `Осталось ${result.after}. Ответ: −${result.after * enemy.attack} Выносливости.`
          : 'Все противники уничтожены.',
        `ИТОГ РАУНДА ${round}: противников ${result.after}, ${healthTitle} ${result.stamina}/${staminaMax}.`,
      );
      setRoll(null);
      if (result.outcome === 'victory') {
        setPhase('victory');
        audio.beep();
      } else if (result.outcome === 'defeat') {
        setPhase('defeat');
      } else {
        setRound((value) => value + 1);
        setPhase('round');
      }
      timer.current = null;
    }, DICE_ROLL_MS);
  };

  const throwGrenade = () => {
    if (phase !== 'loadout' || grenadeUsed || grenades <= 0) return;
    const result = rollDamage('2d6+1');
    const { enemies: next, killed } = applyPoolDamage(enemies, result.total);
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

  const finish = () => {
    onWin({
      ...state,
      stats: { ...state.stats, [staminaId]: stamina },
      inventory,
    });
  };

  const onKey = (event: KeyboardEvent) => {
    if (document.querySelector('.rules-modal')) return false;
    const buttons = choiceButtons();
    if (buttons.length === 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') return true;
      return false;
    }
    const active = document.activeElement;
    const focusedChoice =
      active instanceof HTMLElement && Boolean(active.closest('.combat-choices'));

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      let next = selectedChoice;
      for (let step = 0; step < buttons.length; step += 1) {
        next = (next + direction + buttons.length) % buttons.length;
        if (!buttons[next].disabled) break;
      }
      setSelectedChoice(next);
      buttons[next]?.focus({ preventScroll: true });
      return true;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      // если кнопка уже в фокусе, Enter/Space обработает сама кнопка
      if (focusedChoice) return false;
      const target = !buttons[selectedChoice]?.disabled
        ? buttons[selectedChoice]
        : buttons.find((button) => !button.disabled);
      target?.click();
      return true;
    }

    const keyIndex = combatKeyIndex(event.key);
    if (keyIndex >= 0) {
      const target = buttons[keyIndex];
      if (target && !target.disabled) {
        target.click();
        return true;
      }
    }
    return false;
  };

  usePanelKeys(onKey);

  const fistsNumber = weaponOptions.length + 1;
  const grenadeNumber = fistsNumber + 1;
  const startNumber = fistsNumber + (grenades > 0 && !grenadeUsed ? 2 : 1);

  return (
    <div className="combat-panel" role="region" aria-label={`Бой: ${enemy.name}`} ref={panelRef}>
      <div className={`combat-status-line${stamina <= 0 ? ' low' : ''}`}>
        <span>РАУНД: {round}.</span>
        {combat.threshold !== undefined && (
          <span>
            Порог - {combat.threshold}
            {combat.bonusDamage ? ` · ЭМИ +${combat.bonusDamage}` : ''}.
          </span>
        )}
      </div>

      <div className="combat-log" aria-live="polite" ref={logRef}>
        {log.map((line, index) => (
          <div key={`${line}-${index}`} className={index === log.length - 1 ? 'combat-log-last' : ''}>
            &gt; {line}
          </div>
        ))}
      </div>

      {phase === 'rolling' && diceFaces.length > 0 && (
        <div className="combat-dice-live" aria-live="polite">
          <span>БРОСОК {diceFaces.length}d6:</span>
          <span className="combat-dice-faces">
            {diceFaces.map((face, index) => (
              <DieFace value={face} key={index} />
            ))}
          </span>
        </div>
      )}

      {phase === 'loadout' && (
        <>
          <div className="combat-note">ВЫБЕРИТЕ ОРУЖИЕ</div>
          <div className="choices combat-choices">
            {weaponOptions.map((option, index) => (
              <button
                key={option.id}
                type="button"
                className={`choice${selectedChoice === index ? ' selected' : ''}${selected.id === option.id ? ' combat-selected' : ''}${option.usable ? '' : ' dim'}`}
                disabled={!option.usable}
                onFocus={() => setSelectedChoice(index)}
                onClick={() => {
                  setSelectedWeapon(option.id);
                  setWeaponPicked(true);
                }}
              >
                {combatKey(index)}. {option.title.toUpperCase()} · {option.damage}
                {option.note ? ` · ${option.note}` : ''}
                {selected.id === option.id ? ' · ВЫБРАНО' : ''}
              </button>
            ))}
            <button
              type="button"
              className={`choice${selectedChoice === weaponOptions.length ? ' selected' : ''}${selected.id === FISTS ? ' combat-selected' : ''}`}
              onFocus={() => setSelectedChoice(weaponOptions.length)}
              onClick={() => {
                setSelectedWeapon(FISTS);
                setWeaponPicked(true);
              }}
            >
              {combatKey(fistsNumber - 1)}. КУЛАКИ · 1d6−3{selected.id === FISTS ? ' · ВЫБРАНО' : ''}
            </button>
            {grenades > 0 && !grenadeUsed && (
              <button type="button" className={`choice${selectedChoice === grenadeNumber - 1 ? ' selected' : ''} combat-grenade`} onFocus={() => setSelectedChoice(grenadeNumber - 1)} onClick={throwGrenade}>
                {combatKey(grenadeNumber - 1)}. БРОСИТЬ ГРАНАТУ ×{grenades} · 2d6+1
              </button>
            )}
            <button type="button" className={`choice${selectedChoice === startNumber - 1 ? ' selected' : ''}`} onFocus={() => setSelectedChoice(startNumber - 1)} onClick={start}>
              {combatKey(startNumber - 1)}. В БОЙ
            </button>
          </div>
        </>
      )}

      {phase === 'round' && (
        <>
          <div className="combat-note">ОРУЖИЕ: {weaponTitle} · {selectedDamage}</div>
          <div className="choices combat-choices">
            <button type="button" className={`choice${selectedChoice === 0 ? ' selected' : ''}`} onFocus={() => setSelectedChoice(0)} onClick={attack}>
              A. АТАКОВАТЬ
            </button>
            <button type="button" className={`choice${selectedChoice === 1 ? ' selected' : ''}`} onFocus={() => setSelectedChoice(1)} onClick={useMedkit} disabled={!canUseMedkit}>
              B. АПТЕЧКА ×{inventory.medkit ?? 0}
            </button>
            <button type="button" className={`choice${selectedChoice === 2 ? ' selected' : ''}`} onFocus={() => setSelectedChoice(2)} onClick={() => setPhase('loadout')}>
              C. СМЕНИТЬ ОРУЖИЕ
            </button>
          </div>
        </>
      )}

      {phase === 'victory' && (
        <>
          <div className="combat-note combat-victory-note">
            ПОБЕДА. {healthTitle} {stamina} / {staminaMax}.
          </div>
          <div className="choices combat-choices">
            <button type="button" className={`choice${selectedChoice === 0 ? ' selected' : ''}`} onFocus={() => setSelectedChoice(0)} onClick={finish}>
              A. ПРОДОЛЖИТЬ
            </button>
          </div>
        </>
      )}

      {phase === 'defeat' && (
        <>
          <div className="combat-note combat-defeat-note">
            ВЫ ПОГИБЛИ. Выносливость 0 — приключение окончено.
          </div>
          <div className="choices combat-choices">
            <button type="button" className={`choice${selectedChoice === 0 ? ' selected' : ''}`} onFocus={() => setSelectedChoice(0)} onClick={onRestart}>
              A. НАЧАТЬ ЗАНОВО
            </button>
            <button type="button" className={`choice${selectedChoice === 1 ? ' selected' : ''}`} onFocus={() => setSelectedChoice(1)} onClick={onExit}>
              B. В БИБЛИОТЕКУ
            </button>
          </div>
        </>
      )}
    </div>
  );
}
