'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import { usePanelKeys } from '@/lib/usePanelKeys';
import { combatKey, combatKeyIndex } from '@/components/screens/combatKeys';
import { roll2d6, rollDie } from '@/lib/rng';
import { resolveContestRound } from '@/lib/combat';
import { DieFace } from '@/components/screens/Dice';
import type { CombatDef, Game, GameState } from '@/lib/types';

type Phase = 'loadout' | 'round' | 'rolling' | 'victory' | 'defeat';
type Roll = { enemy: number; player: number; enemyFaces: number[]; playerFaces: number[] };


export default function ContestCombatPanel({
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
  const hpMax = Number(game.stats?.hp?.max ?? 5);
  const initialHp = Number(state.stats.hp ?? hpMax);
  const muscles = Number(state.stats.muscles ?? 0);
  const brains = Number(state.stats.brains ?? 0);
  const luck = Number(state.stats.luck ?? 0);
  const defense = Number(enemy.defense ?? 0);
  const enemyMax = Math.max(1, Number(enemy.health ?? 1));

  const armor = Math.max(
    0,
    ...Object.entries(state.inventory)
      .filter(([, count]) => count > 0)
      .map(([id]) => Number(game.items?.[id]?.armor_rating ?? 0)),
  );
  const weaponOptions = Object.entries(state.inventory)
    .filter(([, count]) => count > 0)
    .map(([id]) => ({ id, title: game.items?.[id]?.title ?? id, rating: Number(game.items?.[id]?.weapon_rating ?? 0), item: game.items?.[id] }))
    .filter((option) => option.item && option.rating >= 0 && (option.item.weapon_rating !== undefined || option.item.damage !== undefined));

  const [phase, setPhase] = useState<Phase>('loadout');
  const [hp, setHp] = useState(initialHp);
  const [enemyHp, setEnemyHp] = useState(enemyMax);
  const [round, setRound] = useState(1);
  const [selectedWeapon, setSelectedWeapon] = useState(weaponOptions[0]?.id ?? 'fists');
  const [log, setLog] = useState<string[]>([
    `ВСТРЕЧА: ${enemy.name.toUpperCase()}`,
    `АТАКА ${enemy.attack} · ЗАЩИТА ${defense} · ЗДОРОВЬЕ ${enemyMax}`,
  ]);
  const [roll, setRoll] = useState<Roll | null>(null);
  const [diceFaces, setDiceFaces] = useState<number[]>([]);
  const timer = useRef<number | null>(null);
  const interval = useRef<number | null>(null);

  const selected = weaponOptions.find((option) => option.id === selectedWeapon);
  const weaponRating = selected?.rating ?? 0;
  const weaponTitle = selected?.title.toUpperCase() ?? 'КУЛАКИ';

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (interval.current !== null) window.clearInterval(interval.current);
  }, []);

  useEffect(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (interval.current !== null) window.clearInterval(interval.current);
    timer.current = null;
    interval.current = null;
    setPhase('loadout');
    setHp(initialHp);
    setEnemyHp(enemyMax);
    setRound(1);
    setRoll(null);
  }, [combat.scene, initialHp, enemyMax]);

  const addLog = (...lines: string[]) => setLog((current) => [...current, ...lines]);

  const attack = () => {
    if (phase !== 'round') return;
    const enemyRoll = roll2d6();
    const playerRoll = roll2d6();
    const current: Roll = {
      enemy: enemyRoll.total,
      player: playerRoll.total,
      enemyFaces: enemyRoll.faces,
      playerFaces: playerRoll.faces,
    };
    setRoll(current);
    setDiceFaces([...enemyRoll.faces, ...playerRoll.faces]);
    setPhase('rolling');
    audio.click();
    interval.current = window.setInterval(() => {
      setDiceFaces(Array.from({ length: 4 }, () => rollDie(6)));
    }, 80);
    timer.current = window.setTimeout(() => {
      if (interval.current !== null) {
        window.clearInterval(interval.current);
        interval.current = null;
      }
      timer.current = null;
      setDiceFaces([...enemyRoll.faces, ...playerRoll.faces]);

      const result = resolveContestRound({
        hp,
        enemyHp,
        enemyAttack: Number(enemy.attack),
        enemyDefense: defense,
        brains,
        luck,
        muscles,
        armor,
        weaponRating,
        stopAtOne: combat.stopAtOne,
        enemyFaces: enemyRoll.faces,
        playerFaces: playerRoll.faces,
      });
      addLog(
        `РАУНД ${round}: противник ${result.enemyTotal} + ${Math.max(brains, luck)} + броня ${armor} = ${result.enemyCheck} против Атаки ${enemy.attack} — ${result.enemyHit ? 'попадание' : 'промах'}.`,
      );
      if (result.enemyHit) addLog('Вы теряете 1 Здоровье.');
      setHp(result.hp);
      if (result.outcome === 'defeat') {
        addLog(`ИТОГ РАУНДА ${round}: противник ${result.enemyHp}/${enemyMax}, здоровье ${result.hp}/${hpMax}.`);
        setPhase('defeat');
        audio.beep();
        return;
      }
      if (result.playerCheck === 0) {
        addLog(`ИТОГ РАУНДА ${round}: противник ${result.enemyHp}/${enemyMax}, здоровье ${result.hp}/${hpMax}.`);
        setPhase('victory');
        addLog('У одного из вас осталось 1 Здоровье — бой окончен.');
        audio.beep();
        return;
      }

      addLog(
        `Ваша атака: ${result.playerTotal} + ${muscles} + оружие ${weaponRating} = ${result.playerCheck} против Защиты ${defense} — ${result.playerHit ? 'попадание' : 'промах'}.`,
      );
      if (result.playerHit) addLog('Противник теряет 1 Здоровье.');
      setEnemyHp(result.enemyHp);
      addLog(`ИТОГ РАУНДА ${round}: противник ${result.enemyHp}/${enemyMax}, здоровье ${result.hp}/${hpMax}.`);
      setRoll(null);
      if (result.outcome === 'victory') {
        setPhase('victory');
        if (combat.stopAtOne && result.enemyHp <= 1 && result.enemyHp > 0) {
          addLog('У противника осталось 1 Здоровье — бой окончен.');
        }
        audio.beep();
      } else {
        setRound((value) => value + 1);
        setPhase('round');
      }
    }, 1300);
  };

  const finish = () => {
    onWin({ ...state, stats: { ...state.stats, hp } });
  };

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
    <div className="combat-panel contest-panel" aria-label={`Бой: ${enemy.name}`}>
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

      {phase === 'rolling' && diceFaces.length > 0 && (
        <div className="combat-dice-live">
          <span>ПРОТИВНИК</span>
          <span className="combat-dice-faces">
            {diceFaces.slice(0, 2).map((face, index) => <DieFace value={face} key={`e${index}`} className="combat-die-face contest-die-face" />)}
          </span>
          <span>ВЫ</span>
          <span className="combat-dice-faces">
            {diceFaces.slice(2).map((face, index) => <DieFace value={face} key={`p${index}`} className="combat-die-face contest-die-face" />)}
          </span>
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
                onClick={() => {
                  setSelectedWeapon(option.id);
                  audio.click();
                }}
              >
                {combatKey(index)}. {option.title.toUpperCase()} · рейтинг {option.rating >= 0 ? '+' : ''}{option.rating}
              </button>
            ))}
            <button
              type="button"
              className={`choice${selectedWeapon === 'fists' ? ' selected combat-selected' : ''}`}
              onClick={() => setSelectedWeapon('fists')}
            >
              {combatKey(weaponOptions.length)}. КУЛАКИ · рейтинг +0
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
          <div className="combat-note">ОРУЖИЕ: {weaponTitle} · рейтинг +{weaponRating} · БРОНЯ {armor}</div>
          <div className="choices combat-choices">
            <button type="button" className="choice selected" onClick={attack}>
              A. АТАКОВАТЬ
            </button>
          </div>
        </>
      )}

      {phase === 'victory' && (
        <>
          <div className="combat-note combat-victory-note">ПОБЕДА. Здоровье {hp} / {hpMax}.</div>
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
  );
}
