'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Monoblock, { type ScreenName } from '@/components/Monoblock';
import Boot from '@/components/screens/Boot';
import Library from '@/components/screens/Library';
import GameScreen from '@/components/screens/GameScreen';
import ErrorScreen from '@/components/screens/ErrorScreen';
import { audio } from '@/lib/audio';
import { loadGame, loadIndex } from '@/lib/games';
import { advance, choose, newState } from '@/lib/engine';
import { clearSave, loadSave, saveState, loadSettings, saveSettings } from '@/lib/storage';
import type { Choice, Game, GameIndexEntry, GameState } from '@/lib/types';

export default function Page() {
  const [screen, setScreen] = useState<ScreenName>('boot');
  const [games, setGames] = useState<GameIndexEntry[]>([]);
  const [saves, setSaves] = useState<Record<string, string | undefined>>({});
  const [game, setGame] = useState<Game | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [sound, setSound] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const audioStarted = useRef(false);
  const refreshSavesRef = useRef<() => void>(() => {});

  useEffect(() => {
    const settings = loadSettings();
    setSound(settings.sound);
    audio.setEnabled(settings.sound);

    loadIndex()
      .then((list) => {
        setGames(list);
        const map: Record<string, string | undefined> = {};
        for (const g of list) map[g.id] = loadSave(g.id)?.scene;
        setSaves(map);
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
    };
    window.addEventListener('pointerdown', startAudio, { once: true });
    window.addEventListener('keydown', startAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', startAudio);
      window.removeEventListener('keydown', startAudio);
    };
  }, [sound]);

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

  const startGame = useCallback(async (id: string) => {
    try {
      const g = await loadGame(id);
      const save = loadSave(id);
      const valid = save && save.format === g.format && save.game === g.id && g.scenes[save.scene];
      const next = valid ? save : newState(g);
      audio.click();
      setGame(g);
      setState(next);
      setScreen('game');
      saveState(next);
    } catch (e: unknown) {
      setError(String(e));
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

  const handleAdvance = useCallback(() => {
    if (!game || !state) return;
    audio.click();
    const next = advance(game, state);
    setState(next);
    saveState(next);
  }, [game, state]);

  const handleRestart = useCallback(() => {
    if (!game) return;
    const next = newState(game);
    setState(next);
    saveState(next);
    audio.click();
  }, [game]);

  const handleReset = useCallback(
    (id: string) => {
      clearSave(id);
      audio.click();
      if (game?.id === id) {
        setState(null);
        setGame(null);
      }
      refreshSaves();
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
    saveSettings({ sound: next });
    audio.setEnabled(next);
    if (next) audio.click();
  }, [sound]);

  return (
    <Monoblock
      screen={screen}
      gameAvailable={Boolean(game && state)}
      onLibrary={toLibrary}
      onGame={toGame}
    >
      {screen === 'boot' && <Boot onDone={() => setScreen('library')} />}

      {screen === 'library' && (
        <Library
          games={games}
          saves={saves}
          sound={sound}
          onStart={startGame}
          onToggleSound={toggleSound}
          onReset={handleReset}
        />
      )}

      {screen === 'game' && game && state && (
        <GameScreen
          game={game}
          state={state}
          onChoose={handleChoose}
          onAdvance={handleAdvance}
          onRestart={handleRestart}
        />
      )}

      {screen === 'error' && (
        <ErrorScreen message={error ?? 'НЕИЗВЕСТНАЯ ОШИБКА'} onBack={() => setScreen('library')} />
      )}
    </Monoblock>
  );
}
