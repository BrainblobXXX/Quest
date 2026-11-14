'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { availableChoices, inventoryLine, roll as rollDice, sceneOf } from '@/lib/engine';
import { audio } from '@/lib/audio';
import InteractionHost from '@/components/screens/InteractionHost';
import ShopPanel from '@/components/screens/ShopPanel';
import SceneItemChanges from '@/components/screens/SceneItemChanges';
import SceneProp from '@/components/screens/SceneProp';
import EffectChips from '@/components/screens/EffectChips';
import { itemIconUrl } from '@/lib/itemIcons';
import { combatMode } from '@/lib/combat';
import { instructionFor } from '@/lib/instructions';
import StoryActivity, { type StoryRollView } from '@/components/mechanics/StoryActivity';
import AttritionPanel from '@/components/mechanics/AttritionPanel';
import { findChoiceByLetter, resolveStory } from '@/lib/mechanics/story';
import { preloadSceneNeighborhood } from '@/lib/scenePreload';
import type { Choice, Game, GameState, ParseProblem } from '@/lib/types';

const LETTER = /\[([А-ЯЁA-Z])\]/g;

function remark(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'замечание';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'замечания';
  return 'замечаний';
}

function assetUrl(game: Game, path: string): string {
  if (/^(https?:)?\//.test(path)) return path;
  return `/api/games/${game.id}/${path}`;
}

function InventoryPanel({ game, state }: { game: Game; state: GameState }) {
  const items = Object.entries(state.inventory).map(([id, n]) => ({
    id,
    n,
    title: game.items?.[id]?.title ?? id,
  }));

  return (
    <div className="inventory-panel" id="inventory-panel">
      {items.length === 0 && <div className="inventory-empty">ПУСТО</div>}
      {items.map((it) => {
        const icon = itemIconUrl(game, it.id);
        return (
          <div key={it.id} className="inventory-row">
            <span className="inventory-name">
              {icon ? (
                <img className="inventory-icon" src={icon} alt="" draggable={false} />
              ) : (
                <span className="inventory-icon inventory-placeholder" aria-hidden="true" />
              )}
              {it.title.toUpperCase()}
            </span>
            <span className="count">{it.n}</span>
          </div>
        );
      })}
    </div>
  );
}

type StatView = { id: string; title: string; value: number };

function StatsPanel({ stats }: { stats: StatView[] }) {
  return (
    <div className="inventory-panel stats-panel" id="stats-panel">
      {stats.map((stat) => (
        <div key={stat.id} className="inventory-row">
          <span>{stat.title.toUpperCase()}</span>
          <span className={`stat-value${stat.value <= 0 ? ' is-low' : ''}`}>{stat.value}</span>
        </div>
      ))}
    </div>
  );
}

function isVitalStat(id: string, def: { vital?: boolean }): boolean {
  return def.vital === true || ['hp', 'health', 'life', 'stamina'].includes(id);
}

function VitalHud({ stats, game, effects }: { stats: StatView[]; game: Game; effects?: GameState['effects'] }) {
  if (stats.length === 0 && !effects?.length) return null;
  return (
    <div
      className="vital-hud"
      aria-label={`Жизненные показатели: ${stats.map((stat) => `${stat.title} ${stat.value}`).join(', ')}`}
    >
      <EffectChips game={game} effects={effects} />
      {stats.map((stat) => (
        <span
          key={stat.id}
          className={`vital-chip${stat.value <= 0 ? ' is-low' : ''}`}
          title={`${stat.title}: ${stat.value}`}
          aria-label={`${stat.title}: ${stat.value}`}
        >
          <svg className="vital-heart" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
          </svg>
          <span className="vital-value">{stat.value}</span>
        </span>
      ))}
    </div>
  );
}

function HeaderIcon({ kind }: { kind: 'inventory' | 'stats' | 'rules' | 'codes' }) {
  return (
    <svg
      className="btn-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'inventory' && (
        <>
          <path d="M5.5 8.5h13l-1 11h-11l-1-11Z" />
          <path d="M9 8.5V6a3 3 0 0 1 6 0v2.5" />
        </>
      )}
      {kind === 'stats' && (
        <>
          <path d="M5 20v-8" />
          <path d="M12 20V5" />
          <path d="M19 20v-6" />
        </>
      )}
      {kind === 'codes' && (
        <>
          <path d="M7 4h10v16H7z" />
          <path d="M10 8h4M10 12h4M10 16h2" />
        </>
      )}
      {kind === 'rules' && (
        <>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
          <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
          <path d="M8 7h8M8 10h5" />
        </>
      )}
    </svg>
  );
}

export default function GameScreen({
  game,
  state,
  onChoose,
  onAdvance,
  onRestart,
  onCombatWin,
  onCombatOutcome,
  onAttrition,
  onCombatExit,
  onBack,
  onCode,
  onGamble,
  onCheck,
  onBuy,
  problems = [],
}: {
  game: Game;
  state: GameState;
  onChoose: (choice: Choice) => void;
  onAdvance: (value?: number) => void;
  onRestart: () => void;
  onCombatWin: (result: GameState) => void;
  onCombatOutcome?: (result: GameState, target: string) => void;
  onAttrition: (damage: number) => void;
  onCombatExit: () => void;
  onBack: () => void;
  onCode: (id: string) => boolean;
  onGamble: (delta: number) => void;
  onCheck: (success: boolean) => void;
  onBuy: (itemId: string, price: number) => void;
  problems?: ParseProblem[];
}) {
  const scene = sceneOf(game, state);
  const combat = game.combat?.[scene.key];
  const check = game.checks?.[scene.key];
  const gamble = game.gambles?.[scene.key];
  const showGamble = Boolean(gamble && !(state.gamblesDone ?? []).includes(scene.key));
  const hasCombat = Boolean(combat?.enemy.count && combat.enemy.count > 0);
  const mode = combatMode(game, combat);
  const [combatStarted, setCombatStarted] = useState(false);
  const [liveStamina, setLiveStamina] = useState<number | null>(null);
  const combatActive = hasCombat && combatStarted;
  const encounterCount = combat?.encounter ? state.encounters?.[combat.encounter]?.count : undefined;
  const emptyCombat = Boolean(hasCombat && encounterCount !== undefined && encounterCount <= 0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const instruction = instructionFor(game);
  const [invOpen, setInvOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [imageFit, setImageFit] = useState<{ src: string; wide: boolean } | null>(null);
  const [loadedImage, setLoadedImage] = useState<string | null>(null);
  const [selection, setSelection] = useState({ scene: scene.key, index: -1 });
  const [pressed, setPressed] = useState<string | null>(null);
  const selected = selection.scene === scene.key ? selection.index : -1;
  const scrollRef = useRef<HTMLDivElement>(null);
  const combatAnchorRef = useRef<HTMLDivElement>(null);
  const scrollKey = `${game.id}:${state.scene}`;

  useEffect(() => {
    setCombatStarted(false);
    setLiveStamina(null);
  }, [scene.key]);
  const choices = availableChoices(game, state);

  // Пока игрок читает и выбирает, прогреваем текущую и соседние сцены.
  useEffect(() => {
    preloadSceneNeighborhood(game, state, scene, choices);
  }, [game, scene.key, state.scene, choices]);
  const attrition = scene.attrition;
  const liveVitalId = Object.entries(game.stats ?? {}).find(([id, def]) => isVitalStat(id, def))?.[0];
  const allStats = Object.entries(game.stats ?? {})
    .filter(([, def]) => def.show !== false)
    .map(([id, def]) => ({
      id,
      title: def.title || id,
      value: liveStamina !== null && id === liveVitalId ? liveStamina : state.stats[id] ?? def.initial ?? 0,
      vital: isVitalStat(id, def),
    }));
  const vitalStats = allStats.filter((stat) => stat.vital);
  const stats = allStats.filter((stat) => !stat.vital);
  const statsSummary = stats.map((stat) => `${stat.title.toUpperCase()} ${stat.value}`).join(' · ');
  // меню показываем только если книга вообще умеет работать с предметами/статами
  const hasStats = stats.length > 0;
  const hasItems =
    Object.keys(game.items ?? {}).length > 0 ||
    Object.keys(game.startItems ?? {}).length > 0 ||
    Object.keys(state.inventory).length > 0;
  // Компактный HUD: не больше двух видимых статусов и/или объявленных предметов.
  const compactStats = !combatActive && stats.length > 0 && stats.length <= 2;
  const compactItems = !combatActive && Object.keys(game.items ?? {}).length > 0 && Object.keys(game.items ?? {}).length <= 2;
  const compactInventory = compactItems
    ? Object.entries(game.items ?? {})
        .map(([id, item]) => ({ id, title: item.title, count: state.inventory[id] ?? 0 }))
        .filter((item) => item.count > 0)
    : [];
  const toggleInventory = () => {
    setInvOpen((value) => !value);
    setStatsOpen(false);
  };
  const toggleStats = () => {
    setStatsOpen((value) => !value);
    setInvOpen(false);
  };
  const chooseByLetter = (letter: string) => findChoiceByLetter(choices, letter);

  /** простая Markdown-эмфаза: *курсив* и **жирный** */
  const formatEmphasis = (text: string, keyPrefix: string): ReactNode[] => {
    const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
    const out: ReactNode[] = [];
    let last = 0;
    let index = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      if (match.index > last) out.push(...formatEmphasis(text.slice(last, match.index), `p${index}`));
      const content = match[2] ?? match[3] ?? '';
      out.push(
        match[2] ? (
          <strong key={`${keyPrefix}-b${index}`}>{content}</strong>
        ) : (
          <em key={`${keyPrefix}-i${index}`}>{content}</em>
        ),
      );
      index += 1;
      last = re.lastIndex;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  };

  /** отсылки [А] остаются в прозе и работают как кнопки */
  const refNodes = (text: string): ReactNode[] => {
    const re = new RegExp(LETTER.source, 'g');
    const out: ReactNode[] = [];
    let last = 0;
    let index = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      if (match.index > last) out.push(...formatEmphasis(text.slice(last, match.index), `p${index}`));
      const letter = match[1];
      const choice = chooseByLetter(letter);
      out.push(
        choice ? (
          <button
            key={`ref${index}`}
            type="button"
            className={`choice-ref${pressed === `${scene.key}:r${index}` ? ' pressed' : ''}`}
            data-variant={letter}
            onClick={() => onChoose(choice)}
            title={`Вариант ${letter}`}
            {...pressHandlers(`r${index}`)}
          >
            [{letter}]
          </button>
        ) : (
          <span key={`ref${index}`} className="choice-ref muted" data-variant={letter}>
            [{letter}]
          </span>
        ),
      );
      index += 1;
      last = re.lastIndex;
    }
    out.push(...formatEmphasis(text.slice(last), 'tail'));
    return out;
  };
  const story = resolveStory(game, state, choices);
  const { ending, canReturn, hasNext, dice, isCoin } = story;
  const [rollView, setRollView] = useState<StoryRollView | null>(null);
  const [tick, setTick] = useState(0);
  const rollTimers = useRef<number[]>([]);

  const startRoll = () => {
    if (!dice || rollView) return;
    const value = rollDice(dice.roll);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spinMs = reduced ? 250 : 1300;
    // финальный результат держим на 0,5 с дольше: 1,4 с вместо 0,9 с
    const resultMs = reduced ? 500 : 1400;
    setRollView({ kind: isCoin ? 'coin' : 'dice', value, phase: 'spin' });
    audio.click();
    rollTimers.current.push(
      window.setTimeout(() => setRollView((r) => (r ? { ...r, phase: 'result' } : r)), spinMs),
      window.setTimeout(() => {
        setRollView(null);
        onAdvance(value);
      }, spinMs + resultMs),
    );
  };

  /** исходы броска монеты: подсвечиваем фразы с «орлом» и «решкой» и вешаем ярлык */
  const coinText = (text: string): ReactNode[] => {
    const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
    return sentences.map((sentence, index) => {
      const hit = [
        { re: /ор[её]?л/i, letter: 'О', label: 'Орёл' },
        { re: /решк/i, letter: 'Р', label: 'Решка' },
      ].find((outcome) => outcome.re.test(sentence));
      const inner = refNodes(sentence);
      if (!hit) return <Fragment key={`c${index}`}>{inner}</Fragment>;
      return (
        <mark key={`c${index}`} data-variant={hit.letter} className="variant-phrase">
          {inner}
          <span className="outcome-chip">[{hit.label}]</span>
        </mark>
      );
    });
  };

  /** текст сцены с подсветкой фраз вариантов: цвет берётся из тега {А}…{/А} */
  const sceneText = (): ReactNode[] => {
    if (!scene.rich?.length && isCoin) return coinText(scene.text);
    const segments = scene.rich?.length ? scene.rich : [{ text: scene.text }];
    return segments.map((segment, index) => {
      if (segment.letter && !chooseByLetter(segment.letter)) return null;
      const inner = refNodes(segment.text);
      return segment.letter ? (
        <mark key={`v${index}`} data-variant={segment.letter} className="variant-phrase">
          {inner}
        </mark>
      ) : (
        <Fragment key={`t${index}`}>{inner}</Fragment>
      );
    });
  };

  useEffect(() => {
    setInvOpen(false);
    setStatsOpen(false);
    setZoom(false);
    setRulesOpen(false);
    setCodesOpen(false);
    setCodeMessage(null);
  }, [scene.key]);

  // лайтбокс: Esc и клик по фону закрывают, и Esc не уводит в библиотеку
  useEffect(() => {
    if (!zoom) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setZoom(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [zoom]);

  useEffect(() => {
    if (!rulesOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setRulesOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [rulesOpen]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = window.sessionStorage.getItem(`scroll:${scrollKey}`);
    el.scrollTop = saved ? Number(saved) : 0;
  }, [scrollKey]);

  // После нажатия «НАЧАТЬ БОЙ» уводим сцену к боевому блоку:
  // иначе на мобильном палец попадает в лог и скроллит его, а не страницу.
  useEffect(() => {
    if (!combatStarted) return;
    const scroll = scrollRef.current;
    const anchor = combatAnchorRef.current;
    if (!scroll || !anchor) return;
    const frame = window.requestAnimationFrame(() => {
      const top =
        anchor.getBoundingClientRect().top -
        scroll.getBoundingClientRect().top +
        scroll.scrollTop -
        8;
      scroll.scrollTop = Math.max(0, top);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [combatStarted]);

  const saveScroll = (e: React.UIEvent<HTMLDivElement>) => {
    window.sessionStorage.setItem(`scroll:${scrollKey}`, String(e.currentTarget.scrollTop));
  };

  useEffect(() => {
    setRollView(null);
    setSelection({ scene: scene.key, index: -1 });
    setPressed(null);
    for (const id of rollTimers.current) window.clearTimeout(id);
    rollTimers.current = [];
  }, [scene.key]);

  // страховка от «залипшей» подсветки, если pointerup случился вне кнопки
  useEffect(() => {
    if (!pressed) return;
    const clear = () => setPressed(null);
    window.addEventListener('pointerup', clear, true);
    window.addEventListener('pointercancel', clear, true);
    return () => {
      window.removeEventListener('pointerup', clear, true);
      window.removeEventListener('pointercancel', clear, true);
    };
  }, [pressed]);

  useEffect(() => {
    if (!rollView || rollView.phase !== 'spin') return;
    const id = window.setInterval(() => setTick((t) => t + 1), 90);
    return () => window.clearInterval(id);
  }, [rollView?.phase]);

  useEffect(() => () => {
    for (const id of rollTimers.current) window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (rulesOpen) return;
      if (hasCombat && combatStarted) return;
      // PageUp/PageDown листают текст сцены, как колесо мыши
      if (e.key === 'PageDown' || e.key === 'PageUp') {
        const el = scrollRef.current;
        if (!el) return;
        e.preventDefault();
        const page = el.clientHeight * 0.9;
        el.scrollBy({ top: e.key === 'PageDown' ? page : -page, behavior: 'smooth' });
        return;
      }

      if (hasCombat && !combatStarted) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          return;
        }
        if (e.key === 'Enter' || e.key === ' ' || e.key.toUpperCase() === 'A') {
          const active = document.activeElement;
          const onButton = active instanceof HTMLElement && active.tagName === 'BUTTON';
          if (onButton && (e.key === 'Enter' || e.key === ' ')) return;
          e.preventDefault();
          audio.click();
          setCombatStarted(true);
        }
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // стрелки — только для выбора вариантов, не для прокрутки рассказа
        e.preventDefault();
        if (rollView) return;
        const items = story.itemCount;
        if (!items) return;
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setSelection((prev) => {
          const current = prev.scene === scene.key ? prev.index : -1;
          const next = current < 0 ? (step === 1 ? 0 : items - 1) : (current + step + items) % items;
          return { scene: scene.key, index: next };
        });
        return;
      }

      if (e.key === 'Escape' || rollView) return;

      // сколько пунктов можно выбрать: варианты, «далее», бросок или рестарт
      const items = story.itemCount;
      if (!items) return;

      // на кнопке в фокусе Enter должен сработать как обычный клик
      const active = document.activeElement;
      const onControl = active instanceof HTMLElement && /^(BUTTON|INPUT|TEXTAREA)$/.test(active.tagName);
      if (onControl) return;

      if (ending) {
        if (e.key === '1') {
          e.preventDefault();
          if (canReturn) onBack();
          else onRestart();
        } else if (e.key === '2' && canReturn) {
          e.preventDefault();
          onRestart();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (canReturn && selected === 1) onRestart();
          else if (canReturn) onBack();
          else onRestart();
        }
        return;
      }

      if (/^[1-9]$/.test(e.key)) {
        if (dice) {
          if (e.key === '1') startRoll();
          return;
        }
        if (hasNext && choices.length === 0) {
          if (e.key === '1') {
            e.preventDefault();
            onAdvance();
          }
          return;
        }
        const choice = choices[Number(e.key) - 1];
        if (choice) onChoose(choice);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (dice) startRoll();
        else if (choices.length > 0 && selected >= 0) onChoose(choices[Math.min(selected, choices.length - 1)]);
        else if (hasNext) onAdvance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choices, ending, hasCombat, combatStarted, hasNext, onChoose, onAdvance, onRestart, dice, rollView, rulesOpen, scene.key, selected, startRoll]);

  /** подсветка на время нажатия: подтверждение — только по отпусканию */
  const pressHandlers = (key: string) => {
    const id = `${scene.key}:${key}`;
    return {
      onPointerDown: () => setPressed(id),
      onPointerUp: () => setPressed(null),
      onPointerLeave: () => setPressed(null),
      onPointerCancel: () => setPressed(null),
      onLostPointerCapture: () => setPressed(null),
    };
  };


  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="title-line">
        <button
          type="button"
          className={`rules-btn${rulesOpen ? ' on' : ''}`}
          onClick={() => setRulesOpen((value) => !value)}
          aria-expanded={rulesOpen}
          aria-controls="rules-panel"
          aria-label="Открыть инструкцию к книге"
          title="Инструкция"
        >
          <HeaderIcon kind="rules" />
        </button>
        <span className="title-text">{scene.title.toUpperCase()}</span>
        <VitalHud stats={vitalStats} game={game} effects={state.effects} />
        {(compactStats || compactItems) && (
          <div
            className="hud-inline"
            aria-label={`Текущие параметры: ${[
              ...stats.map((stat) => `${stat.title} ${stat.value}`),
              ...compactInventory.map((item) => `${item.title} ${item.count}`),
            ].join(', ')}`}
          >
            {compactStats && stats.map((stat) => (
              <span className="hud-chip hud-stat" key={`s-${stat.id}`}>
                <span className="hud-label">{stat.title.toUpperCase()}</span>
                <span className={`hud-value${stat.value <= 0 ? ' is-low' : ''}`}>{stat.value}</span>
              </span>
            ))}
            {compactItems && (compactInventory.length === 0 ? (
              <span className="hud-chip hud-empty">
                <span className="hud-label">ИНВЕНТАРЬ</span>
                <span className="hud-value">ПУСТО</span>
              </span>
            ) : compactInventory.map((item) => (
              <span className="hud-chip hud-item" key={`i-${item.id}`}>
                <span className="hud-label">{item.title.toUpperCase()}</span>
                <span className="hud-value">{item.count}</span>
              </span>
            )))}
          </div>
        )}
        {!combatActive && game.codes && Object.keys(game.codes).length > 0 && (
          <button
            type="button"
            className={`codes-toggle${codesOpen ? ' is-open' : ''}`}
            onClick={() => {
              setCodesOpen((value) => !value);
              setStatsOpen(false);
              setInvOpen(false);
              setCodeMessage(null);
              audio.click();
            }}
            aria-expanded={codesOpen}
            aria-label="Известные коды"
            title="Коды"
          >
            <HeaderIcon kind="codes" />
          </button>
        )}
        {!combatActive && hasStats && !compactStats && (
          <button
            type="button"
            className={`stats-toggle${statsOpen ? ' is-open' : ''}`}
            onClick={toggleStats}
            aria-expanded={statsOpen}
            aria-controls="stats-panel"
            aria-label={`Характеристики: ${statsSummary}`}
            title="Характеристики"
          >
            <span className="stats-inline">{statsSummary}</span>
            <HeaderIcon kind="stats" />
          </button>
        )}
        {!combatActive && hasItems && !compactItems && (
          <button
            type="button"
            className={`inventory-toggle${invOpen ? ' is-open' : ''}`}
            onClick={toggleInventory}
            aria-expanded={invOpen}
            aria-controls="inventory-panel"
            aria-label={`Инвентарь: ${inventoryLine(game, state) || 'пусто'}`}
            title="Инвентарь"
          >
            <span className="inv-inline inv-full">ИНВЕНТАРЬ</span>
            <span className="inv-inline inv-short" aria-hidden="true">ИНВ</span>
          </button>
        )}
      </div>

      {!combatActive && hasStats && !compactStats && statsOpen && <StatsPanel stats={stats} />}
      {!combatActive && hasItems && !compactItems && invOpen && <InventoryPanel game={game} state={state} />}
      {!combatActive && codesOpen && game.codes && (
        <div className="codes-panel" aria-label="Известные коды">
          <div className="codes-title">ИЗВЕСТНЫЕ КОДЫ</div>
          {codeMessage && <div className="codes-message">{codeMessage}</div>}
          {(state.knownCodes ?? []).length === 0 ? (
            <div className="codes-empty">КОДОВ НЕТ</div>
          ) : (
            <div className="choices codes-choices">
              {(state.knownCodes ?? []).map((id, index) => {
                const code = game.codes?.[id];
                if (!code) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className="choice"
                    onClick={() => {
                      const ok = onCode(id);
                      if (ok) {
                        setCodesOpen(false);
                        setCodeMessage(null);
                      } else {
                        setCodeMessage(`«${code.title}»: здесь это не работает.`);
                      }
                    }}
                  >
                    {index + 1}. {code.title.toUpperCase()} · {code.offset > 0 ? `+${code.offset}` : code.offset}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {problems.length > 0 && (
        <details className="parse-report">
          <summary>
            РАЗБОР: {problems.length} {remark(problems.length)}
          </summary>
          <ul className="parse-problems">
            {problems.slice(0, 50).map((problem, index) => (
              <li key={`${problem.code}-${index}`} data-level={problem.level}>
                <span className="parse-code">{problem.code}</span>
                {problem.scene ? ` [${problem.scene}]` : ''} {problem.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="scene-scroll" ref={scrollRef} onScroll={saveScroll}>
        {scene.image && (
          <figure
            key={scene.image}
            className={`scene-image${imageFit?.src === scene.image && imageFit.wide ? ' wide' : ''}${loadedImage === scene.image ? ' is-ready' : ''}`}
          >
            <button
              type="button"
              className="scene-image-zoom"
              onClick={() => setZoom(true)}
              aria-label="Рассмотреть иллюстрацию"
              title="Рассмотреть иллюстрацию"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl(game, scene.image)}
                alt=""
                onLoad={(event) => {
                  const img = event.currentTarget;
                  const wide = img.naturalWidth / Math.max(1, img.naturalHeight) > 1.5;
                  // привязываем признак к адресу картинки: если следующая сцена
                  // показывает тот же файл, он остаётся широким без повторной загрузки
                  setImageFit({ src: scene.image ?? '', wide });
                  setLoadedImage(scene.image ?? null);
                }}
              />
            </button>
          </figure>
        )}
        <div className="scene-text">{sceneText()}</div>
        {scene.prop && <SceneProp src={assetUrl(game, scene.prop.image)} alt={scene.prop.alt} />}
        <SceneItemChanges game={game} state={state} />
        {scene.counter && game.stats?.[scene.counter.stat] && (
          <div className="creation-counter">
            {(scene.counter.label ?? 'ОСТАЛОСЬ').toUpperCase()}: {Number(state.stats[scene.counter.stat] ?? 0)}
            {' / '}
            {Number(scene.counter.max ?? game.stats[scene.counter.stat]?.initial ?? 0)}
          </div>
        )}
        {attrition && (
          <AttritionPanel
            key={`attrition:${scene.key}`}
            game={game}
            state={state}
            attrition={attrition}
            onResolve={onAttrition}
            onChoose={onChoose}
          />
        )}
        <div ref={combatAnchorRef}>
          <InteractionHost
            key={`interaction:${scene.key}`}
          game={game}
          state={state}
          check={!hasCombat && !showGamble ? check : null}
          gamble={!hasCombat && showGamble ? gamble : null}
          combat={combatActive ? combat : null}
          combatMode={mode}
          onGamble={onGamble}
          onCheck={onCheck}
          onCombatWin={onCombatWin}
          onCombatOutcome={onCombatOutcome}
          onCombatExit={onCombatExit}
          onRestart={onRestart}
            onStaminaChange={setLiveStamina}
          />
        </div>
      </div>

      {emptyCombat && combat && (
        <div className="choices combat-start-choices">
          <button
            type="button"
            className="choice selected"
            onClick={() => {
              const encounters = state.encounters ? { ...state.encounters } : undefined;
              if (combat.encounter && encounters) delete encounters[combat.encounter];
              const result = { ...state, ...(encounters ? { encounters } : {}) };
              if (onCombatOutcome) onCombatOutcome(result, combat.empty ?? combat.win);
              else onCombatWin(result);
            }}
          >
            1. ЗОМБИ УНИЧТОЖЕНЫ. ПРОДОЛЖИТЬ
          </button>
        </div>
      )}

      {hasCombat && combat && !combatStarted && !emptyCombat && (
        <div className="choices combat-start-choices">
          <button
            type="button"
            className="choice selected"
            onClick={() => {
              audio.click();
              setCombatStarted(true);
            }}
          >
            A. НАЧАТЬ БОЙ
          </button>
        </div>
      )}

      {!hasCombat && scene.shop && scene.shop.length > 0 && (
        <ShopPanel
          game={game}
          state={state}
          offers={scene.shop}
          onBuy={onBuy}
          title={scene.shopTitle}
          currency={scene.shopCurrency}
          currencyItem={scene.shopCurrencyItem}
        />
      )}

      {!hasCombat && !attrition && (
        <StoryActivity
          state={state}
          story={story}
          selected={selected}
          pressed={pressed}
          rollView={rollView}
          tick={tick}
          blockedByInteraction={Boolean(check || showGamble)}
          pressHandlers={pressHandlers}
          onChoose={onChoose}
          onAdvance={onAdvance}
          onRestart={onRestart}
          onBack={onBack}
          onRoll={startRoll}
        />
      )}

      {rulesOpen && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="rules-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Инструкция к книге"
            onClick={() => setRulesOpen(false)}
          >
            <div className="rules-dialog" onClick={(event) => event.stopPropagation()}>
              <div className="rules-head">
                <span>{instruction.title.toUpperCase()}</span>
                <button
                  type="button"
                  className="rules-close"
                  onClick={() => setRulesOpen(false)}
                  aria-label="Закрыть инструкцию"
                >
                  ЗАКРЫТЬ
                </button>
              </div>
              <div className="rules-body">{instruction.text}</div>
            </div>
          </div>,
          document.body,
        )}

      {zoom &&
        scene.image &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={scene.title}
            onClick={() => setZoom(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl(game, scene.image)} alt={scene.title} />
            <div className="lightbox-caption">{scene.title} · нажмите или Esc, чтобы закрыть</div>
          </div>,
          document.body,
        )}

    </div>
  );
}
