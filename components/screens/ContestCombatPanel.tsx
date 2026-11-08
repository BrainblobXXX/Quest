'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import type { CombatDef, Game, GameState } from '@/lib/types';

type Phase = 'loadout' | 'round' | 'rolling' | 'victory' | 'defeat';
type Roll = { enemy: number; player: number; enemyFaces: number[]; playerFaces: number[] };

const DIE_PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function DieFace({ value }: { value: number }) {
  const active = DIE_PIPS[value] ?? [];
  return (
    <span className="combat-die-face contest-die-face" role="img" aria-label={`${value}`}>
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className={`combat-die-pip${active.includes(index + 1) ? ' on' : ''}`} />
      ))}
    </span>
  );
}

function roll2d6(): { total: number; faces: number[] } {
  const faces = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  return { total: faces[0] + faces[1], faces };
}

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
      setDiceFaces(Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6)));
    }, 80);
    timer.current = window.setTimeout(() => {
      if (interval.current !== null) {
        window.clearInterval(interval.current);
        interval.current = null;
      }
      timer.current = null;
      setDiceFaces([...enemyRoll.faces, ...playerRoll.faces]);

      const enemyCheck = enemyRoll.total + Math.max(brains, luck) + armor;
      const enemyHit = enemyCheck >= Number(enemy.attack);
      let nextHp = hp;
      if (enemyHit) nextHp = Math.max(0, hp - 1);
      addLog(
        `РАУНД ${round}: противник ${enemyRoll.total} + ${Math.max(brains, luck)} + броня ${armor} = ${enemyCheck} против Атаки ${enemy.attack} — ${enemyHit ? 'попадание' : 'промах'}.`,
      );
      if (enemyHit) addLog('Вы теряете 1 Здоровье.');
      if (nextHp <= 0) {
        setHp(0);
        setPhase('defeat');
        audio.beep();
        return;
      }
      if (combat.stopAtOne && nextHp <= 1) {
        setHp(nextHp);
        setPhase('victory');
        addLog('У одного из вас осталось 1 Здоровье — бой окончен.');
        audio.beep();
        return;
      }

      const playerCheck = playerRoll.total + muscles + weaponRating;
      const playerHit = playerCheck >= defense;
      let nextEnemyHp = enemyHp;
      if (playerHit) nextEnemyHp = Math.max(0, enemyHp - 1);
      addLog(
        `Ваша атака: ${playerRoll.total} + ${muscles} + оружие ${weaponRating} = ${playerCheck} против Защиты ${defense} — ${playerHit ? 'попадание' : 'промах'}.`,
      );
      if (playerHit) addLog('Противник теряет 1 Здоровье.');
      setHp(nextHp);
      setEnemyHp(nextEnemyHp);
      setRoll(null);
      if (nextEnemyHp <= 0) {
        setPhase('victory');
        audio.beep();
      } else if (combat.stopAtOne && nextEnemyHp <= 1) {
        setPhase('victory');
        addLog('У противника осталось 1 Здоровье — бой окончен.');
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
    <div className="combat-panel contest-panel" aria-label={`Бой: ${enemy.name}`}>
      <div className="combat-status-line">
        <span>РАУНД: {round}.</span>
        <span>Противник — {enemy.name.toUpperCase()} {enemyHp}/{enemyMax}.</span>
        <span>Персонаж — Здоровье {hp}/{hpMax}.</span>
        <span>Атака {enemy.attack} · Защита {defense}.</span>
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
            {diceFaces.slice(0, 2).map((face, index) => <DieFace value={face} key={`e${index}`} />)}
          </span>
          <span>ВЫ</span>
          <span className="combat-dice-faces">
            {diceFaces.slice(2).map((face, index) => <DieFace value={face} key={`p${index}`} />)}
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
                {index + 1}. {option.title.toUpperCase()} · рейтинг {option.rating >= 0 ? '+' : ''}{option.rating}
              </button>
            ))}
            <button
              type="button"
              className={`choice${selectedWeapon === 'fists' ? ' selected combat-selected' : ''}`}
              onClick={() => setSelectedWeapon('fists')}
            >
              {weaponOptions.length + 1}. КУЛАКИ · рейтинг +0
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
          <div className="combat-note">ОРУЖИЕ: {weaponTitle} · рейтинг +{weaponRating} · БРОНЯ {armor}</div>
          <div className="choices combat-choices">
            <button type="button" className="choice selected" onClick={attack}>
              1. АТАКОВАТЬ
            </button>
          </div>
        </>
      )}

      {phase === 'victory' && (
        <>
          <div className="combat-note combat-victory-note">ПОБЕДА. Здоровье {hp} / {hpMax}.</div>
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
            <button type="button" className="choice selected" onClick={onRestart}>
              1. НАЧАТЬ ЗАНОВО
            </button>
            <button type="button" className="choice" onClick={onExit}>
              2. В БИБЛИОТЕКУ
            </button>
          </div>
        </>
      )}
    </div>
  );
}
