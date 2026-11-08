'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import { usePanelKeys } from '@/lib/usePanelKeys';
import { combatKey, combatKeyIndex } from '@/components/screens/combatKeys';
import { rollDie } from '@/lib/rng';
import { DieFace } from '@/components/screens/Dice';
import { resolveRpgRound } from '@/lib/combat';
import type { CombatDef, CombatEnemy, Game, GameState } from '@/lib/types';

type Phase = 'loadout' | 'round' | 'rolling' | 'victory' | 'defeat';


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
    const die = rollDie(20);
    setD20(die);
    setPhase('rolling');
    audio.click();
    interval.current = window.setInterval(() => setD20(rollDie(20)), 80);
    timer.current = window.setTimeout(() => {
      if (interval.current !== null) {
        window.clearInterval(interval.current);
        interval.current = null;
      }
      timer.current = null;
      setD20(die);
      const result = resolveRpgRound({
        hp,
        enemies,
        weaponDamage: weapon.damage ?? '1d6-3',
        skill,
        armor,
        d20: die,
      });
      const targetEnemy = enemies[result.target];
      const check = die + skill;
      if (targetEnemy) {
        if (result.hit) {
          addLog(
            `ВАША АТАКА (${skillId.toUpperCase()}): d20 ${die} + ${skill} = ${check} против Защиты ${targetEnemy.defense ?? 0} — попадание, урон ${result.damageText}.`,
          );
        } else {
          addLog(`ВАША АТАКА (${skillId.toUpperCase()}): d20 ${die} + ${skill} = ${check} против Защиты ${targetEnemy.defense ?? 0} — промах.`);
        }
      }

      setEnemies(result.enemies);
      if (result.outcome === 'victory') {
        addLog(`ИТОГ РАУНДА ${round}: врагов ${result.enemies.filter((enemy) => enemy.health > 0).length}/${result.enemies.length}, жизни ${result.hp}/${hpMax}, броня ${armor}.`);
        setPhase('victory');
        audio.beep();
        return;
      }
      if (result.hp < hp) {
        for (const attack of result.enemyAttacks) {
          addLog(`${attack.name.toUpperCase()}: ${attack.text}, броня ${armor} → −${attack.taken} жизней.`);
        }
      }
      setHp(result.hp);
      addLog(`ИТОГ РАУНДА ${round}: врагов ${result.enemies.filter((enemy) => enemy.health > 0).length}/${result.enemies.length}, жизни ${result.hp}/${hpMax}, броня ${armor}.`);
      if (result.outcome === 'defeat') {
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

  usePanelKeys((event) => {
    if (phase === 'loadout') {
      if (event.key === 'Enter' || event.key === ' ') {
        setPhase('round');
        audio.click();
        return true;
      }
      const keyIndex = combatKeyIndex(event.key);
      if (keyIndex >= 0) {
        const index = keyIndex;
        if (index < weaponOptions.length) {
          setSelectedWeapon(weaponOptions[index].id);
          return true;
        }
        if (index === weaponOptions.length) {
          setSelectedWeapon('fists');
          return true;
        }
        if (index === weaponOptions.length + 1) {
          setPhase('round');
          audio.click();
          return true;
        }
      }
      return false;
    }
    if (phase === 'round' && (event.key === 'Enter' || event.key === ' ' || event.key.toUpperCase() === 'A')) {
      attack();
      return true;
    }
    if (phase === 'victory' && (event.key === 'Enter' || event.key === ' ' || event.key.toUpperCase() === 'A')) {
      finish();
      return true;
    }
    if (phase === 'defeat') {
      if (event.key.toUpperCase() === 'A' || event.key === 'Enter' || event.key === ' ') {
        onRestart();
        return true;
      }
      if (event.key.toUpperCase() === 'B') {
        onExit();
        return true;
      }
    }
    return false;
  });

  return (
    <div className="combat-panel fallout-panel" aria-label={`Бой: ${combat.enemy.name}`}>
      <div className="combat-status-line">
        <span>РАУНД: {round}.</span>
      </div>
      <div className="combat-log" aria-live="polite">
        {log.map((line, index) => (
          <div key={`${line}-${index}`} className={index === log.length - 1 ? 'combat-log-last' : ''}>
            &gt; {line}
          </div>
        ))}
      </div>

      {phase === 'rolling' && d20 !== null && (
        <div className="combat-dice-live fallout-d20-live">
          <DieFace value={d20} sides={20} className="combat-die-face fallout-d20-face" numberClassName="die-number" />
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
                {combatKey(index)}. {option.item?.title.toUpperCase()} · {weaponSkill(option.id)}
              </button>
            ))}
            <button
              type="button"
              className={`choice${isFists ? ' selected combat-selected' : ''}`}
              onClick={() => setSelectedWeapon('fists')}
            >
              {combatKey(weaponOptions.length)}. КУЛАКИ · 1d6−3
            </button>
            <button
              type="button"
              className="choice selected"
              onClick={() => {
                setPhase('round');
                audio.click();
              }}
            >
              {combatKey(weaponOptions.length + 1)}. В БОЙ
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
              A. АТАКОВАТЬ
            </button>
          </div>
        </>
      )}

      {phase === 'victory' && (
        <>
          <div className="combat-note combat-victory-note">ПОБЕДА. Жизни {hp} / {hpMax}.</div>
          <div className="choices combat-choices">
            <button type="button" className="choice selected" onClick={finish}>
              A. ПРОДОЛЖИТЬ
            </button>
          </div>
        </>
      )}

      {phase === 'defeat' && (
        <>
          <div className="combat-note combat-defeat-note">ВЫ ПОГИБЛИ.</div>
          <div className="choices combat-choices">
            <button type="button" className="choice selected" onClick={onRestart}>A. НАЧАТЬ ЗАНОВО</button>
            <button type="button" className="choice" onClick={onExit}>B. В БИБЛИОТЕКУ</button>
          </div>
        </>
      )}
    </div>
  );
}
