'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Monoblock, { type ScreenName } from '@/components/Monoblock';
import Boot from '@/components/screens/Boot';
import Loading from '@/components/screens/Loading';
import Library from '@/components/screens/Library';
import Settings from '@/components/screens/Settings';
import GameScreen from '@/components/screens/GameScreen';
import InitialRoll from '@/components/screens/InitialRoll';
import ErrorScreen from '@/components/screens/ErrorScreen';
import { audio } from '@/lib/audio';
import { trackFor } from '@/lib/music';
import { loadGame, loadIndex, type LoadProgress } from '@/lib/games';
import { PackageError } from '@/lib/parse';
import { advance, choose, goToScene, newState, resolveRoll } from '@/lib/engine';
import { clearSave, loadSave, saveState, loadSettings, saveSettings } from '@/lib/storage';
import type { Choice, Game, GameIndexEntry, GameState, ParseProblem } from '@/lib/types';

/** добирает предметы, которые не попали в старые сейвы до исправления данных */
function repairSceneItems(game: Game, state: GameState): GameState {
  if (game.id !== 'zombie-blood') return state;
  const requiredByScene: Record<string, Record<string, number>> = {
    '178': { short_rope: 1 },
    '291': { baseball_bat: 1 },
    '44': { pistol: 1, ammo: 1 },
    '92': { pistol: 1, ammo: 1 },
    '105': { submachine: 1, ammo: 1 },
    '136': { pistol: 1 },
    '222': { medkit: 1, pistol: 1 },
    '235': { medkit: 1, ammo: 2 },
    '293': { grenade: 1 },
    '302': { grenade: 3 },
    '373': { axe: 1 },
    '162': { medkit: 2, ammo: 6, shotgun_ammo: 6 },
    '181': { ammo: 2, shotgun_ammo: 3 },
    '213': { ammo: 3, shotgun_ammo: 3 },
    '236': { shotgun_ammo: 1 },
    '304': { ammo: 2, shotgun_ammo: 4 },
  };
  /** Старые сейвы складывали обычные и дробовые патроны в один счётчик. */
  const legacySplit: Record<string, number> = { '162': 6, '181': 3, '213': 3, '236': 1, '304': 4 };
  const inventory = { ...state.inventory };
  let changed = false;
  const split = legacySplit[state.scene];
  if (split && (inventory.shotgun_ammo ?? 0) === 0) {
    const currentAmmo = inventory.ammo ?? 0;
    const moved = Math.min(split, currentAmmo);
    if (moved > 0) {
      inventory.shotgun_ammo = moved;
      if (currentAmmo > moved) inventory.ammo = currentAmmo - moved;
      else delete inventory.ammo;
      changed = true;
    }
  }
  const required = requiredByScene[state.scene] ?? {};
  for (const [id, count] of Object.entries(required)) {
    if ((inventory[id] ?? 0) < count) {
      inventory[id] = count;
      changed = true;
    }
  }
  return changed ? { ...state, inventory } : state;
}

/** статус со стартовым броском (ZombieBlood: Выносливость 2d6+20) */
function initialRollStat(game: Game): string | null {
  for (const [id, def] of Object.entries(game.stats ?? {})) {
    if (def.roll) return id;
  }
  return null;
}

/** минимум, сколько видна загрузка: иначе на быстром диске она мелькает одним кадром */
const MIN_LOADING_MS = 1000;
/** пауза на строке «READY», чтобы лог успел дочитаться */
const READY_HOLD_MS = 420;
/** перезапуск книги: этапы BOOK LOADER без повторного чтения пакета */
const RESTART_STAGES = ['mount', 'manifest', 'story', 'items', 'parse'] as const;
const RESTART_STAGE_MS = 150;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type LoadingBook = {
  id: string;
  title: string;
  progress: LoadProgress;
  scenes?: number;
};

export default function Page() {
  const [screen, setScreen] = useState<ScreenName>('boot');
  const [games, setGames] = useState<GameIndexEntry[]>([]);
  const [saves, setSaves] = useState<Record<string, string | undefined>>({});
  const [sourceAt, setSourceAt] = useState<string | null>(null);
  const [problems, setProblems] = useState<ParseProblem[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState<LoadingBook | null>(null);
  const [sound, setSound] = useState(true);
  const [music, setMusic] = useState(true);
  const [soundVolume, setSoundVolume] = useState(1);
  const [musicVolume, setMusicVolume] = useState(0.7);
  const [error, setError] = useState<string | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [initialRoll, setInitialRoll] = useState<string | null>(null);
  const audioStarted = useRef(false);
  const refreshSavesRef = useRef<() => void>(() => {});
  const cancelLoadingRef = useRef<() => void>(() => {});
  /** номер текущей загрузки: устаревший ответ не должен перебить новый экран */
  const loadToken = useRef(0);

  const refreshLibrary = useCallback(async () => {
    try {
      const list = await loadIndex();
      setGames(list);
      const map: Record<string, string | undefined> = {};
      for (const g of list) map[g.id] = loadSave(g.id)?.scene;
      setSaves(map);
      const stamps = list.map((g) => g.updatedAt ?? '').sort();
      setSourceAt(stamps.at(-1) || null);
    } catch (e: unknown) {
      setError(String(e instanceof Error ? e.message : e));
      setScreen('error');
    }
  }, []);

  useEffect(() => {
    const settings = loadSettings();
    setSound(settings.sound);
    setMusic(settings.music);
    setSoundVolume(settings.soundVolume);
    setMusicVolume(settings.musicVolume);
    audio.setEnabled(settings.sound);
    audio.setMusicEnabled(settings.music);
    audio.setSoundVolume(settings.soundVolume);
    audio.setMusicVolume(settings.musicVolume);

    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    const startAudio = () => {
      if (audioStarted.current) return;
      audioStarted.current = true;
      audio.start();
      audio.setEnabled(sound);
      audio.setMusicEnabled(music);
      audio.setSoundVolume(soundVolume);
      audio.setMusicVolume(musicVolume);
    };
    window.addEventListener('pointerdown', startAudio, { once: true });
    window.addEventListener('keydown', startAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', startAudio);
      window.removeEventListener('keydown', startAudio);
    };
  }, [sound, music, soundVolume, musicVolume]);

  // уход из приложения: свернуть вкладку, закрыть её или перейти на другой адрес —
  // гул и музыка должны замолчать; при возврате включаем их по настройкам
  useEffect(() => {
    const pause = () => audio.pauseAll();
    const resume = () => {
      if (document.visibilityState === 'visible') audio.resumeAll();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause();
      else resume();
    };
    const onPageHide = () => pause();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', resume);
    window.addEventListener('beforeunload', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('beforeunload', onPageHide);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelLoadingRef.current();
        refreshSavesRef.current();
        setConfirmRestart(false);
        setScreen('library');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const refreshSaves = useCallback(() => {
    const map: Record<string, string | undefined> = {};
    for (const g of games) map[g.id] = loadSave(g.id)?.scene;
    setSaves(map);
  }, [games]);

  refreshSavesRef.current = refreshSaves;

  /** уводит с экрана загрузки: поздний ответ сервера уже не должен переключать экран */
  const cancelLoading = useCallback(() => {
    loadToken.current += 1;
    setLoading(null);
  }, []);

  cancelLoadingRef.current = cancelLoading;

  // музыка по настроению сцены
  useEffect(() => {
    if (!game || !state) return;
    if (initialRoll) {
      audio.stopMusic();
      return;
    }
    const scene = game.scenes[state.scene];
    if (!scene) return;
    const track = trackFor(game, scene);
    if (track) audio.playMusic(`/api/games/${game.id}/${track}`);
  }, [game, state, initialRoll]);

  const startGame = useCallback(
    async (id: string) => {
      const entry = games.find((g) => g.id === id);
      const token = loadToken.current + 1;
      loadToken.current = token;
      const startedAt = performance.now();

      setConfirmRestart(false);
      setLoading({ id, title: entry?.title ?? id, progress: { stage: 'mount' } });
      setScreen('loading');
      audio.click();

      try {
        const { game: g, problems: parsed } = await loadGame(id, (progress) => {
          if (loadToken.current !== token) return;
          setLoading((current) =>
            current && current.id === id
              ? // счётчик байт story.md приходит только на этапе story:
                // сохраняем его до «READY», иначе в конце показываются 0 KB
                { ...current, progress: { ...current.progress, ...progress } }
              : current,
          );
        });
        if (loadToken.current !== token) return;

        const save = loadSave(id);
        const valid =
          save &&
          save.format === g.format &&
          save.game === g.id &&
          (!g.rev || save.rev === g.rev) &&
          g.scenes[save.scene];
        const fresh = !valid;
        const next = repairSceneItems(g, valid ? save : newState(g));
        const rollStat = fresh ? initialRollStat(g) : null;

        // последние проценты и число сцен: экран успевает показать «READY»
        setLoading((current) =>
          current && current.id === id
            ? {
                ...current,
                progress: { ...current.progress, stage: 'ready' },
                scenes: Object.keys(g.scenes).length,
              }
            : current,
        );

        const remaining = MIN_LOADING_MS - (performance.now() - startedAt);
        if (remaining > 0) await wait(remaining);
        await wait(READY_HOLD_MS);
        if (loadToken.current !== token) return;

        setLoading(null);
        setProblems(parsed);
        audio.stopMusic();
        audio.beep();
        setGame(g);
        setState(next);
        setInitialRoll(rollStat);
        setScreen('game');
        if (!rollStat) saveState(next);
      } catch (e: unknown) {
        if (loadToken.current !== token) return;
        setLoading(null);
        setProblems(e instanceof PackageError ? e.problems : []);
        setError(String(e instanceof Error ? e.message : e));
        setScreen('error');
      }
    },
    [games],
  );

  const handleChoose = useCallback(
    (choice: Choice) => {
      if (!game || !state) return;
      audio.click();
      const next = choose(game, state, choice);
      setState(next);
      saveState(next);
    },
    [game, state],
  );

  const handleAdvance = useCallback(
    (value?: number) => {
      if (!game || !state) return;
      audio.click();
      const next = value === undefined ? advance(game, state) : resolveRoll(game, state, value);
      setState(next);
      saveState(next);
    },
    [game, state],
  );

  const handleCombatWin = useCallback(
    (result: GameState) => {
      if (!game) return;
      const target = game.combat?.[result.scene]?.win;
      if (!target) return;
      const next = goToScene(game, result, target);
      setState(next);
      saveState(next);
    },
    [game],
  );

  const handleCombatExit = useCallback(() => {
    if (state) saveState(state);
    refreshSaves();
    setScreen('library');
    audio.click();
  }, [state, refreshSaves]);

  const handleBuy = useCallback(
    (itemId: string, price: number) => {
      if (!game || !state || !game.items?.[itemId]) return;
      if ((state.inventory[itemId] ?? 0) > 0) return;
      const cost = Math.max(0, Number(price) || 0);
      if (Number(state.stats.money ?? 0) < cost) return;
      const next: GameState = {
        ...state,
        stats: { ...state.stats, money: Number(state.stats.money ?? 0) - cost },
        inventory: { ...state.inventory, [itemId]: 1 },
      };
      setState(next);
      saveState(next);
    },
    [game, state],
  );

  const handleRestart = useCallback(async () => {
    if (!game) return;

    const token = loadToken.current + 1;
    loadToken.current = token;
    const startedAt = performance.now();

    setConfirmRestart(false);
    setLoading({
      id: game.id,
      title: game.title,
      progress: { stage: 'mount' },
      scenes: Object.keys(game.scenes).length,
    });
    setScreen('loading');
    audio.click();

    // пакет уже разобран — проигрываем этапы BOOK LOADER без сети
    for (const stage of RESTART_STAGES) {
      if (loadToken.current !== token) return;
      setLoading((current) =>
        current ? { ...current, progress: { ...current.progress, stage } } : current,
      );
      await wait(RESTART_STAGE_MS);
    }
    if (loadToken.current !== token) return;

    setLoading((current) =>
      current ? { ...current, progress: { ...current.progress, stage: 'ready' } } : current,
    );
    const remaining = MIN_LOADING_MS - (performance.now() - startedAt);
    if (remaining > 0) await wait(remaining);
    await wait(READY_HOLD_MS);
    if (loadToken.current !== token) return;

    const next = newState(game);
    const rollStat = initialRollStat(game);
    audio.stopMusic();
    audio.beep();
    setState(next);
    setInitialRoll(rollStat);
    if (!rollStat) saveState(next);
    setLoading(null);
    setScreen('game');
  }, [game]);

  const handleInitialRollDone = useCallback(
    (value: number) => {
      if (!game || !state || !initialRoll) return;
      const next: GameState = {
        ...state,
        stats: { ...state.stats, [initialRoll]: value },
        initialStats: { ...(state.initialStats ?? state.stats), [initialRoll]: value },
      };
      setState(next);
      saveState(next);
      setInitialRoll(null);
    },
    [game, state, initialRoll],
  );

  const handlePower = useCallback(() => {
    if (!game || !state) return;
    audio.click();
    setConfirmRestart(true);
  }, [game, state]);

  const handleReset = useCallback(
    (id: string) => {
      clearSave(id);
      audio.click();
      if (game?.id === id) {
        audio.stopMusic();
        setState(null);
        setGame(null);
      }
      refreshSaves();
    },
    [game, refreshSaves],
  );

  const toLibrary = useCallback(() => {
    cancelLoading();
    setConfirmRestart(false);
    audio.click();
    refreshSaves();
    setScreen('library');
  }, [cancelLoading, refreshSaves]);

  const toGame = useCallback(() => {
    if (game && state) {
      cancelLoading();
      setConfirmRestart(false);
      audio.click();
      setScreen('game');
    }
  }, [cancelLoading, game, state]);

  const toSettings = useCallback(() => {
    cancelLoading();
    setConfirmRestart(false);
    audio.click();
    setScreen('settings');
  }, [cancelLoading]);

  const toggleSound = useCallback(() => {
    const next = !sound;
    setSound(next);
    saveSettings({ sound: next, music, soundVolume, musicVolume });
    audio.setEnabled(next);
    if (next) audio.click();
  }, [sound, music, soundVolume, musicVolume]);

  const toggleMusic = useCallback(() => {
    const next = !music;
    setMusic(next);
    saveSettings({ sound, music: next, soundVolume, musicVolume });
    audio.setMusicEnabled(next);
  }, [sound, music, soundVolume, musicVolume]);

  const changeSoundVolume = useCallback(
    (value: number) => {
      const v = Math.min(1, Math.max(0, value));
      setSoundVolume(v);
      audio.setSoundVolume(v);
      saveSettings({ sound, music, soundVolume: v, musicVolume });
    },
    [sound, music, musicVolume],
  );

  const changeMusicVolume = useCallback(
    (value: number) => {
      const v = Math.min(1, Math.max(0, value));
      setMusicVolume(v);
      audio.setMusicVolume(v);
      saveSettings({ sound, music, soundVolume, musicVolume: v });
    },
    [sound, music, soundVolume],
  );

  return (
    <Monoblock
      screen={screen}
      gameAvailable={Boolean(game && state)}
      powerAvailable={screen === 'game' && Boolean(game && state)}
      onLibrary={toLibrary}
      onGame={toGame}
      onSettings={toSettings}
      onPower={handlePower}
    >
      {screen === 'boot' && <Boot sourceAt={sourceAt} gamesCount={games.length} onDone={() => setScreen('library')} />}

      {screen === 'loading' && loading && (
        <Loading
          id={loading.id}
          title={loading.title}
          progress={loading.progress}
          scenes={loading.scenes}
        />
      )}

      {screen === 'library' && (
        <Library
          games={games}
          saves={saves}
          onStart={startGame}
          onReset={handleReset}
          onReload={refreshLibrary}
          sourceAt={sourceAt}
        />
      )}

      {screen === 'settings' && (
        <Settings
          sound={sound}
          music={music}
          soundVolume={soundVolume}
          musicVolume={musicVolume}
          onToggleSound={toggleSound}
          onToggleMusic={toggleMusic}
          onSoundVolume={changeSoundVolume}
          onMusicVolume={changeMusicVolume}
        />
      )}

      {screen === 'game' && initialRoll && game && state && (
        <InitialRoll game={game} statId={initialRoll} onDone={handleInitialRollDone} />
      )}

      {screen === 'game' && game && state && !initialRoll && (
        <GameScreen
          game={game}
          state={state}
          onChoose={handleChoose}
          onAdvance={handleAdvance}
          onRestart={handleRestart}
          onCombatWin={handleCombatWin}
          onCombatExit={handleCombatExit}
          onBuy={handleBuy}
          problems={problems}
        />
      )}

      {screen === 'error' && (
        <ErrorScreen
          message={error ?? 'НЕИЗВЕСТНАЯ ОШИБКА'}
          problems={problems}
          onBack={() => setScreen('library')}
        />
      )}

      {confirmRestart && (
        <div className="confirm-overlay">
          <div className="confirm-box">
            <div>НАЧАТЬ ИГРУ ЗАНОВО?</div>
            <div className="choices">
              <button className="choice" onClick={handleRestart}>
                1. ДА
              </button>
              <button className="choice" onClick={() => setConfirmRestart(false)}>
                2. НЕТ
              </button>
            </div>
          </div>
        </div>
      )}
    </Monoblock>
  );
}
