import { useCallback, useEffect, useState } from 'react';
import { newSeed } from './logic/rng';
import { DEFAULT_SETTINGS, type Settings, type Tournament } from './logic/tournament';

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

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const d = defaults();
    return {
      draft: { ...d.draft, ...parsed.draft, settings: { ...d.draft.settings, ...parsed.draft?.settings } },
      tournament: parsed.tournament?.version === 1 ? parsed.tournament : null,
      theme: parsed.theme ?? 'system',
    };
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
