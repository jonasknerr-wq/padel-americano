/**
 * Spielplan-Generator.
 *
 * Darstellung: pro Runde eine Permutation der Spieler-Indizes. Positionen
 * 0..4A−1 spielen (Platz c = Positionen 4c..4c+3, Team A = 4c/4c+1,
 * Team B = 4c+2/4c+3), der Rest setzt aus.
 *
 * Optimierung: Simulated Annealing (Tausch zweier Positionen innerhalb einer
 * Runde) mit gewichteter Kostenfunktion und mehreren Neustarts. Alles läuft
 * über einen Seed-basierten PRNG → bei gleichem Seed identischer Plan.
 *
 * Kostenfunktion (Gewichte so gewählt, dass die Prioritäten praktisch
 * lexikographisch greifen):
 *   1. Σ Aussetzer²            (gleichmäßige Aussetzer)
 *   2. Σ Matches gesamt²       (nur bei Neuplanung relevant: inkl. Historie)
 *   3. # Doppel-Aussetzer      (zweimal hintereinander aussetzen)
 *   4. Σ Partnerzählungen²     (Partner-Wiederholungen)
 *   5. Σ Gegnerzählungen²      (Gegner-Wiederholungen)
 *
 * Für 8 Spieler auf 2 Plätzen gibt es zusätzlich eine direkte Konstruktion
 * (Kreismethode / 1-Faktorisierung von K8): in den ersten 7 Runden spielt
 * garantiert jeder genau einmal mit jedem zusammen.
 */
import { createRng, randInt, shuffle } from './rng';
import { activeCourts } from './rounds';
import type { Match, PlayerId, Round } from './types';

export interface Weights {
  sit: number;
  total: number;
  consecutive: number;
  partner: number;
  opponent: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  sit: 1e8,
  total: 1e6,
  // Ein Doppel-Aussetzer „kostet“ etwa 1,5 Partner-Wiederholungen. Damit wird er
  // überall vermieden – außer bei 8 Spielern auf 1 Platz, wo strikte Vermeidung
  // zwei feste 4er-Gruppen erzwingen würde, die nie miteinander spielen.
  consecutive: 300,
  partner: 100,
  opponent: 1,
};

export interface ScheduleOptions {
  /** Spieler, die in den zu planenden Runden verfügbar sind */
  players: PlayerId[];
  /** Anzahl zu planender Runden */
  rounds: number;
  /** Verfügbare Plätze (aktive Plätze werden daraus berechnet) */
  courts: number;
  seed: number;
  /** Bereits gespielte Runden (für Neuplanung) */
  history?: Round[];
  weights?: Partial<Weights>;
  restarts?: number;
  iterations?: number;
}

interface Ctx {
  n: number;
  a: number; // aktive Plätze
  play: number; // 4a
  rounds: number;
  w: Weights;
  partnerHist: Int32Array; // n*n
  oppHist: Int32Array;
  pastMatches: Int32Array;
  lastSat: Uint8Array;
}

export function generateSchedule(opts: ScheduleOptions): Round[] {
  const { players, rounds } = opts;
  const n = players.length;
  const a = activeCourts(n, opts.courts);
  if (rounds <= 0 || a === 0) return [];

  const ctx = buildContext(opts, a);
  const rng = createRng(opts.seed);
  const restarts = opts.restarts ?? 8;
  const iterations = opts.iterations ?? Math.max(4000, 1500 * rounds);

  let best: Int32Array[] | null = null;
  let bestCost = Infinity;

  // Garantierte Konstruktion für 8 Spieler auf 2 Plätzen (nur ohne Historie)
  if (n === 8 && a === 2 && !(opts.history && opts.history.length)) {
    const constructed = constructEight(rounds, ctx, rng);
    best = constructed;
    bestCost = cost(constructed, ctx);
  }

  for (let s = 0; s < restarts; s++) {
    const { state, c } = anneal(ctx, rng, iterations);
    if (c < bestCost) {
      bestCost = c;
      best = state;
    }
  }

  return toRounds(best!, players, ctx);
}

/** Restplan neu berechnen (Ausfall / Nachzügler). Gespielte Runden bleiben. */
export function replan(opts: {
  rounds: Round[];
  fromRound: number;
  players: PlayerId[];
  courts: number;
  seed: number;
  weights?: Partial<Weights>;
}): Round[] {
  const kept = opts.rounds.slice(0, opts.fromRound);
  const remaining = opts.rounds.length - opts.fromRound;
  if (opts.players.length < 4 || remaining <= 0) return kept;
  const fresh = generateSchedule({
    players: opts.players,
    rounds: remaining,
    courts: opts.courts,
    seed: opts.seed,
    history: kept,
    weights: opts.weights,
  });
  return kept.concat(fresh);
}

// ---------------------------------------------------------------------------

function buildContext(opts: ScheduleOptions, a: number): Ctx {
  const n = opts.players.length;
  const idx = new Map(opts.players.map((p, i) => [p, i]));
  const partnerHist = new Int32Array(n * n);
  const oppHist = new Int32Array(n * n);
  const pastMatches = new Int32Array(n);
  const lastSat = new Uint8Array(n);
  const hist = opts.history ?? [];
  const add = (arr: Int32Array, x: PlayerId, y: PlayerId) => {
    const i = idx.get(x);
    const j = idx.get(y);
    if (i === undefined || j === undefined) return;
    arr[i * n + j]++;
    arr[j * n + i]++;
  };
  for (const r of hist) {
    for (const m of r.matches) {
      add(partnerHist, m.teamA[0], m.teamA[1]);
      add(partnerHist, m.teamB[0], m.teamB[1]);
      for (const x of m.teamA) for (const y of m.teamB) add(oppHist, x, y);
      for (const p of [...m.teamA, ...m.teamB]) {
        const i = idx.get(p);
        if (i !== undefined) pastMatches[i]++;
      }
    }
  }
  if (hist.length) {
    for (const p of hist[hist.length - 1].sitting) {
      const i = idx.get(p);
      if (i !== undefined) lastSat[i] = 1;
    }
  }
  return {
    n,
    a,
    play: 4 * a,
    rounds: opts.rounds,
    w: { ...DEFAULT_WEIGHTS, ...opts.weights },
    partnerHist,
    oppHist,
    pastMatches,
    lastSat,
  };
}

// Puffer, damit die Kostenfunktion nicht bei jedem Aufruf neu alloziert.
let bufP = new Int32Array(0);
let bufO = new Int32Array(0);

function cost(state: Int32Array[], ctx: Ctx): number {
  const { n, play, w } = ctx;
  if (bufP.length !== n * n) {
    bufP = new Int32Array(n * n);
    bufO = new Int32Array(n * n);
  }
  const partner = bufP;
  const opp = bufO;
  partner.set(ctx.partnerHist);
  opp.set(ctx.oppHist);
  const sit = new Int32Array(n);
  const matches = Int32Array.from(ctx.pastMatches);
  let prev = ctx.lastSat;
  let consec = 0;

  for (const perm of state) {
    const cur = new Uint8Array(n);
    for (let k = play; k < n; k++) {
      const p = perm[k];
      sit[p]++;
      cur[p] = 1;
      if (prev[p]) consec++;
    }
    for (let k = 0; k < play; k += 4) {
      const p0 = perm[k], p1 = perm[k + 1], p2 = perm[k + 2], p3 = perm[k + 3];
      partner[p0 * n + p1]++;
      partner[p1 * n + p0]++;
      partner[p2 * n + p3]++;
      partner[p3 * n + p2]++;
      opp[p0 * n + p2]++; opp[p2 * n + p0]++;
      opp[p0 * n + p3]++; opp[p3 * n + p0]++;
      opp[p1 * n + p2]++; opp[p2 * n + p1]++;
      opp[p1 * n + p3]++; opp[p3 * n + p1]++;
      matches[p0]++; matches[p1]++; matches[p2]++; matches[p3]++;
    }
    prev = cur;
  }

  let sSit = 0, sTot = 0, sP = 0, sO = 0;
  for (let i = 0; i < n; i++) {
    sSit += sit[i] * sit[i];
    sTot += matches[i] * matches[i];
    for (let j = i + 1; j < n; j++) {
      const pc = partner[i * n + j];
      const oc = opp[i * n + j];
      sP += pc * pc;
      sO += oc * oc;
    }
  }
  return w.sit * sSit + w.total * sTot + w.consecutive * consec + w.partner * sP + w.opponent * sO;
}

function initialState(ctx: Ctx, rng: () => number): Int32Array[] {
  const { n, play, rounds } = ctx;
  const s = n - play;
  const order = shuffle([...Array(n).keys()], rng);
  const state: Int32Array[] = [];
  for (let r = 0; r < rounds; r++) {
    const sitters = new Set<number>();
    for (let j = 0; j < s; j++) sitters.add(order[(r * s + j) % n]);
    const playing = shuffle(order.filter((p) => !sitters.has(p)), rng);
    state.push(Int32Array.from([...playing, ...sitters]));
  }
  return state;
}

function anneal(ctx: Ctx, rng: () => number, iterations: number) {
  const { n, play, rounds } = ctx;
  const state = initialState(ctx, rng);
  let c = cost(state, ctx);
  let best = state.map((p) => p.slice());
  let bestCost = c;
  const t0 = 400;
  const t1 = 0.2;
  const hasSitters = play < n;
  for (let it = 0; it < iterations; it++) {
    const temp = t0 * Math.pow(t1 / t0, it / iterations);
    const r = randInt(rng, rounds);
    const i = randInt(rng, n);
    const j = randInt(rng, n);
    if (i === j) continue;
    if (i >= play && j >= play) continue; // beide setzen aus
    if (i < play && j < play && i >> 1 === j >> 1) continue; // gleiches Team

    // Zug 1: Tausch zweier Positionen in Runde r.
    // Zug 2 (Doppeltausch): tauscht Spieler X (spielt) und Y (setzt aus) in Runde r
    // UND in einer zweiten Runde mit umgekehrter Rolle. Die Aussetzer-Zahlen
    // bleiben so ausgeglichen – nötig, um aus „festen Gruppen“ herauszukommen.
    const swaps: [number, number, number][] = [[r, i, j]];
    if (hasSitters && rounds > 1 && (i < play) !== (j < play) && rng() < 0.5) {
      const perm = state[r];
      const x = perm[i < play ? i : j]; // spielt in r
      const y = perm[i < play ? j : i]; // setzt aus in r
      const r2 = randInt(rng, rounds);
      if (r2 !== r) {
        const p2 = state[r2];
        const ix = p2.indexOf(x);
        const iy = p2.indexOf(y);
        if (ix >= play && iy < play) swaps.push([r2, ix, iy]);
      }
    }
    for (const [rr, a, b] of swaps) {
      const p = state[rr];
      [p[a], p[b]] = [p[b], p[a]];
    }
    const nc = cost(state, ctx);
    const d = nc - c;
    if (d <= 0 || rng() < Math.exp(-d / temp)) {
      c = nc;
      if (c < bestCost) {
        bestCost = c;
        best = state.map((p) => p.slice());
      }
    } else {
      for (let k = swaps.length - 1; k >= 0; k--) {
        const [rr, a, b] = swaps[k];
        const p = state[rr];
        [p[a], p[b]] = [p[b], p[a]];
      }
    }
  }
  return { state: best, c: bestCost };
}

/**
 * 8 Spieler / 2 Plätze: Kreismethode. Spieler 7 bleibt fix, 0..6 rotieren.
 * Runde k: Paare (7,k) und ((k+i) mod 7, (k−i) mod 7) für i = 1..3.
 * Das ist eine 1-Faktorisierung von K8 → nach 7 Runden hatte jeder jeden
 * genau einmal als Partner. Die Aufteilung der 4 Paare auf 2 Plätze
 * (3 Möglichkeiten je Runde) wird so gewählt, dass Gegner möglichst gut
 * rotieren (erschöpfend bis 8 Runden, sonst Runde für Runde).
 */
function constructEight(rounds: number, ctx: Ctx, rng: () => number): Int32Array[] {
  const label = shuffle([...Array(8).keys()], rng);
  let best: Int32Array[] = [];
  let bestCost = Infinity;
  for (const starter of startersZ7()) {
    const cand = splitFactors(starter, rounds, ctx, label);
    const c = cost(cand, ctx);
    if (c < bestCost) {
      bestCost = c;
      best = cand;
    }
  }
  return best;
}

/**
 * Alle „Starter“ von Z7: Zerlegungen von {1..6} in 3 Paare, deren Differenzen
 * (±1, ±2, ±3) je genau einmal vorkommen. Zusammen mit dem Paar (∞, 0) und
 * zyklischem Verschieben ergibt jeder Starter eine 1-Faktorisierung von K8.
 */
function startersZ7(): [number, number][][] {
  const out: [number, number][][] = [];
  const rec = (rest: number[], acc: [number, number][]) => {
    if (rest.length === 0) {
      const diffs = acc.map(([x, y]) => Math.min((y - x + 7) % 7, (x - y + 7) % 7)).sort();
      if (diffs.join() === '1,2,3') out.push(acc);
      return;
    }
    const [x, ...others] = rest;
    for (let k = 0; k < others.length; k++) {
      rec(others.filter((_, i) => i !== k), [...acc, [x, others[k]]]);
    }
  };
  rec([1, 2, 3, 4, 5, 6], []);
  return out;
}

function splitFactors(starter: [number, number][], rounds: number, ctx: Ctx, label: number[]): Int32Array[] {
  const factors: [number, number][][] = [];
  for (let r = 0; r < rounds; r++) {
    const k = r % 7;
    const pairs: [number, number][] = [[7, k], ...starter.map(([x, y]) => [(x + k) % 7, (y + k) % 7] as [number, number])];
    factors.push(pairs.map(([x, y]) => [label[x], label[y]]));
  }
  const splits = [
    [0, 1, 2, 3],
    [0, 2, 1, 3],
    [0, 3, 1, 2],
  ];
  const build = (choice: number[]) =>
    factors.map((pairs, r) => {
      const sp = splits[choice[r]];
      const out: number[] = [];
      for (const pi of sp) out.push(...pairs[pi]);
      return Int32Array.from(out);
    });

  const choice = new Array(rounds).fill(0);
  if (rounds <= 8) {
    let bestChoice = choice.slice();
    let bestCost = Infinity;
    const total = 3 ** rounds;
    for (let code = 0; code < total; code++) {
      let x = code;
      for (let r = 0; r < rounds; r++) {
        choice[r] = x % 3;
        x = Math.floor(x / 3);
      }
      const c = cost(build(choice), ctx);
      if (c < bestCost) {
        bestCost = c;
        bestChoice = choice.slice();
      }
    }
    return build(bestChoice);
  }
  for (let r = 0; r < rounds; r++) {
    let bestS = 0;
    let bestCost = Infinity;
    for (let s = 0; s < 3; s++) {
      choice[r] = s;
      const c = cost(build(choice).slice(0, r + 1), { ...ctx, rounds: r + 1 });
      if (c < bestCost) {
        bestCost = c;
        bestS = s;
      }
    }
    choice[r] = bestS;
  }
  return build(choice);
}

function toRounds(state: Int32Array[], players: PlayerId[], ctx: Ctx): Round[] {
  return state.map((perm) => {
    const matches: Match[] = [];
    for (let c = 0; c < ctx.a; c++) {
      const k = 4 * c;
      matches.push({
        court: c,
        teamA: [players[perm[k]], players[perm[k + 1]]],
        teamB: [players[perm[k + 2]], players[perm[k + 3]]],
      });
    }
    const sitIdx = Array.from(perm.slice(ctx.play)).sort((x, y) => x - y);
    return { matches, sitting: sitIdx.map((i) => players[i]) };
  });
}

// ---------------------------------------------------------------------------
// Auswertung eines Plans (für Vorschau und Tests)

export interface ScheduleStats {
  matches: Record<PlayerId, number>;
  sits: Record<PlayerId, number>;
  /** Wie oft zwei Spieler Partner waren, Schlüssel "a|b" (sortiert) */
  partner: Record<string, number>;
  opponent: Record<string, number>;
  distinctPartners: Record<PlayerId, number>;
  consecutiveSits: number;
  maxPartnerCount: number;
  maxOpponentCount: number;
}

export function pairKey(a: PlayerId, b: PlayerId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function scheduleStats(rounds: Round[], players: PlayerId[]): ScheduleStats {
  const matches: Record<string, number> = {};
  const sits: Record<string, number> = {};
  const partner: Record<string, number> = {};
  const opponent: Record<string, number> = {};
  for (const p of players) {
    matches[p] = 0;
    sits[p] = 0;
  }
  let consecutiveSits = 0;
  let prev = new Set<PlayerId>();
  for (const r of rounds) {
    for (const m of r.matches) {
      for (const p of [...m.teamA, ...m.teamB]) matches[p] = (matches[p] ?? 0) + 1;
      const pk1 = pairKey(m.teamA[0], m.teamA[1]);
      const pk2 = pairKey(m.teamB[0], m.teamB[1]);
      partner[pk1] = (partner[pk1] ?? 0) + 1;
      partner[pk2] = (partner[pk2] ?? 0) + 1;
      for (const x of m.teamA)
        for (const y of m.teamB) {
          const k = pairKey(x, y);
          opponent[k] = (opponent[k] ?? 0) + 1;
        }
    }
    for (const p of r.sitting) {
      sits[p] = (sits[p] ?? 0) + 1;
      if (prev.has(p)) consecutiveSits++;
    }
    prev = new Set(r.sitting);
  }
  const distinctPartners: Record<string, number> = {};
  for (const p of players) distinctPartners[p] = 0;
  for (const k of Object.keys(partner)) {
    const [x, y] = k.split('|');
    if (x in distinctPartners) distinctPartners[x]++;
    if (y in distinctPartners) distinctPartners[y]++;
  }
  return {
    matches,
    sits,
    partner,
    opponent,
    distinctPartners,
    consecutiveSits,
    maxPartnerCount: Math.max(0, ...Object.values(partner)),
    maxOpponentCount: Math.max(0, ...Object.values(opponent)),
  };
}
