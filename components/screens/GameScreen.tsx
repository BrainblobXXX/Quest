'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { availableChoices, inventoryLine, isEnding, roll as rollDice, sceneOf } from '@/lib/engine';
import { audio } from '@/lib/audio';
import CombatPanel from '@/components/screens/CombatPanel';
import ShopPanel from '@/components/screens/ShopPanel';
import type { Choice, Game, GameState, ParseProblem } from '@/lib/types';

/** подсветка исходной разметки story.md: теги вариантов, отсылки, маркеры */
function rawMarkup(raw: string): ReactNode[] {
  const re = /\{([АБВГД])\}([\s\S]*?)\{\/\1\}|\[([АБВГД])\]/g;
  const out: ReactNode[] = [];
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    if (match.index > last) out.push(raw.slice(last, match.index));
    if (match[1]) {
      out.push(
        <span key={`o${index}`} className="raw-tag">{`{${match[1]}}`}</span>,
        <mark key={`m${index}`} data-variant={match[1]}>{match[2]}</mark>,
        <span key={`c${index}`} className="raw-tag">{`{/${match[1]}}`}</span>,
      );
    } else {
      out.push(<span key={`r${index}`} className="raw-ref">{`[${match[3]}]`}</span>);
    }
    index += 1;
    last = re.lastIndex;
  }
  out.push(raw.slice(last));
  return out;
}

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
      {items.map((it) => (
        <div key={it.id} className="inventory-row">
          <span>{it.title.toUpperCase()}</span>
          <span className="count">{it.n}</span>
        </div>
      ))}
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

function HeaderIcon({ kind }: { kind: 'inventory' | 'stats' | 'raw' }) {
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
      {kind === 'raw' && (
        <>
          <path d="m9 7-5 5 5 5" />
          <path d="m15 7 5 5-5 5" />
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
  onCombatExit,
  onBuy,
  problems = [],
}: {
  game: Game;
  state: GameState;
  onChoose: (choice: Choice) => void;
  onAdvance: (value?: number) => void;
  onRestart: () => void;
  onCombatWin: (result: GameState) => void;
  onCombatExit: () => void;
  onBuy: (itemId: string, price: number) => void;
  problems?: ParseProblem[];
}) {
  const scene = sceneOf(game, state);
  const combat = game.combat?.[scene.key];
  const hasCombat = Boolean(combat?.enemy.count && combat.enemy.count > 0);
  const [combatStarted, setCombatStarted] = useState(false);
  const combatActive = hasCombat && combatStarted;
  const [invOpen, setInvOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [imageFit, setImageFit] = useState<{ src: string; wide: boolean } | null>(null);
  const [selection, setSelection] = useState({ scene: scene.key, index: -1 });
  const [pressed, setPressed] = useState<string | null>(null);
  const selected = selection.scene === scene.key ? selection.index : -1;
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollKey = `${game.id}:${state.scene}`;

  useEffect(() => {
    setCombatStarted(false);
  }, [scene.key]);
  const choices = availableChoices(game, state);
  const stats = Object.entries(game.stats ?? {}).map(([id, def]) => ({
    id,
    title: def.title || id,
    value: state.stats[id] ?? def.initial ?? 0,
  }));
  const statsSummary = stats.map((stat) => `${stat.title.toUpperCase()} ${stat.value}`).join(' · ');
  // меню показываем только если книга вообще умеет работать с предметами/статами
  const hasStats = stats.length > 0;
  const hasItems =
    Object.keys(game.items ?? {}).length > 0 ||
    Object.keys(game.startItems ?? {}).length > 0 ||
    Object.keys(state.inventory).length > 0;
  const toggleInventory = () => {
    setInvOpen((value) => !value);
    setStatsOpen(false);
  };
  const toggleStats = () => {
    setStatsOpen((value) => !value);
    setInvOpen(false);
  };
  const chooseByLetter = (letter: string) => choices.find((choice) => choice.letter === letter);

  /** отсылки [А] остаются в прозе и работают как кнопки */
  const refNodes = (text: string): ReactNode[] => {
    const re = new RegExp(LETTER.source, 'g');
    const out: ReactNode[] = [];
    let last = 0;
    let index = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      if (match.index > last) out.push(text.slice(last, match.index));
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
    out.push(text.slice(last));
    return out;
  };
  const ending = isEnding(game, state);
  const hasNext = Boolean(scene.next);
  const dice = !ending && scene.next && typeof scene.next === 'object' ? scene.next : null;
  const isCoin = dice ? /d2$/i.test(dice.roll.trim()) : false;
  const [rollView, setRollView] = useState<{ kind: 'coin' | 'dice'; value: number; phase: 'spin' | 'result' } | null>(null);
  const [tick, setTick] = useState(0);
  const rollTimers = useRef<number[]>([]);

  const startRoll = () => {
    if (!dice || rollView) return;
    const value = rollDice(dice.roll);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spinMs = reduced ? 250 : 1300;
    const resultMs = reduced ? 500 : 900;
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
    setRawOpen(false);
    setZoom(false);
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
    const el = scrollRef.current;
    if (!el) return;
    const saved = window.sessionStorage.getItem(`scroll:${scrollKey}`);
    el.scrollTop = saved ? Number(saved) : 0;
  }, [scrollKey]);

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
        if (e.key === 'Enter' || e.key === ' ' || e.key === '1') {
          const active = document.activeElement;
          const onButton = active instanceof HTMLElement && active.tagName === 'BUTTON';
          if (onButton && (e.key === 'Enter' || e.key === ' ')) return;
          e.preventDefault();
          audio.click();
          setCombatStarted(true);
        }
        return;
      }

      if (e.key === 'Escape' || rollView) return;

      // сколько пунктов можно выбрать: варианты, «далее», бросок или рестарт
      const items = ending ? 1 : choices.length > 0 ? choices.length : dice || hasNext ? 1 : 0;
      if (!items) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setSelection((prev) => {
          const current = prev.scene === scene.key ? prev.index : -1;
          const next = current < 0 ? (step === 1 ? 0 : items - 1) : (current + step + items) % items;
          return { scene: scene.key, index: next };
        });
        return;
      }

      // на кнопке в фокусе Enter должен сработать как обычный клик
      const active = document.activeElement;
      const onControl = active instanceof HTMLElement && /^(BUTTON|INPUT|TEXTAREA)$/.test(active.tagName);
      if (onControl) return;

      if (ending) {
        if (e.key === 'Enter' || e.key === '1') {
          e.preventDefault();
          onRestart();
        }
        return;
      }

      if (/^[1-9]$/.test(e.key)) {
        if (dice) {
          if (e.key === '1') startRoll();
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
  }, [choices, ending, hasCombat, combatStarted, hasNext, onChoose, onAdvance, onRestart, dice, rollView, scene.key, selected, startRoll]);

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
        <span>{scene.title.toUpperCase()}</span>
        <button
          type="button"
          className={`raw-btn${rawOpen ? ' on' : ''}`}
          onClick={() => setRawOpen((v) => !v)}
          aria-pressed={rawOpen}
          aria-label="Показать исходную разметку story.md"
          title="Показать исходную разметку story.md"
        >
          <span className="btn-text">MD</span>
          <HeaderIcon kind="raw" />
        </button>
        {!combatActive && hasStats && (
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
        {!combatActive && hasItems && (
          <button
            type="button"
            className={`inventory-toggle${invOpen ? ' is-open' : ''}`}
            onClick={toggleInventory}
            aria-expanded={invOpen}
            aria-controls="inventory-panel"
            aria-label={`Инвентарь: ${inventoryLine(game, state) || 'пусто'}`}
            title="Инвентарь"
          >
            <span className="inv-inline">{inventoryLine(game, state) || 'ПУСТО'}</span>
            <HeaderIcon kind="inventory" />
          </button>
        )}
      </div>

      {!combatActive && hasStats && statsOpen && <StatsPanel stats={stats} />}
      {!combatActive && hasItems && invOpen && <InventoryPanel game={game} state={state} />}

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
            className={`scene-image${imageFit?.src === scene.image && imageFit.wide ? ' wide' : ''}`}
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
                }}
              />
            </button>
          </figure>
        )}
        {rawOpen && scene.raw ? (
          <div className="scene-raw">{rawMarkup(scene.raw)}</div>
        ) : (
          <div className="scene-text">{sceneText()}</div>
        )}
        {combatActive && combat && (
          <CombatPanel
            key={scene.key}
            game={game}
            state={state}
            combat={combat}
            onWin={onCombatWin}
            onExit={onCombatExit}
            onRestart={onRestart}
          />
        )}
      </div>

      {hasCombat && combat && !combatStarted && (
        <div className="choices combat-start-choices">
          <button
            type="button"
            className="choice selected"
            onClick={() => {
              audio.click();
              setCombatStarted(true);
            }}
          >
            1. НАЧАТЬ БОЙ
          </button>
        </div>
      )}

      {!hasCombat && scene.shop && scene.shop.length > 0 && (
        <ShopPanel game={game} state={state} offers={scene.shop} onBuy={onBuy} />
      )}

      {!hasCombat && (
        <>
          {ending && (
        <div className="choices">
          <div className="green">КОНЕЦ</div>
          <button
            type="button"
            className={`choice${selected === 0 ? ' selected' : ''}${pressed === `${scene.key}:restart` ? ' pressed' : ''}`}
            onClick={onRestart}
            {...pressHandlers('restart')}
          >
            1. НАЧАТЬ ЗАНОВО
          </button>
        </div>
      )}

      {!ending && choices.length > 0 && (
        <div className="choices">
          {choices.map((c, i) => (
            <button
              key={`${c.goto}-${i}`}
              className={`choice${i === selected ? ' selected' : ''}${pressed === `${scene.key}:c${i}` ? ' pressed' : ''}`}
              data-variant={c.letter}
              onClick={() => onChoose(c)}
              {...pressHandlers(`c${i}`)}
            >
              {i + 1}. {c.label.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {!ending && choices.length === 0 && hasNext && !dice && (
        <div className="choices">
          <button
            type="button"
            className={`choice${selected === 0 ? ' selected' : ''}${pressed === `${scene.key}:next` ? ' pressed' : ''}`}
            onClick={() => onAdvance()}
            {...pressHandlers('next')}
          >
            1. ДАЛЕЕ
          </button>
        </div>
      )}

      {!ending && dice && !rollView && (
        <div className="choices">
          <button
            type="button"
            className={`choice${selected === 0 ? ' selected' : ''}${pressed === `${scene.key}:roll` ? ' pressed' : ''}`}
            onClick={startRoll}
            {...pressHandlers('roll')}
          >
            1. {isCoin ? 'БРОСИТЬ МОНЕТКУ' : 'БРОСИТЬ КУБИК'}
          </button>
        </div>
      )}

      {rollView && (
        <div className="roll-stage">
          <div className={rollView.kind === 'coin' ? 'roll-coin' : 'roll-die'}>
            {rollView.kind === 'coin'
              ? rollView.phase === 'result'
                ? rollView.value === 1
                  ? 'ОРЁЛ'
                  : 'РЕШКА'
                : '◉'
              : rollView.phase === 'result'
                ? rollView.value
                : 1 + (tick % 6)}
          </div>
          <div className="roll-caption">
            {rollView.phase === 'result'
              ? rollView.kind === 'coin'
                ? rollView.value === 1
                  ? 'ОРЁЛ'
                  : 'РЕШКА'
                : `ВЫПАЛО ${rollView.value}`
              : rollView.kind === 'coin'
                ? 'БРОСАЕМ МОНЕТУ…'
                : 'БРОСАЕМ КУБИК…'}
          </div>
        </div>
      )}

      {!ending && choices.length === 0 && !hasNext && (
        <div className="choices error">СБОЙ: ТУПИК В СЦЕНЕ {scene.key}</div>
      )}
        </>
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
