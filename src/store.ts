import { useCallback, useEffect, useState } from 'react';
import { newSeed } from './logic/rng';
import { DEFAULT_SETTINGS, migrateTournament, withSettingsDefaults, type Settings, type Tournament } from './logic/tournament';

export type Theme = 'system' | 'light' | 'dark';

export interface SetupDraft {
  names: string[];
  settings: Settings;
  seed: number;
}

export interface AppState {
  draft: SetupDraft;
  tournament: Tournament | null;
  theme: Theme;
}

const KEY = 'padel-americano:v1';

function defaults(): AppState {
  return { draft: { names: [], settings: { ...DEFAULT_SETTINGS }, seed: newSeed() }, tournament: null, theme: 'system' };
}

/**
 * Gespeicherten Stand einlesen. Ältere Stände ohne neue Felder (z. B. ohne `mode`)
 * bekommen Standardwerte → Zeit-Modus. Exportiert für Tests.
 */
export function parseState(raw: string | null): AppState {
  if (!raw) return defaults();
  const parsed = JSON.parse(raw) as Partial<AppState>;
  const d = defaults();
  return {
    draft: { ...d.draft, ...parsed.draft, settings: withSettingsDefaults(parsed.draft?.settings) },
    tournament: parsed.tournament?.version === 1 ? migrateTournament(parsed.tournament) : null,
    theme: parsed.theme ?? 'system',
  };
}

function load(): AppState {
  try {
    return parseState(localStorage.getItem(KEY));
  } catch {
    return defaults();
  }
}

export function useAppState() {
  const [state, setState] = useState<AppState>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* Speicher voll oder gesperrt – App läuft trotzdem weiter */
    }
  }, [state]);

  const update = useCallback((fn: (s: AppState) => AppState) => setState(fn), []);
  return [state, update] as const;
}
