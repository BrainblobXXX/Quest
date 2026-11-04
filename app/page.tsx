'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Monoblock, { type ScreenName } from '@/components/Monoblock';
import Boot from '@/components/screens/Boot';
import Library from '@/components/screens/Library';
import GameScreen from '@/components/screens/GameScreen';
import ErrorScreen from '@/components/screens/ErrorScreen';
import { audio } from '@/lib/audio';
import { trackFor } from '@/lib/music';
import { loadGame, loadIndex } from '@/lib/games';
import { PackageError } from '@/lib/parse';
import { advance, choose, newState, resolveRoll } from '@/lib/engine';
import { clearSave, loadSave, saveState, loadSettings, saveSettings } from '@/lib/storage';
import { hardRefresh } from '@/lib/refresh';
import type { Choice, Game, GameIndexEntry, GameState, ParseProblem } from '@/lib/types';

export default function Page() {
  const [screen, setScreen] = useState<ScreenName>('boot');
  const [games, setGames] = useState<GameIndexEntry[]>([]);
  const [saves, setSaves] = useState<Record<string, string | undefined>>({});
  const [sourceAt, setSourceAt] = useState<string | null>(null);
  const [problems, setProblems] = useState<ParseProblem[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [sound, setSound] = useState(true);
  const [music, setMusic] = useState(true);
  const [soundVolume, setSoundVolume] = useState(1);
  const [musicVolume, setMusicVolume] = useState(0.7);
  const [error, setError] = useState<string | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const audioStarted = useRef(false);
  const refreshSavesRef = useRef<() => void>(() => {});

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

    loadIndex()
      .then((list) => {
        setGames(list);
        const map: Record<string, string | undefined> = {};
        for (const g of list) map[g.id] = loadSave(g.id)?.scene;
        setSaves(map);
        const stamps = list.map((g) => g.updatedAt ?? '').sort();
        setSourceAt(stamps.at(-1) || null);
      })
      .catch((e: unknown) => {
        setError(String(e));
        setScreen('error');
      });
  }, []);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        refreshSavesRef.current();
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

  // музыка по настроению сцены
  useEffect(() => {
    if (!game || !state) return;
    const scene = game.scenes[state.scene];
    if (!scene) return;
    const track = trackFor(game, scene);
    if (track) audio.playMusic(`/api/games/${game.id}/${track}`);
  }, [game, state]);

  const startGame = useCallback(async (id: string) => {
    try {
      const { game: g, problems: parsed } = await loadGame(id);
      setProblems(parsed);
      const save = loadSave(id);
      const valid =
        save &&
        save.format === g.format &&
        save.game === g.id &&
        (!g.rev || save.rev === g.rev) &&
        g.scenes[save.scene];
      const next = valid ? save : newState(g);
      audio.stopMusic();
      audio.click();
      setGame(g);
      setState(next);
      setScreen('game');
      saveState(next);
    } catch (e: unknown) {
      setProblems(e instanceof PackageError ? e.problems : []);
      setError(String(e instanceof Error ? e.message : e));
      setScreen('error');
    }
  }, []);

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

  const handleRestart = useCallback(() => {
    if (!game) return;
    const next = newState(game);
    setState(next);
    saveState(next);
    setConfirmRestart(false);
    audio.click();
  }, [game]);

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
      // сброс прогресса = начать с чистого листа: заодно подтягиваем свежую
      // сборку приложения, чтобы старый кэш не показывал прошлую версию книги
      void hardRefresh();
    },
    [game, refreshSaves],
  );

  const toLibrary = useCallback(() => {
    audio.click();
    refreshSaves();
    setScreen('library');
  }, [refreshSaves]);

  const toGame = useCallback(() => {
    if (game && state) {
      audio.click();
      setScreen('game');
    }
  }, [game, state]);

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
      onLibrary={toLibrary}
      onGame={toGame}
      onPower={handlePower}
    >
      {screen === 'boot' && <Boot buildAt={sourceAt} gamesCount={games.length} onDone={() => setScreen('library')} />}

      {screen === 'library' && (
        <Library
          games={games}
          saves={saves}
          sound={sound}
          onStart={startGame}
          onToggleSound={toggleSound}
          onToggleMusic={toggleMusic}
          music={music}
          soundVolume={soundVolume}
          musicVolume={musicVolume}
          onSoundVolume={changeSoundVolume}
          onMusicVolume={changeMusicVolume}
          onReset={handleReset}
          buildAt={sourceAt}
        />
      )}

      {screen === 'game' && game && state && (
        <GameScreen
          game={game}
          state={state}
          onChoose={handleChoose}
          onAdvance={handleAdvance}
          onRestart={handleRestart}
          music={music}
          onToggleMusic={toggleMusic}
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
