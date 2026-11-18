/**
 * Zeit- und Rundenberechnung.
 *
 * Netto-Spielzeit = Gesamtdauer − Einspielzeit − (R − 1) × Wechselzeit
 * Rundenlänge     = Netto / R, abgerundet auf halbe Minuten (der Rest ist Puffer)
 */

export const MIN_ROUND_MINUTES = 8;
export const MAX_ROUND_MINUTES = 20;
const MAX_ROUNDS = 40;

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 12;
export const COURT_OPTIONS = [1, 2, 3];
/** 60 bis 240 Minuten in 30-Minuten-Schritten */
export const DURATION_OPTIONS = [60, 90, 120, 150, 180, 210, 240];

export interface TimeSettings {
  totalMinutes: number;
  warmupMinutes: number;
  changeMinutes: number;
}

export interface RoundPlan {
  players: number;
  activeCourts: number;
  rounds: number;
  roundMinutes: number;
  /** Netto-Spielzeit (vor dem Runden der Rundenlänge) */
  netMinutes: number;
  /** Ungenutzte Minuten durch das Abrunden der Rundenlänge */
  bufferMinutes: number;
  sittingPerRound: number;
  /** Matches pro Spieler: min/max und wie viele Spieler jeweils */
  minMatches: number;
  maxMatches: number;
  playersWithMax: number;
  playersWithMin: number;
  /** Jeder spielt exakt gleich oft */
  fair: boolean;
  /** Rundenlänge liegt im Bereich 8–20 Min. */
  inRange: boolean;
}

export function activeCourts(players: number, courts: number): number {
  return Math.max(0, Math.min(courts, Math.floor(players / 4)));
}

export function rawRoundLength(rounds: number, t: TimeSettings): number {
  const net = t.totalMinutes - t.warmupMinutes - (rounds - 1) * t.changeMinutes;
  return net / rounds;
}

export function floorToHalf(x: number): number {
  return Math.floor(x * 2 + 1e-9) / 2;
}

export function describeRounds(players: number, courts: number, rounds: number, t: TimeSettings): RoundPlan {
  const a = activeCourts(players, courts);
  const raw = rawRoundLength(rounds, t);
  const roundMinutes = Math.max(0, floorToHalf(raw));
  const net = t.totalMinutes - t.warmupMinutes - (rounds - 1) * t.changeMinutes;
  const slots = rounds * 4 * a;
  const minMatches = Math.floor(slots / players);
  const extra = slots % players; // so viele Spieler haben ein Match mehr
  return {
    players,
    activeCourts: a,
    rounds,
    roundMinutes,
    netMinutes: net,
    bufferMinutes: Math.round((net - rounds * roundMinutes) * 10) / 10,
    sittingPerRound: players - 4 * a,
    minMatches,
    maxMatches: extra === 0 ? minMatches : minMatches + 1,
    playersWithMax: extra === 0 ? players : extra,
    playersWithMin: extra === 0 ? players : players - extra,
    fair: extra === 0,
    inRange: raw >= MIN_ROUND_MINUTES - 1e-9 && raw <= MAX_ROUND_MINUTES + 1e-9,
  };
}

/**
 * Wählt die Rundenzahl.
 *
 * 1. Kandidaten: faire Rundenzahl (alle gleich viele Matches) mit Rundenlänge 8–20 Min.
 *    Unter diesen gewinnt (lexikographisch):
 *      a) mehr mögliche verschiedene Partner pro Spieler  = min(Matches, Spieler − 1)
 *      b) Partner können exakt gleich oft rotieren       (Matches durch (Spieler − 1) teilbar)
 *      c) mehr Runden (mehr Rotation, solange ≥ 8 Min.)
 * 2. Gibt es keine faire Lösung: Rundenlänge 8–20 Min. mit möglichst wenigen
 *    „benachteiligten“ Spielern, dann mehr Runden.
 * 3. Notfall (z. B. sehr kurze Gesamtdauer): Rundenlänge möglichst nah am Bereich.
 */
export function chooseRounds(players: number, courts: number, t: TimeSettings): RoundPlan {
  const all: RoundPlan[] = [];
  for (let r = 1; r <= MAX_ROUNDS; r++) {
    if (rawRoundLength(r, t) <= 0) break;
    all.push(describeRounds(players, courts, r, t));
  }
  if (all.length === 0 || activeCourts(players, courts) === 0) {
    return describeRounds(players, courts, 1, t);
  }

  const fairInRange = all.filter((p) => p.fair && p.inRange);
  if (fairInRange.length > 0) {
    const key = (p: RoundPlan) => [
      Math.min(p.minMatches, players - 1),
      p.minMatches > 0 && p.minMatches % (players - 1) === 0 ? 1 : 0,
      p.rounds,
    ];
    return best(fairInRange, key);
  }

  const inRange = all.filter((p) => p.inRange);
  if (inRange.length > 0) {
    // Weniger betroffene Spieler ist besser (negiert), dann mehr Runden.
    return best(inRange, (p) => [-Math.min(p.playersWithMin, p.playersWithMax), p.rounds]);
  }

  // Notfall: Abstand zum Bereich minimieren, faire Lösungen bevorzugen.
  const dist = (p: RoundPlan) => {
    const raw = rawRoundLength(p.rounds, t);
    return raw < MIN_ROUND_MINUTES ? MIN_ROUND_MINUTES - raw : raw - MAX_ROUND_MINUTES;
  };
  return best(all, (p) => [-Math.round(dist(p) * 100), p.fair ? 1 : 0, p.rounds]);
}

function best<T>(items: T[], key: (x: T) => number[]): T {
  let bestItem = items[0];
  let bestKey = key(bestItem);
  for (const it of items.slice(1)) {
    const k = key(it);
    for (let i = 0; i < k.length; i++) {
      if (k[i] > bestKey[i]) {
        bestItem = it;
        bestKey = k;
        break;
      }
      if (k[i] < bestKey[i]) break;
    }
  }
  return bestItem;
}
