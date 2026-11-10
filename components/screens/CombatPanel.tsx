'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import { DieFace } from '@/components/screens/Dice';
import { usePanelKeys } from '@/lib/usePanelKeys';
import { combatKey, combatKeyIndex } from '@/components/screens/combatKeys';
import { rollDie } from '@/lib/rng';
import { applyPoolDamage, resolvePoolAttack, resolvePoolCounter } from '@/lib/combat';
import { WeaponIcon } from '@/components/screens/WeaponIcon';
import type { CombatDef, Game, GameState } from '@/lib/types';

type Phase = 'loadout' | 'round' | 'rolling' | 'victory' | 'defeat';

type DamageRoll = {
  formula: string;
  rolls: number[];
  bonus: number;
  total: number;
};

type RollActor = 'player' | 'ally' | 'enemy';

type RollView = {
  actor: RollActor;
  name: string;
  formula: string;
  faces: number[];
  bonus: number;
  total: number;
  rolling: boolean;
};

type CombatSetup = {
  enemies: number[];
  stamina: number;
  log: string[];
  phase: Phase;
};

const ALIASES: Record<string, string> = { automatic: 'submachine' };
const WEAPON_SOUNDS: Record<string, string> = {
  penknife: 'knife.mp3',
  baseball_bat: 'bat.mp3',
  axe: 'bat.mp3',
  sword: 'sword.mp3',
  chainsaw: 'chainsaw.mp3',
  crowbar: 'crowbar.mp3',
  pistol: 'pistol.mp3',
  sawed_off: 'shotgun.mp3',
  shotgun: 'shotgun.mp3',
  submachine: 'sub-machine.mp3',
  fists: 'fists.mp3',
};

function weaponSoundUrl(game: Game, id: string): string | null {
  const file = game.id === 'zombie-blood' ? WEAPON_SOUNDS[id] : undefined;
  return file ? `/api/games/${encodeURIComponent(game.id)}/assets/sounds/weapons/${file}` : null;
}

function enemySoundUrl(game: Game, name: string): string | null {
  if (game.id !== 'zombie-blood') return null;
  const lower = name.toLowerCase();
  const file = lower.includes('собак')
    ? 'dog.mp3'
    : lower.includes('крыс')
      ? 'rat.mp3'
      : lower.includes('зомби') || lower.includes('юрр')
        ? 'zombies.mp3'
        : null;
  return file ? `/api/games/${encodeURIComponent(game.id)}/assets/sounds/enemies/${file}` : null;
}
const ACTOR_ROLL_MS = 1400;
const ACTOR_ROLL_TICK_MS = 80;
const FISTS = 'fists';
const PLAYER_PAUSE_MS = 650;
const ATTACK_ANIM_MS = 1300;
// Боевые эффекты на 15% тише предыдущих значений.
const WEAPON_SFX_VOLUME = 0.56 * 0.85;
const ENEMY_SFX_VOLUME = 0.65 * 0.85;
const IDLE_ANIM_MS = 2900;
const DEATH_ANIM_MS = 1450;
type VisualPhase = 'idle' | 'player' | 'enemy' | 'dying' | 'dead';

type EnemyVisual = {
  key: string;
  base: string;
  passive: string[];
  attack: string[];
  death: string[];
};

function framePaths(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}_${index + 1}.png`);
}

/** Кадры листов, нарезанных по именам: yurr-01.png, zombie-kong-01.png… */
function sheetFrames(prefix: string, start: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(start + index).padStart(2, '0')}.png`);
}

function enemyVisualFor(game: Game, name: string): EnemyVisual | null {
  if (game.id !== 'zombie-blood') return null;
  const base = `/api/games/${game.id}/assets`;
  const lower = name.toLowerCase();
  if (lower.includes('конг')) {
    return {
      key: 'zombie-kong',
      base: `${base}/zombie-kong`,
      passive: framePaths('zombie-kong--static', 4),
      attack: framePaths('zombie-kong--attack', 6),
      death: framePaths('zombie-kong--die', 3),
    };
  }
  if (lower.includes('юрр')) {
    return {
      key: 'yurr',
      base: `${base}/yurr`,
      passive: framePaths('yurr-static', 4),
      attack: framePaths('yurr-attack', 3),
      death: framePaths('yurr-die', 3),
    };
  }
  if (lower.includes('с оружием')) {
    return {
      key: 'zombie-axe',
      base: `${base}/zombie-axe`,
      passive: framePaths('zombie-axe-static', 4),
      attack: framePaths('zombie-axe-attack', 3),
      death: framePaths('zombie-axe-die', 3),
    };
  }
  if (lower.includes('собак')) {
    return {
      key: 'dogs',
      base: `${base}/dogs`,
      passive: framePaths('dog-passive', 5),
      attack: framePaths('dog-attack', 5),
      death: ['dog_die_2.png', 'dog_die_3.png'],
    };
  }
  if (lower.includes('крыс')) {
    return {
      key: 'rats',
      base: `${base}/rats`,
      passive: framePaths('rat-passive', 5),
      attack: framePaths('rat-attack', 5),
      death: framePaths('rat-die', 5),
    };
  }
  return {
    key: 'zombies',
    base: `${base}/zombies`,
    passive: ['zombie-passive.png'],
    attack: ['zombie-attack_1.png', 'zombie-attack_2.png', 'zombie-attack_3.png'],
    death: ['zombie-die.png'],
  };
}

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
  onStaminaChange,
}: {
  game: Game;
  state: GameState;
  combat: CombatDef;
  onWin: (result: GameState) => void;
  onExit: () => void;
  onRestart: () => void;
  onStaminaChange?: (value: number, max: number) => void;
}) {
  const enemy = combat.enemy;
  const boss = enemy.boss === true;
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

  useEffect(() => {
    onStaminaChange?.(stamina, staminaMax);
  }, [stamina, staminaMax, onStaminaChange]);


  const [phase, setPhase] = useState<Phase>(setup.phase);
  const [round, setRound] = useState(1);
  const [selectedWeapon, setSelectedWeapon] = useState<string>(FISTS);
  const [weaponPicked, setWeaponPicked] = useState(false);
  const [grenadeUsed, setGrenadeUsed] = useState(false);
  const [rollView, setRollView] = useState<RollView | null>(null);
  const [activeAllyId, setActiveAllyId] = useState<string | null>(null);
  const [playerShooting, setPlayerShooting] = useState(false);
  const [log, setLog] = useState<string[]>(setup.log);
  const [selectedChoice, setSelectedChoice] = useState(0);
  const [visual, setVisual] = useState<VisualPhase>(setup.phase === 'victory' ? 'dead' : 'idle');
  const [hitFlash, setHitFlash] = useState(false);
  const [attackFrame, setAttackFrame] = useState(0);
  const [idleFrame, setIdleFrame] = useState(0);
  const [deathFrame, setDeathFrame] = useState(0);
  const sequence = useRef<number[]>([]);
  const faceTimer = useRef<number | null>(null);
  const diceInterval = useRef<number | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const choiceButtons = () =>
    Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('.combat-choices .choice') ?? []);

  useEffect(() => () => {
    if (faceTimer.current !== null) window.clearTimeout(faceTimer.current);
    if (diceInterval.current !== null) window.clearInterval(diceInterval.current);
    for (const id of sequence.current) window.clearTimeout(id);
    sequence.current = [];
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
  const enemyMaxHealth = Math.max(1, Number(enemy.health ?? 1));
  const enemyCurrentHealth = enemies.reduce((total, hp) => total + Math.max(0, hp), 0);
  const initialAlive = setup.enemies.filter((hp) => hp > 0).length;
  const enemyTotal = Math.max(1, initialAlive);
  const allies = combat.allies ?? [];
  const allowedWeaponIds = combat.restrictions?.allowedWeapons
    ? new Set(combat.restrictions.allowedWeapons.map((id) => ALIASES[id] ?? id))
    : null;
  const allowedItemIds = combat.restrictions?.allowedItems
    ? new Set(combat.restrictions.allowedItems)
    : null;
  const weaponAllowed = (id: string) => !allowedWeaponIds || allowedWeaponIds.has(ALIASES[id] ?? id);
  const itemAllowed = (id: string) => !allowedItemIds || allowedItemIds.has(id);
  const fistsAllowed = weaponAllowed(FISTS);
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
    .filter((option) => option.owned && weaponAllowed(option.id));
  const usableOptions = weaponOptions.filter((option) => option.usable);
  const firstUsable = usableOptions[0]?.id ?? FISTS;
  const selected =
    weaponOptions.find((option) => option.id === selectedWeapon) ??
    { id: FISTS, title: 'Кулаки', damage: '1d6-3', usable: true, note: null };
  const selectedDamage = selected.id === FISTS ? '1d6-3' : selected.damage;
  const grenades = inventory.grenade ?? 0;
  const canUseGrenades = itemAllowed('grenade');
  const canUseMedkit = itemAllowed('medkit') && (inventory.medkit ?? 0) > 0 && stamina < staminaInitial;
  const weaponTitle = selected.id === FISTS ? 'КУЛАКИ' : selected.title.toUpperCase();
  const restrictionNotes: string[] = [];
  if (allowedWeaponIds && allowedWeaponIds.size === 1 && allowedWeaponIds.has(FISTS)) {
    restrictionNotes.push('В ЭТОМ БОЮ ТОЛЬКО ГОЛЫЕ РУКИ');
  }
  if (allowedItemIds && allowedItemIds.size === 0) {
    restrictionNotes.push('ПРЕДМЕТЫ НЕДОСТУПНЫ');
  }

  useEffect(() => {
    if (weaponPicked) return;
    setSelectedWeapon(firstUsable);
  }, [firstUsable, weaponPicked]);

  useEffect(() => {
    const forced = combat.restrictions?.forceWeapon;
    if (!forced || weaponPicked) return;
    const id = ALIASES[forced] ?? forced;
    if (id === FISTS && fistsAllowed) setSelectedWeapon(FISTS);
    else if (weaponOptions.some((option) => option.id === id)) setSelectedWeapon(id);
  }, [combat.restrictions?.forceWeapon, weaponPicked, fistsAllowed, weaponOptions]);

  const addLog = (...lines: string[]) => {
    setLog((current) => [...current, ...lines]);
  };

  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      sequence.current = sequence.current.filter((item) => item !== id);
      fn();
    }, ms);
    sequence.current.push(id);
  };

  const wait = (ms: number) => new Promise<void>((resolve) => {
    const id = window.setTimeout(() => {
      sequence.current = sequence.current.filter((item) => item !== id);
      resolve();
    }, ms);
    sequence.current.push(id);
  });

  const animateRoll = (
    actor: RollActor,
    name: string,
    damageRoll: DamageRoll,
  ) => new Promise<void>((resolve) => {
    if (faceTimer.current !== null) window.clearTimeout(faceTimer.current);
    if (diceInterval.current !== null) window.clearInterval(diceInterval.current);
    const randomFace = () => rollDie(6);
    const finalFaces = damageRoll.rolls;
    setRollView({
      actor,
      name,
      formula: damageRoll.formula,
      faces: Array.from({ length: finalFaces.length }, randomFace),
      bonus: damageRoll.bonus,
      total: damageRoll.total,
      rolling: true,
    });
    diceInterval.current = window.setInterval(() => {
      setRollView((current) => current ? {
        ...current,
        faces: Array.from({ length: finalFaces.length }, randomFace),
      } : current);
    }, ACTOR_ROLL_TICK_MS);
    faceTimer.current = window.setTimeout(() => {
      if (diceInterval.current !== null) {
        window.clearInterval(diceInterval.current);
        diceInterval.current = null;
      }
      faceTimer.current = null;
      setRollView({
        actor,
        name,
        formula: damageRoll.formula,
        faces: finalFaces,
        bonus: damageRoll.bonus,
        total: damageRoll.total,
        rolling: false,
      });
      resolve();
    }, ACTOR_ROLL_MS);
  });

  useEffect(() => {
    if (phase === 'loadout' || phase === 'round') setVisual('idle');
  }, [phase]);

  const enemyVisual = enemyVisualFor(game, enemy.name);
  const enemyVisualKey = enemyVisual ? enemyVisual.key : 'none';
  const hasVisual = Boolean(enemyVisual);

  useEffect(() => {
    if (!enemyVisual || visual !== 'enemy' || enemyVisual.attack.length === 0) {
      setAttackFrame(0);
      return;
    }
    const length = enemyVisual.attack.length;
    setAttackFrame(0);
    if (length === 1) return;
    let frame = 0;
    const step = Math.max(120, Math.round(ATTACK_ANIM_MS / length));
    const id = window.setInterval(() => {
      frame += 1;
      if (frame >= length) {
        setAttackFrame(length - 1);
        window.clearInterval(id);
        return;
      }
      setAttackFrame(frame);
    }, step);
    return () => window.clearInterval(id);
  }, [visual, enemyVisualKey]);

  const visualFrame = enemyVisual
    ? visual === 'dying'
      ? enemyVisual.death[deathFrame % enemyVisual.death.length]
      : visual === 'enemy'
        ? enemyVisual.attack[attackFrame % enemyVisual.attack.length]
        : enemyVisual.passive[idleFrame % enemyVisual.passive.length]
    : '';
  const enemySrc = enemyVisual ? `${enemyVisual.base}/${visualFrame}` : '';

  useEffect(() => {
    if (!enemyVisual || visual !== 'idle' || enemyVisual.passive.length < 2) {
      setIdleFrame(0);
      return;
    }
    const id = window.setInterval(() => {
      setIdleFrame((frame) => (frame + 1) % enemyVisual.passive.length);
    }, Math.max(100, Math.round(IDLE_ANIM_MS / enemyVisual.passive.length)));
    return () => window.clearInterval(id);
  }, [enemyVisualKey, visual]);

  useEffect(() => {
    if (!enemyVisual || visual !== 'dying' || enemyVisual.death.length === 0) {
      setDeathFrame(0);
      return;
    }
    const length = enemyVisual.death.length;
    setDeathFrame(0);
    if (length === 1) return;
    let frame = 0;
    const step = Math.max(120, Math.round(DEATH_ANIM_MS / length));
    const id = window.setInterval(() => {
      frame += 1;
      if (frame >= length) {
        setDeathFrame(length - 1);
        window.clearInterval(id);
        return;
      }
      setDeathFrame(frame);
    }, step);
    return () => window.clearInterval(id);
  }, [enemyVisualKey, visual]);

  // На выборе оружия спрайт скрыт, поэтому предзагружаем все кадры заранее:
  // иначе при переходе в бой на долю секунды виден alt-текст вместо противника.
  useEffect(() => {
    if (!enemyVisual) return;
    const sources = [...enemyVisual.passive, ...enemyVisual.attack, ...enemyVisual.death].map(
      (file) => `${enemyVisual.base}/${file}`,
    );
    const images = sources.map((src) => {
      const image = new window.Image();
      image.src = src;
      return image;
    });
    return () => {
      for (const image of images) image.src = '';
    };
  }, [enemyVisualKey]);

  const start = () => {
    const chosen =
      weaponOptions.find((option) => option.id === selectedWeapon && option.usable) ??
      { id: FISTS, title: 'Кулаки', damage: '1d6-3' };
    setSelectedWeapon(chosen.id);
    setWeaponPicked(true);
    setPhase('round');
    addLog(`ОРУЖИЕ: ${chosen.id === FISTS ? 'КУЛАКИ' : chosen.title.toUpperCase()} · ${chosen.damage}`);
  };

  const attack = async () => {
    if (phase !== 'round') return;
    setPhase('rolling');
    setRollView(null);
    const playerRoll = rollDamage(selectedDamage);
    const playerName = selected.id === FISTS ? 'КУЛАКИ' : selected.title.toUpperCase();
    await animateRoll('player', playerName, playerRoll);
    setPlayerShooting(true);
    setVisual('player');
    await wait(450);
    setPlayerShooting(false);
    setVisual('idle');
    setRollView(null);
    addLog(`ИГРОК: ${playerName} · ${rollLabel(playerRoll)}`);

    const attackAllies = [...allies];
    if (attackAllies.length === 0 && combat.bonusDamage) {
      attackAllies.push({ id: 'bonus', name: 'БОНУС', damage: combat.bonusDamage });
    }
    let allyTotal = 0;
    for (const ally of attackAllies) {
      setActiveAllyId(ally.id);
      const allyRoll = rollDamage(ally.damage);
      await animateRoll('ally', ally.name.toUpperCase(), allyRoll);
      setVisual('player');
      await wait(450);
      setVisual('idle');
      setActiveAllyId(null);
      setRollView(null);
      allyTotal += allyRoll.total;
      addLog(`${ally.name.toUpperCase()}: ${rollLabel(allyRoll)}`);
    }
    const total = playerRoll.total + allyTotal;
    if (attackAllies.length > 0) addLog(`СУММА: ${playerRoll.total} + ${allyTotal} = ${total}`);

    const offense = resolvePoolAttack({ enemies, total, threshold: combat.threshold });
    setEnemies(offense.enemies);

    if (offense.victory) {
      setVisual('dying');
      addLog(
        combat.threshold !== undefined
          ? `РАУНД ${round}: ${total}. Порог ${combat.threshold} пройден.`
          : `РАУНД ${round}: ${total} урона. Убито ${offense.killed}. Все противники уничтожены.`,
      );
      await wait(DEATH_ANIM_MS);
      setVisual('dead');
      addLog(`ИТОГ РАУНДА ${round}: противников 0, ${healthTitle} ${stamina}/${staminaMax}.`);
      setPhase('victory');
      setRollView(null);
      audio.beep();
      return;
    }

    const hitSound = weaponSoundUrl(game, selected.id);
    if (hitSound) audio.sfx(hitSound, WEAPON_SFX_VOLUME);
    if (combat.threshold !== undefined) {
      addLog(`РАУНД ${round}: ${total}. Порог ${combat.threshold} не пройден.`);
    } else {
      addLog(`РАУНД ${round}: ${total} урона. Убито ${offense.killed}.`);
    }

    await wait(PLAYER_PAUSE_MS);

    let enemyRoll: DamageRoll | null = null;
    let enemyDamage = 0;
    const counterFactor = combat.threshold !== undefined ? 1 : Math.max(1, offense.after);
    if (enemy.attackRoll) {
      enemyRoll = rollDamage(enemy.attackRoll);
      await animateRoll('enemy', enemy.name.toUpperCase(), enemyRoll);
      setRollView(null);
      // Рывок/удар врага начинается только после завершения его броска.
      setVisual('enemy');
      const enemySound = enemySoundUrl(game, enemy.name);
      if (enemySound) audio.sfx(enemySound, ENEMY_SFX_VOLUME);
      enemyDamage = enemyRoll.total * counterFactor;
      addLog(`ПРОТИВНИК: ${enemy.name.toUpperCase()} · ${rollLabel(enemyRoll)}`);
      await wait(ATTACK_ANIM_MS);
    } else {
      setVisual('enemy');
      const enemySound = enemySoundUrl(game, enemy.name);
      if (enemySound) audio.sfx(enemySound, ENEMY_SFX_VOLUME);
      enemyDamage = Number(enemy.attack) * counterFactor;
      await wait(ATTACK_ANIM_MS);
    }

    const counter = resolvePoolCounter({ stamina, damage: enemyDamage });
    setStamina(counter.stamina);
    addLog(
      `ОТВЕТ: −${enemyDamage} ${healthTitle}.`,
      `ИТОГ РАУНДА ${round}: противников ${offense.after}, ${healthTitle} ${counter.stamina}/${staminaMax}.`,
    );
    setHitFlash(true);
    await wait(520);
    setHitFlash(false);
    setRollView(null);
    if (counter.outcome === 'defeat') {
      setPhase('defeat');
    } else {
      setRound((value) => value + 1);
      setPhase('round');
    }
  };

  const throwGrenade = () => {
    if (phase !== 'loadout' || grenadeUsed || grenades <= 0 || !canUseGrenades) return;
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
    setRollView({
      actor: 'player',
      name: 'ГРАНАТА',
      formula: result.formula,
      faces: result.rolls,
      bonus: result.bonus,
      total: result.total,
      rolling: false,
    });
    addLog(`ГРАНАТА: ${rollLabel(result)}. Убито ${killed}.`);
    audio.click();
    if (next.every((hp) => hp <= 0)) {
      setPhase('rolling');
      setVisual('dying');
      later(DEATH_ANIM_MS, () => {
        setVisual('dead');
        setPhase('victory');
        audio.beep();
      });
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

  const fistsNumber = weaponOptions.length + (fistsAllowed ? 1 : 0);
  const grenadeNumber = fistsNumber + 1;
  const startNumber = fistsNumber + (canUseGrenades && grenades > 0 && !grenadeUsed ? 2 : 1);

  return (
    <div className={`combat-panel${hasVisual ? ' combat-with-visual' : ''}${hitFlash ? ' combat-player-hit' : ''}`} role="region" aria-label={`Бой: ${enemy.name}`} ref={panelRef}>
      <div className={`combat-hit-flash${hitFlash ? ' is-hit' : ''}`} aria-hidden="true" />
      <div className={`combat-layout${hasVisual ? ' combat-layout-with-visual' : ''}`}>
        <div className="combat-main">
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

      {phase === 'rolling' && rollView && (
        <div className={`combat-roll-card actor-${rollView.actor}${rollView.rolling ? ' is-rolling' : ''}`} aria-live="polite">
          <div className="combat-roll-head">
            <span>{rollView.actor === 'player' ? 'ИГРОК' : rollView.actor === 'ally' ? 'СОЮЗНИК' : 'ПРОТИВНИК'}</span>
            <strong>{rollView.name}</strong>
          </div>
          <div className="combat-dice-live">
            <span className="combat-dice-faces">
              {rollView.faces.map((face, index) => (
                <DieFace value={face} key={index} />
              ))}
            </span>
            <span className="combat-roll-formula">
              {rollView.formula} {rollView.rolling ? '…' : `= ${rollView.total}`}
            </span>
          </div>
        </div>
      )}

      {phase === 'loadout' && (
        <>
          <div className="combat-note combat-loadout-note">
            <WeaponIcon weaponId={selected.id} gameId={game.id} className="loadout-weapon-icon" />
            <span>ВЫБЕРИТЕ ОРУЖИЕ</span>
          </div>
          {restrictionNotes.map((note) => (
            <div className="combat-restriction-note" key={note}>{note}</div>
          ))}
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
                <WeaponIcon weaponId={option.id} gameId={game.id} className="choice-weapon-icon" />
                {combatKey(index)}. {option.title.toUpperCase()} · {option.damage}
                {option.note ? ` · ${option.note}` : ''}
                {selected.id === option.id ? ' · ВЫБРАНО' : ''}
              </button>
            ))}
            {fistsAllowed && (
              <button
                type="button"
                className={`choice${selectedChoice === weaponOptions.length ? ' selected' : ''}${selected.id === FISTS ? ' combat-selected' : ''}`}
                onFocus={() => setSelectedChoice(weaponOptions.length)}
                onClick={() => {
                  setSelectedWeapon(FISTS);
                  setWeaponPicked(true);
                }}
              >
                <WeaponIcon weaponId={FISTS} gameId={game.id} className="choice-weapon-icon" />
                {combatKey(fistsNumber - 1)}. КУЛАКИ · 1d6−3{selected.id === FISTS ? ' · ВЫБРАНО' : ''}
              </button>
            )}
            {canUseGrenades && grenades > 0 && !grenadeUsed && (
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

        {hasVisual && (
          <aside className={`combat-visual${phase === 'loadout' ? ' is-loadout' : ''}${boss ? ' combat-boss' : ''}`} aria-label={phase === 'loadout' ? 'Выбор оружия' : `Игрок против ${enemy.name}, осталось ${alive}`}>
            <div className={`combat-visual-block combat-player-block${allies.length > 0 ? ' has-ally' : ''}`}>
              <div className="combat-visual-label">ИГРОК</div>
              <div className="combat-player-line">
                {allies.map((ally) => (
                  <div key={ally.id} className={`combat-ally${activeAllyId === ally.id ? ' is-shooting' : ''}`}>
                    <WeaponIcon
                      weaponId={ally.weapon ?? FISTS}
                      gameId={game.id}
                      className="combat-ally-icon"
                    />
                    <span className="combat-ally-name">{ally.name.toUpperCase()}</span>
                  </div>
                ))}
                <div className={`combat-weapon${playerShooting ? ' is-shooting' : ''}`}>
                  <WeaponIcon weaponId={selected.id} gameId={game.id} />
                  <span className="weapon-muzzle" aria-hidden="true" />
                  <div className="weapon-name">{weaponTitle}</div>
                  <div className="weapon-damage">{selectedDamage}</div>
                </div>
              </div>
            </div>
            {phase !== 'loadout' && (
              <>
                <div className="combat-vs" aria-hidden="true">VS</div>
                <div className={`combat-visual-block combat-enemy-block${boss ? ' is-boss' : ''}`}>
                  <div className="combat-visual-label">ПРОТИВНИК</div>
                  <div className={`zombie-figure ${visual}${boss ? ' is-boss' : ''}`} role="img" aria-label={`${enemy.name}, осталось ${alive}`}>
                    {visual !== 'dead' && (
                      <img
                        src={enemySrc}
                        alt=""
                        draggable={false}
                        loading="eager"
                        decoding="async"
                      />
                    )}
                    <div className="zombie-badges">
                      <span className="zombie-count" aria-label={`Количество: ${alive}`}>
                        × {alive}
                      </span>
                      {enemyMaxHealth > 1 && alive > 0 && (
                        <span className="zombie-health" aria-label={`Текущие жизни: ${enemyCurrentHealth}`}>
                          ♥ {enemyCurrentHealth}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
