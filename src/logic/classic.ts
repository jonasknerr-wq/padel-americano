/**
 * Klassischer Americano: Jedes Match geht bis zu einer festen Gesamtpunktzahl S
 * (z. B. 24 → 15:9). Keine Gesamtdauer, keine Normierung.
 *
 * Hier stecken Rundenzahl, Dauer-Schätzung und Aufschlag-Hinweis. Der Spielplan
 * selbst kommt aus schedule.ts (gleiche Fairness- und Pausenlogik wie im Zeit-Modus).
 */
import { activeCourts, type RoundPlan } from './rounds';

/** Wählbare Punktziele */
export const CLASSIC_POINT_OPTIONS = [16, 21, 24, 32];
export const CLASSIC_DEFAULT_POINTS = 24;
export const CLASSIC_MIN_ROUNDS = 1;
export const CLASSIC_MAX_ROUNDS = 40;
/** Der Standard soll höchstens so lange dauern (geschätzt), sonst wird gekürzt. */
export const CLASSIC_DEFAULT_MAX_MINUTES = 180;

export interface ClassicTimes {
  warmupMinutes: number;
  changeMinutes: number;
}

/**
 * Geschätzte Matchdauer in Minuten: 3,5 Min Grundzeit + 0,3125 Min (≈ 19 s) pro Punkt.
 * Abgeleitet aus Richtwerten 24 Punkte ≈ 10–12 Min, 32 Punkte ≈ 12–15 Min
 * (Gerade durch die Mitten 11 und 13,5 Min). 16 → 8,5 · 21 → 10,1 · 24 → 11 · 32 → 13,5.
 */
export function classicMatchMinutes(points: number): number {
  return 3.5 + (points * 5) / 16;
}

/** Geschätzte Gesamtdauer: Einspielen + Runden × Matchdauer + (Runden − 1) × Wechsel. */
export function estimateClassicMinutes(rounds: number, points: number, t: ClassicTimes): number {
  if (rounds <= 0) return t.warmupMinutes;
  return t.warmupMinutes + rounds * classicMatchMinutes(points) + (rounds - 1) * t.changeMinutes;
}

/** Auf 5 Minuten gerundet, für die Anzeige „ca. 1:35 h“. */
export function roundToFive(min: number): number {
  return Math.round(min / 5) * 5;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Rundenzahlen, bei denen alle gleich oft spielen, sind Vielfache hiervon. */
export function fairStep(players: number, courts: number): number {
  const a = activeCourts(players, courts);
  if (a === 0) return 1;
  return players / gcd(players, 4 * a);
}

/**
 * Runden, damit jeder genau einmal mit jedem zusammenspielt:
 * Spieler × (Spieler − 1) ÷ (4 × aktive Plätze). Kann eine Kommazahl sein.
 * Ohne Aussetzer (4/1, 8/2, 12/3) ist das Spielerzahl − 1.
 */
export function fullRotationRounds(players: number, courts: number): number {
  const a = activeCourts(players, courts);
  if (a === 0) return 0;
  return (players * (players - 1)) / (4 * a);
}

/** Volle Rotation geht ganzzahlig auf UND alle spielen dabei gleich oft. */
export function perfectRotationPossible(players: number, courts: number): boolean {
  const full = fullRotationRounds(players, courts);
  return Number.isInteger(full) && full > 0 && full % fairStep(players, courts) === 0;
}

/** Whist-Fall: niemand setzt aus und volle Rotation → jeder 1× mit, 2× gegen jeden. */
export function isWhistCase(players: number, courts: number): boolean {
  return players % 4 === 0 && activeCourts(players, courts) * 4 === players;
}

export interface ClassicDefault {
  rounds: number;
  /** Rundenzahl für „jeder einmal mit jedem“ (evtl. Kommazahl) */
  fullRotation: number;
  perfect: boolean;
  /** Standard wurde gekürzt, weil die volle Rotation zu lange dauern würde */
  capped: boolean;
}

/**
 * Standard-Rundenzahl:
 * 1. Geht die volle Rotation auf (ganzzahlig, alle gleich oft) → genau die.
 * 2. Sonst die nächstgelegene Rundenzahl, bei der alle gleich oft spielen
 *    (bei Gleichstand die kürzere).
 * 3. Dauert das geschätzt länger als 3 h → die längste faire Rundenzahl darunter.
 */
export function classicDefaultRounds(players: number, courts: number, points: number, t: ClassicTimes): ClassicDefault {
  const full = fullRotationRounds(players, courts);
  const step = fairStep(players, courts);
  const perfect = perfectRotationPossible(players, courts);
  if (full <= 0) return { rounds: 1, fullRotation: 0, perfect: false, capped: false };

  let rounds: number;
  if (perfect) rounds = full;
  else {
    const lower = Math.max(step, Math.floor(full / step) * step);
    const upper = Math.ceil(full / step) * step;
    rounds = full - lower <= upper - full ? lower : upper;
  }

  let capped = false;
  if (estimateClassicMinutes(rounds, points, t) > CLASSIC_DEFAULT_MAX_MINUTES) {
    let r = Math.floor(rounds / step) * step;
    while (r > step && estimateClassicMinutes(r, points, t) > CLASSIC_DEFAULT_MAX_MINUTES) r -= step;
    rounds = Math.max(step, r);
    capped = true;
  }
  return { rounds: Math.min(CLASSIC_MAX_ROUNDS, rounds), fullRotation: full, perfect, capped };
}

/** Rundenplan für den klassischen Modus (gleiche Struktur wie im Zeit-Modus). */
export function describeClassic(players: number, courts: number, rounds: number, points: number): RoundPlan {
  const a = activeCourts(players, courts);
  const slots = rounds * 4 * a;
  const minMatches = Math.floor(slots / players);
  const extra = slots % players;
  return {
    players,
    activeCourts: a,
    rounds,
    roundMinutes: Math.round(classicMatchMinutes(points) * 2) / 2,
    netMinutes: 0,
    bufferMinutes: 0,
    sittingPerRound: players - 4 * a,
    minMatches,
    maxMatches: extra === 0 ? minMatches : minMatches + 1,
    playersWithMax: extra === 0 ? players : extra,
    playersWithMin: extra === 0 ? players : players - extra,
    fair: extra === 0,
    inRange: true,
  };
}

export interface ServeRule {
  /** Aufschlagwechsel alle k Punkte */
  every: number;
  /** Wie oft jeder der 4 Spieler aufschlägt (min/max) */
  minTurns: number;
  maxTurns: number;
  /** Alle schlagen exakt gleich oft auf */
  exact: boolean;
}

/**
 * Aufschlag: Wechsel alle k Punkte, k = S ÷ 8 → 8 Aufschlagdurchgänge, jeder der
 * vier schlägt genau zweimal auf (16 → 2, 24 → 3, 32 → 4). Geht S ÷ 8 nicht auf
 * (z. B. 21), nimmt die Regel k = S ÷ 8 gerundet (21 → 3: 7 Durchgänge, einer
 * schlägt einmal weniger auf).
 */
export function serveRule(points: number): ServeRule {
  const every = Math.max(1, Math.round(points / 8));
  const turns = Math.ceil(points / every);
  const minTurns = Math.floor(turns / 4);
  const maxTurns = Math.ceil(turns / 4);
  return { every, minTurns, maxTurns, exact: points % every === 0 && turns % 4 === 0 };
}

/** Klassisches Ergebnis aus den Punkten von Team A: Team B bekommt den Rest bis S. */
export function classicScore(pointsA: number, total: number): { a: number; b: number } {
  const a = Math.max(0, Math.min(total, Math.round(pointsA)));
  return { a, b: total - a };
}
