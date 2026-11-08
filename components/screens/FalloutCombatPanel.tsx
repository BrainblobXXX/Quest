'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import type { CombatDef, CombatEnemy, Game, GameState } from '@/lib/types';

type Phase = 'loadout' | 'round' | 'rolling' | 'victory' | 'defeat';

function rollDamage(formula: string | undefined): { total: number; text: string } {
  if (!formula) return { total: 0, text: '0' };
  const match = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(formula.trim());
  if (!match) return { total: 0, text: '0' };
  const dice = Math.max(1, Number(match[1]));
  const faces = Math.max(2, Number(match[2]));
  const bonus = Number(match[3] ?? 0);
  const rolls = Array.from({ length: dice }, () => 1 + Math.floor(Math.random() * faces));
  const total = Math.max(0, rolls.reduce((sum, value) => sum + value, 0) + bonus);
  const bonusText = bonus === 0 ? '' : bonus > 0 ? ` + ${bonus}` : ` − ${Math.abs(bonus)}`;
  return { total, text: `${rolls.join(' + ')}${bonusText} = ${total}` };
}

function weaponSkill(itemId: string): string {
  if (/laser|plasma|gauss|pulse/.test(itemId)) return 'energy_weapons';
  if (/minigun|flamethrower|rocket|bozar|pancor|hk_caws|caws/.test(itemId)) return 'big_guns';
  if (/knife|crowbar|shovel|bat|melee/.test(itemId)) return 'melee';
  return 'small_guns';
}

export default function FalloutCombatPanel({
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
  const source = combat.enemies?.length ? combat.enemies : [combat.enemy];
  const initialHp = Number(state.stats.hp ?? 15);
  const hpMax = Math.max(15 + Number(state.stats.endurance ?? 1) * 5, initialHp);
  const armor = Math.max(
    0,
    ...Object.entries(state.inventory)
      .filter(([, count]) => count > 0)
      .map(([id]) => Number(game.items?.[id]?.armor_rating ?? 0)),
  );
  const weaponOptions = Object.entries(state.inventory)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, count, item: game.items?.[id] }))
    .filter((option) => option.item?.damage);
  const FISTS = { title: 'Кулаки', damage: '1d6−3' };
  const [phase, setPhase] = useState<Phase>('loadout');
  const [hp, setHp] = useState(initialHp);
  const [enemies, setEnemies] = useState<CombatEnemy[]>(source.map((enemy) => ({ ...enemy })));
  const [selectedWeapon, setSelectedWeapon] = useState(weaponOptions[0]?.id ?? 'fists');
  const [round, setRound] = useState(1);
  const [log, setLog] = useState<string[]>(
    source.map((enemy) => `${enemy.name.toUpperCase()} · Защита ${enemy.defense ?? 0} · Жизни ${enemy.health}`),
  );
  const [d20, setD20] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const interval = useRef<number | null>(null);

  const isFists = selectedWeapon === 'fists';
  const weapon = isFists ? FISTS : game.items?.[selectedWeapon];
  const skillId = isFists ? 'melee' : weaponSkill(selectedWeapon);
  const skill = Number(state.stats[skillId] ?? 1);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (interval.current !== null) window.clearInterval(interval.current);
  }, []);

  const addLog = (...lines: string[]) => setLog((current) => [...current, ...lines]);

  const attack = () => {
    if (phase !== 'round' || !weapon) return;
    const target = enemies.findIndex((enemy) => enemy.health > 0);
    if (target < 0) return;
    const die = 1 + Math.floor(Math.random() * 20);
    setD20(die);
    setPhase('rolling');
    audio.click();
    interval.current = window.setInterval(() => setD20(1 + Math.floor(Math.random() * 20)), 80);
    timer.current = window.setTimeout(() => {
      if (interval.current !== null) {
        window.clearInterval(interval.current);
        interval.current = null;
      }
      timer.current = null;
      setD20(die);
      const targetEnemy = enemies[target];
      const check = die + skill;
      const hit = check >= Number(targetEnemy.defense ?? 0);
      let nextEnemies = enemies;
      if (hit) {
        const damage = rollDamage(weapon.damage);
        nextEnemies = enemies.map((enemy, index) =>
          index === target ? { ...enemy, health: Math.max(0, enemy.health - damage.total) } : enemy,
        );
        addLog(
          `ВАША АТАКА (${skillId.toUpperCase()}): d20 ${die} + ${skill} = ${check} против Защиты ${targetEnemy.defense ?? 0} — попадание, урон ${damage.text}.`,
        );
      } else {
        addLog(`ВАША АТАКА (${skillId.toUpperCase()}): d20 ${die} + ${skill} = ${check} против Защиты ${targetEnemy.defense ?? 0} — промах.`);
      }

      const alive = nextEnemies.filter((enemy) => enemy.health > 0);
      if (alive.length === 0) {
        setEnemies(nextEnemies);
        setPhase('victory');
        audio.beep();
        return;
      }

      let nextHp = hp;
      for (const enemy of alive) {
        const damage = rollDamage(enemy.weapon);
        const taken = Math.max(0, damage.total - armor);
        nextHp = Math.max(0, nextHp - taken);
        addLog(
          `${enemy.name.toUpperCase()}: ${damage.text}, броня ${armor} → −${taken} жизней.`,
        );
        if (nextHp <= 0) break;
      }
      setEnemies(nextEnemies);
      setHp(nextHp);
      if (nextHp <= 0) {
        setPhase('defeat');
        audio.beep();
      } else {
        setRound((value) => value + 1);
        setPhase('round');
      }
    }, 1200);
  };

  const finish = () => {
    onWin({ ...state, stats: { ...state.stats, hp } });
  };

  const alive = enemies.filter((enemy) => enemy.health > 0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase === 'loadout') {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          setPhase('round');
          audio.click();
          return;
        }
        if (/^[1-9]$/.test(event.key)) {
          const index = Number(event.key) - 1;
          if (index < weaponOptions.length) {
            event.preventDefault();
            event.stopPropagation();
            setSelectedWeapon(weaponOptions[index].id);
          } else if (index === weaponOptions.length) {
            event.preventDefault();
            event.stopPropagation();
            setSelectedWeapon('fists');
          } else if (index === weaponOptions.length + 1) {
            event.preventDefault();
            event.stopPropagation();
            setPhase('round');
            audio.click();
          }
        }
        return;
      }
      if (phase === 'round' && (event.key === 'Enter' || event.key === ' ' || event.key === '1')) {
        event.preventDefault();
        event.stopPropagation();
        attack();
        return;
      }
      if (phase === 'victory' && (event.key === 'Enter' || event.key === ' ' || event.key === '1')) {
        event.preventDefault();
        event.stopPropagation();
        finish();
        return;
      }
      if (phase === 'defeat') {
        if (event.key === '1' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onRestart();
        } else if (event.key === '2') {
          event.preventDefault();
          event.stopPropagation();
          onExit();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phase, weaponOptions, selectedWeapon]);

  return (
    <div className="combat-panel fallout-panel" aria-label={`Бой: ${combat.enemy.name}`}>
      <div className="combat-status-line">
        <span>РАУНД: {round}.</span>
        <span>Врагов: {alive.length}/{enemies.length}.</span>
        <span>Жизни {hp}/{hpMax} · Броня {armor}.</span>
      </div>
      <div className="combat-log" aria-live="polite">
        {log.map((line, index) => (
          <div key={`${line}-${index}`} className={index === log.length - 1 ? 'combat-log-last' : ''}>
            &gt; {line}
          </div>
        ))}
      </div>

      {phase === 'rolling' && d20 !== null && (
        <div className="combat-dice-live">
          <span>d20: {d20}</span>
        </div>
      )}

      {phase === 'loadout' && (
        <>
          <div className="combat-note">ОРУЖИЕ · БРОНЯ {armor}</div>
          <div className="choices combat-choices">
            {weaponOptions.map((option, index) => (
              <button
                key={option.id}
                type="button"
                className={`choice${selectedWeapon === option.id ? ' selected combat-selected' : ''}`}
                onClick={() => setSelectedWeapon(option.id)}
              >
                {index + 1}. {option.item?.title.toUpperCase()} · {weaponSkill(option.id)}
              </button>
            ))}
            <button
              type="button"
              className={`choice${isFists ? ' selected combat-selected' : ''}`}
              onClick={() => setSelectedWeapon('fists')}
            >
              {weaponOptions.length + 1}. КУЛАКИ · 1d6−3
            </button>
            <button
              type="button"
              className="choice selected"
              onClick={() => {
                setPhase('round');
                audio.click();
              }}
            >
              {weaponOptions.length + 2}. В БОЙ
            </button>
          </div>
        </>
      )}

      {phase === 'round' && (
        <>
          <div className="combat-note">
            {weapon?.title.toUpperCase()} · навык {skillId.toUpperCase()} {skill}
          </div>
          <div className="choices combat-choices">
            {alive.map((enemy, index) => (
              <div key={`${enemy.name}-${index}`} className="combat-target">
                ПРОТИВНИК: {enemy.name.toUpperCase()} · ЖИЗНИ {enemy.health}
              </div>
            ))}
            <button type="button" className="choice selected" onClick={attack}>
              АТАКОВАТЬ
            </button>
          </div>
        </>
      )}

      {phase === 'victory' && (
        <>
          <div className="combat-note combat-victory-note">ПОБЕДА. Жизни {hp} / {hpMax}.</div>
          <div className="choices combat-choices">
            <button type="button" className="choice selected" onClick={finish}>
              1. ПРОДОЛЖИТЬ
            </button>
          </div>
        </>
      )}

      {phase === 'defeat' && (
        <>
          <div className="combat-note combat-defeat-note">ВЫ ПОГИБЛИ.</div>
          <div className="choices combat-choices">
            <button type="button" className="choice selected" onClick={onRestart}>1. НАЧАТЬ ЗАНОВО</button>
            <button type="button" className="choice" onClick={onExit}>2. В БИБЛИОТЕКУ</button>
          </div>
        </>
      )}
    </div>
  );
}
