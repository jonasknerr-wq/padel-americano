/**
 * Turnierzustand und alle Zustandsübergänge als reine Funktionen.
 */
import { classicDefaultRounds, describeClassic } from './classic';
import { chooseRounds, MAX_PLAYERS, MIN_PLAYERS, type RoundPlan } from './rounds';
import { generateSchedule, replan } from './schedule';
import { makeResult } from './scoring';
import { finishRound, initialTimer, phaseStarted, type TimerConfig, type TimerState } from './timer';
import type { Player, PlayerId, Round } from './types';

/**
 * 'time'    = Zeit-Modus: Gesamtdauer, Runden mit Countdown, Rallye-Zählung, Normierung auf pointSum.
 * 'classic' = Klassischer Americano: jedes Match bis pointSum Punkte, keine Normierung.
 */
export type GameMode = 'time' | 'classic';

export interface Settings {
  mode: GameMode;
  totalMinutes: number;
  courts: number;
  warmupMinutes: number;
  changeMinutes: number;
  /** Zeit-Modus: Normierungssumme. Klassisch: Punktziel S pro Match. */
  pointSum: number;
  /** Nur klassisch: gewählte Rundenzahl, null = Standard (volle Rotation) */
  classicRounds: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'time',
  totalMinutes: 90,
  courts: 2,
  warmupMinutes: 5,
  changeMinutes: 2,
  pointSum: 24,
  classicRounds: null,
};

/** Fehlende Felder (z. B. aus älteren Speicherständen) mit Standardwerten auffüllen → Zeit-Modus. */
export function withSettingsDefaults(s: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...s };
}

/** Älteren gespeicherten Turnierstand auf das aktuelle Format bringen. */
export function migrateTournament(t: Tournament): Tournament {
  return { ...t, settings: withSettingsDefaults(t.settings) };
}

export const isClassic = (t: Pick<Tournament, 'settings'>) => t.settings.mode === 'classic';

export interface Replanning {
  fromRound: number;
  seed: number;
  activeIds: PlayerId[];
  reason: string;
}

interface Snapshot {
  players: Player[];
  activeIds: PlayerId[];
  rounds: Round[];
  replans: Replanning[];
  finished: boolean;
}

export interface UndoEntry {
  label: string;
  snapshot: Snapshot;
}

export interface Tournament extends Snapshot {
  version: 1;
  createdAt: number;
  settings: Settings;
  plan: RoundPlan;
  seed: number;
  timer: TimerState;
  undo: UndoEntry[];
}

const MAX_UNDO = 30;

export function timerConfig(t: Pick<Tournament, 'settings' | 'plan' | 'rounds'>): TimerConfig {
  const classic = t.settings.mode === 'classic';
  return {
    rounds: t.rounds.length,
    warmupSec: Math.round(t.settings.warmupMinutes * 60),
    roundSec: classic ? 0 : Math.round(t.plan.roundMinutes * 60),
    changeSec: Math.round(t.settings.changeMinutes * 60),
    countUp: classic,
  };
}

/** Rundenzahl im klassischen Modus: gewählt oder Standard (volle Rotation). */
export function classicRoundsFor(playerCount: number, s: Settings): number {
  if (s.classicRounds && s.classicRounds > 0) return s.classicRounds;
  return classicDefaultRounds(playerCount, s.courts, s.pointSum, s).rounds;
}

export function planFor(playerCount: number, s: Settings): RoundPlan {
  if (s.mode === 'classic') return describeClassic(playerCount, s.courts, classicRoundsFor(playerCount, s), s.pointSum);
  return chooseRounds(playerCount, s.courts, {
    totalMinutes: s.totalMinutes,
    warmupMinutes: s.warmupMinutes,
    changeMinutes: s.changeMinutes,
  });
}

export function buildSchedule(players: Player[], s: Settings, seed: number): { plan: RoundPlan; rounds: Round[] } {
  const plan = planFor(players.length, s);
  const rounds = generateSchedule({ players: players.map((p) => p.id), rounds: plan.rounds, courts: s.courts, seed });
  return { plan, rounds };
}

export function createTournament(players: Player[], settings: Settings, seed: number): Tournament {
  const { plan, rounds } = buildSchedule(players, settings, seed);
  const base = { settings, plan, rounds };
  return {
    version: 1,
    createdAt: Date.now(),
    players,
    activeIds: players.map((p) => p.id),
    settings,
    plan,
    seed,
    rounds,
    replans: [],
    finished: false,
    timer: initialTimer(timerConfig(base)),
    undo: [],
  };
}

function snapshot(t: Tournament): Snapshot {
  return { players: t.players, activeIds: t.activeIds, rounds: t.rounds, replans: t.replans, finished: t.finished };
}

function withUndo(t: Tournament, label: string, next: Partial<Snapshot>): Tournament {
  const undo = [...t.undo, { label, snapshot: snapshot(t) }].slice(-MAX_UNDO);
  return { ...t, ...next, undo };
}

export function undo(t: Tournament): Tournament {
  const last = t.undo[t.undo.length - 1];
  if (!last) return t;
  const restored = { ...t, ...last.snapshot, undo: t.undo.slice(0, -1) };
  // Rundenzahl kann sich (z. B. durch Turnierende) geändert haben → Timer begrenzen
  if (restored.timer.round >= restored.rounds.length) {
    restored.timer = { ...restored.timer, round: Math.max(0, restored.rounds.length - 1) };
  }
  return restored;
}

export function playerName(t: Pick<Tournament, 'players'>, id: PlayerId): string {
  return t.players.find((p) => p.id === id)?.name ?? '?';
}

/** Prüft ein klassisches Ergebnis: ganze Zahlen 0…S, Summe genau S. Gibt Fehlertext oder null zurück. */
export function validateClassicResult(a: number, b: number, total: number): string | null {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return 'Punkte müssen ganze Zahlen ab 0 sein.';
  if (a + b !== total) return `Die Summe muss genau ${total} sein.`;
  return null;
}

/**
 * Ergebnis speichern. Klassischer Modus: Summe muss S sein (sonst Fehler). Ist danach
 * jedes Match der laufenden Runde eingetragen, endet die Runde automatisch und die
 * Wechselzeit startet (Timer ist nicht Teil von „Rückgängig“).
 */
export function setResult(t: Tournament, round: number, court: number, rawA: number, rawB: number, now = Date.now()): Tournament {
  if (isClassic(t)) {
    const err = validateClassicResult(rawA, rawB, t.settings.pointSum);
    if (err) throw new Error(err);
  }
  const result = makeResult(rawA, rawB, t.settings.pointSum);
  const rounds = t.rounds.map((r, ri) =>
    ri !== round ? r : { ...r, matches: r.matches.map((m) => (m.court === court ? { ...m, result } : m)) },
  );
  const next = withUndo(t, `Ergebnis Runde ${round + 1}, Platz ${court + 1}`, { rounds });
  if (isClassic(t) && rounds[round].matches.every((m) => m.result)) {
    return { ...next, timer: finishRound(next.timer, round, timerConfig(next), now) };
  }
  return next;
}

export function clearResult(t: Tournament, round: number, court: number): Tournament {
  const rounds = t.rounds.map((r, ri) =>
    ri !== round
      ? r
      : {
          ...r,
          matches: r.matches.map((m) => {
            if (m.court !== court) return m;
            const { result: _omit, ...rest } = m;
            return rest;
          }),
        },
  );
  return withUndo(t, `Ergebnis gelöscht (Runde ${round + 1}, Platz ${court + 1})`, { rounds });
}

/**
 * Ab welcher Runde neu geplant wird: die aktuelle Runde, wenn sie noch nicht
 * begonnen hat und kein Ergebnis hat, sonst die nächste.
 */
export function replanFrom(t: Tournament): number {
  const { timer } = t;
  if (timer.phase === 'done') return t.rounds.length;
  const r = timer.round;
  const started = timer.phase === 'round' && phaseStarted(timer);
  const hasResult = t.rounds[r]?.matches.some((m) => m.result);
  return started || hasResult ? r + 1 : r;
}

function doReplan(t: Tournament, activeIds: PlayerId[], reason: string, players = t.players): Tournament {
  const fromRound = replanFrom(t);
  const seed = (t.seed + 7919 * (t.replans.length + 1)) >>> 0;
  const ordered = players.filter((p) => activeIds.includes(p.id)).map((p) => p.id);
  const rounds = replan({ rounds: t.rounds, fromRound, players: ordered, courts: t.settings.courts, seed });
  return withUndo(t, reason, {
    players,
    activeIds: ordered,
    rounds,
    replans: [...t.replans, { fromRound, seed, activeIds: ordered, reason }],
  });
}

export function dropPlayer(t: Tournament, id: PlayerId): Tournament {
  const active = t.activeIds.filter((x) => x !== id);
  if (active.length < 4) throw new Error('Mindestens 4 Spieler nötig');
  return doReplan(t, active, `${playerName(t, id)} fällt aus`);
}

export function addPlayer(t: Tournament, name: string): Tournament {
  const trimmed = name.trim();
  const existing = t.players.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  if (existing && t.activeIds.includes(existing.id)) throw new Error('Name schon vergeben');
  if (t.activeIds.length >= MAX_PLAYERS) throw new Error(`Maximal ${MAX_PLAYERS} Spieler`);
  if (existing) return doReplan(t, [...t.activeIds, existing.id], `${existing.name} ist wieder dabei`);
  const player: Player = { id: newId(t.players), name: trimmed };
  return doReplan(t, [...t.activeIds, player.id], `${trimmed} kommt dazu`, [...t.players, player]);
}

/** Turnier vorzeitig beenden: ungespielte Runden ohne Ergebnis entfallen. */
export function finishTournament(t: Tournament): Tournament {
  let last = t.rounds.length - 1;
  while (last >= 0 && !t.rounds[last].matches.some((m) => m.result)) last--;
  const keepUntil = Math.max(last + 1, t.timer.phase === 'done' ? t.rounds.length : 0);
  return withUndo(t, 'Turnier beendet', { finished: true, rounds: t.rounds.slice(0, keepUntil) });
}

/** Zurück aus dem Endstand ins laufende Turnier. */
export function reopenTournament(t: Tournament): Tournament {
  if (t.undo.length && t.undo[t.undo.length - 1].label === 'Turnier beendet') return undo(t);
  return { ...t, finished: false };
}

export function newId(players: Player[]): PlayerId {
  let i = players.length + 1;
  const ids = new Set(players.map((p) => p.id));
  while (ids.has(`p${i}`)) i++;
  return `p${i}`;
}

export function missingResults(t: Tournament, uptoRound: number): { round: number; court: number }[] {
  const out: { round: number; court: number }[] = [];
  for (let r = 0; r <= Math.min(uptoRound, t.rounds.length - 1); r++)
    for (const m of t.rounds[r].matches) if (!m.result) out.push({ round: r, court: m.court });
  return out;
}

/** Validierung der Spielernamen im Setup */
export function validateNames(names: string[]): string | null {
  const trimmed = names.map((n) => n.trim());
  if (trimmed.some((n) => !n)) return 'Leere Namen sind nicht erlaubt.';
  const lower = trimmed.map((n) => n.toLowerCase());
  if (new Set(lower).size !== lower.length) return 'Jeder Name darf nur einmal vorkommen.';
  if (trimmed.length < MIN_PLAYERS) return `Noch ${MIN_PLAYERS - trimmed.length} Spieler hinzufügen (mindestens ${MIN_PLAYERS}).`;
  if (trimmed.length > MAX_PLAYERS) return `Höchstens ${MAX_PLAYERS} Spieler.`;
  return null;
}

/** Kurzbeschreibung für die Kopfzeile, z. B. „Klassisch · bis 24 Punkte“. */
export function modeLabel(s: Settings): string {
  return s.mode === 'classic' ? `Klassisch · bis ${s.pointSum} Punkte` : `Zeit-Modus · normiert auf ${s.pointSum}`;
}
