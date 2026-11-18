/**
 * Spielplan-Generator.
 *
 * Darstellung: pro Runde eine Permutation der Spieler-Indizes. Positionen
 * 0..4A−1 spielen (Platz c = Positionen 4c..4c+3, Team A = 4c/4c+1,
 * Team B = 4c+2/4c+3), der Rest setzt aus.
 *
 * Optimierung: Simulated Annealing (Tausch zweier Positionen innerhalb einer
 * Runde) mit gewichteter Kostenfunktion und mehreren Neustarts. Die Kosten
 * werden inkrementell gepflegt: ein Zug rechnet nur die betroffenen Plätze
 * und Aussetzer neu (konstanter Aufwand statt kompletter Neuberechnung).
 * Alles läuft über einen Seed-basierten PRNG → bei gleichem Seed identischer Plan.
 *
 * Kostenfunktion (Gewichte so gewählt, dass die Prioritäten praktisch
 * lexikographisch greifen):
 *   1. Σ Aussetzer²            (gleichmäßige Aussetzer)
 *   2. Σ Matches gesamt²       (nur bei Neuplanung relevant: inkl. Historie)
 *   3. # Doppel-Aussetzer      (zweimal hintereinander aussetzen)
 *   4. Σ Partnerzählungen²     (Partner-Wiederholungen)
 *   5. Σ Gegnerzählungen²      (Gegner-Wiederholungen)
 *
 * Wenn niemand aussetzt und die Spielerzahl 8 oder 12 ist (2 bzw. 3 Plätze),
 * gibt es zusätzlich eine direkte Konstruktion (Kreismethode /
 * 1-Faktorisierung): in den ersten N−1 Runden spielt garantiert jeder genau
 * einmal mit jedem zusammen.
 */
import { createRng, randInt, shuffle } from './rng';
import { activeCourts } from './rounds';
import type { Match, PlayerId, Round } from './types';

export interface Weights {
  sit: number;
  total: number;
  consecutive: number;
  /** je (Abstand − Idealabstand)² zwischen zwei Pausen eines Spielers */
  spacing: number;
  partner: number;
  opponent: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  sit: 1e8,
  total: 1e6,
  // Ein Doppel-Aussetzer ist teurer als jede Abstands- oder Partnerfrage und wird
  // vermieden, wo es geht. Ausnahme: siehe HALF_SITTING_CONSECUTIVE.
  consecutive: 1000,
  // Pausen zeitlich gleichmäßig: 1 Runde daneben kostet 30, 2 Runden 120, 3 Runden 270.
  // Eine zusätzliche Partner-Wiederholung kostet netto ~200 – sie lohnt sich also
  // nur, um echte Häufungen (≥ 2 Runden daneben) aufzulösen.
  spacing: 30,
  partner: 100,
  opponent: 1,
};

/**
 * Setzt genau die Hälfte aus (8 Spieler auf 1 Platz), würde strikte Vermeidung von
 * Doppel-Aussetzern zwei feste 4er-Gruppen erzwingen, die nie miteinander spielen.
 * Dort bleibt der Doppel-Aussetzer deshalb günstiger als eine Partner-Wiederholung.
 */
const HALF_SITTING_CONSECUTIVE = 300;

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
  /** Runden seit der letzten Pause in der Historie (1 = in der letzten gespielten Runde), 0 = keine */
  sinceSat: Int32Array;
}

export function generateSchedule(opts: ScheduleOptions): Round[] {
  const { players, rounds } = opts;
  const n = players.length;
  const a = activeCourts(n, opts.courts);
  if (rounds <= 0 || a === 0) return [];

  const ctx = buildContext(opts, a);
  const rng = createRng(opts.seed);
  // Mit Aussetzern ist die Suche schwieriger (Aussetzer-Reihenfolge + Partner) → mehr Schritte.
  const iterations = opts.iterations ?? (4 * a < n ? Math.max(15000, 3000 * rounds) : Math.max(15000, 2500 * rounds));
  let restarts = opts.restarts ?? 4;

  let best: Int32Array[] | null = null;
  let bestCost = Infinity;

  // Garantierte Konstruktion für 8 Spieler / 2 Plätze und 12 Spieler / 3 Plätze (nur ohne Historie).
  // Sie ist bereits optimal bei den Partnern; die Suche läuft dann nur noch kurz zum Vergleich.
  if ((n === 8 || n === 12) && 4 * a === n && !(opts.history && opts.history.length)) {
    const constructed = constructCircle(rounds, ctx, rng);
    best = constructed;
    bestCost = new Search(ctx, constructed).cost();
    restarts = opts.restarts ?? 1;
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
  // Letzte Pause jedes Spielers vor dem Neuplanungszeitpunkt
  const sinceSat = new Int32Array(n);
  hist.forEach((r, h) => {
    for (const p of r.sitting) {
      const i = idx.get(p);
      if (i !== undefined) sinceSat[i] = hist.length - h;
    }
  });
  for (let i = 0; i < n; i++) lastSat[i] = sinceSat[i] === 1 ? 1 : 0;

  const w = { ...DEFAULT_WEIGHTS, ...opts.weights };
  if (opts.weights?.consecutive === undefined && 2 * (n - 4 * a) === n) w.consecutive = HALF_SITTING_CONSECUTIVE;
  return {
    n,
    a,
    play: 4 * a,
    rounds: opts.rounds,
    w,
    partnerHist,
    oppHist,
    pastMatches,
    lastSat,
    sinceSat,
  };
}

/**
 * Zustand eines Plans mit inkrementell gepflegten Kostenanteilen.
 * `swap` tauscht zwei Positionen einer Runde und aktualisiert nur, was sich
 * dadurch ändert. Ein zweiter gleicher `swap` macht den Zug rückgängig.
 */
class Search {
  readonly perm: Int32Array[];
  private readonly n: number;
  private readonly play: number;
  private readonly rounds: number;
  private readonly w: Weights;
  private readonly lastSat: Uint8Array;
  private readonly sinceSat: Int32Array;
  private readonly sitAt: Uint8Array; // rounds*n
  private readonly spacingOf: Float64Array; // Abstandskosten je Spieler
  private readonly partner: Int32Array;
  private readonly opp: Int32Array;
  private readonly sit: Int32Array;
  private readonly matches: Int32Array;
  private sSit = 0;
  private sTot = 0;
  private sP = 0;
  private sO = 0;
  private consec = 0;
  private sSpace = 0;

  constructor(ctx: Ctx, state: Int32Array[]) {
    const { n } = ctx;
    this.n = n;
    this.play = ctx.play;
    this.rounds = state.length;
    this.w = ctx.w;
    this.lastSat = ctx.lastSat;
    this.sinceSat = ctx.sinceSat;
    this.perm = state;
    this.sitAt = new Uint8Array(state.length * n);
    this.spacingOf = new Float64Array(n);
    this.partner = Int32Array.from(ctx.partnerHist);
    this.opp = Int32Array.from(ctx.oppHist);
    this.sit = new Int32Array(n);
    this.matches = Int32Array.from(ctx.pastMatches);
    for (let i = 0; i < n; i++) {
      this.sTot += this.matches[i] * this.matches[i];
      for (let j = i + 1; j < n; j++) {
        this.sP += this.partner[i * n + j] ** 2;
        this.sO += this.opp[i * n + j] ** 2;
      }
    }
    for (let r = 0; r < state.length; r++) {
      for (let k = 0; k < this.play; k += 4) this.court(r, k, 1);
      for (let k = this.play; k < n; k++) this.setSit(r, state[r][k], 1);
    }
  }

  cost(): number {
    const w = this.w;
    return (
      w.sit * this.sSit +
      w.total * this.sTot +
      w.consecutive * this.consec +
      w.spacing * this.sSpace +
      w.partner * this.sP +
      w.opponent * this.sO
    );
  }

  swap(r: number, i: number, j: number): void {
    const play = this.play;
    const perm = this.perm[r];
    const ci = i < play ? i & ~3 : -1;
    const cj = j < play ? j & ~3 : -1;
    if (ci >= 0) this.court(r, ci, -1);
    if (cj >= 0 && cj !== ci) this.court(r, cj, -1);
    const x = perm[i];
    const y = perm[j];
    perm[i] = y;
    perm[j] = x;
    if (ci >= 0) this.court(r, ci, 1);
    if (cj >= 0 && cj !== ci) this.court(r, cj, 1);
    if (i < play !== j < play) {
      this.setSit(r, x, j >= play ? 1 : 0);
      this.setSit(r, y, i >= play ? 1 : 0);
    }
  }

  /** Runde r komplett ersetzen (nur für Pläne ohne Aussetzer: Plätze werden neu gezählt). */
  replaceRound(r: number, next: Int32Array): void {
    for (let k = 0; k < this.play; k += 4) this.court(r, k, -1);
    this.perm[r] = next;
    for (let k = 0; k < this.play; k += 4) this.court(r, k, 1);
  }

  /** Beiträge des Platzes ab Position k in Runde r hinzufügen (d=1) oder entfernen (d=−1). */
  private court(r: number, k: number, d: number): void {
    const perm = this.perm[r];
    const p0 = perm[k], p1 = perm[k + 1], p2 = perm[k + 2], p3 = perm[k + 3];
    this.pair(this.partner, p0, p1, d, true);
    this.pair(this.partner, p2, p3, d, true);
    this.pair(this.opp, p0, p2, d, false);
    this.pair(this.opp, p0, p3, d, false);
    this.pair(this.opp, p1, p2, d, false);
    this.pair(this.opp, p1, p3, d, false);
    const m = this.matches;
    this.sTot += d * (2 * m[p0] + d) + d * (2 * m[p1] + d) + d * (2 * m[p2] + d) + d * (2 * m[p3] + d);
    m[p0] += d;
    m[p1] += d;
    m[p2] += d;
    m[p3] += d;
  }

  private pair(arr: Int32Array, a: number, b: number, d: number, isPartner: boolean): void {
    const k = a * this.n + b;
    const c = arr[k];
    const delta = d * (2 * c + d); // (c+d)² − c²
    if (isPartner) this.sP += delta;
    else this.sO += delta;
    arr[k] = c + d;
    arr[b * this.n + a] = c + d;
  }

  private setSit(r: number, p: number, v: number): void {
    const n = this.n;
    const old = this.sitAt[r * n + p];
    if (old === v) return;
    const d = v - old;
    const before = r === 0 ? this.lastSat[p] : this.sitAt[(r - 1) * n + p];
    const after = r + 1 < this.rounds ? this.sitAt[(r + 1) * n + p] : 0;
    this.consec += d * (before + after);
    const s = this.sit[p];
    this.sSit += d * (2 * s + d);
    this.sit[p] = s + d;
    this.sitAt[r * n + p] = v;
    const sp = this.spacing(p);
    this.sSpace += sp - this.spacingOf[p];
    this.spacingOf[p] = sp;
  }

  /**
   * Wie gleichmäßig liegen die Pausen von Spieler p? Idealabstand g = Runden / Pausen.
   * Strafe = Σ (Abstand − g)² über alle Abstände zwischen zwei Pausen. Anfang und Ende
   * zählen als halber Abstand (Ziel (g+1)/2), damit sich Pausen nicht am Rand häufen.
   * Gab es vor einer Neuplanung schon eine Pause, zählt der Abstand zu ihr als voller Abstand.
   */
  private spacing(p: number): number {
    const n = this.n;
    const R = this.rounds;
    const k = this.sit[p];
    if (k === 0) return 0;
    const g = R / k;
    const edge = (g + 1) / 2;
    let cost = 0;
    let prev = -1;
    for (let r = 0; r < R; r++) {
      if (!this.sitAt[r * n + p]) continue;
      if (prev < 0) {
        const since = this.sinceSat[p];
        cost += since > 0 ? (r + since - g) ** 2 : (r + 1 - edge) ** 2;
      } else cost += (r - prev - g) ** 2;
      prev = r;
    }
    return cost + (R - prev - edge) ** 2;
  }
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
  const search = new Search(ctx, initialState(ctx, rng));
  const state = search.perm;
  let c = search.cost();
  let best = state.map((p) => p.slice());
  let bestCost = c;
  const t0 = 400;
  const t1 = 0.2;
  const hasSitters = play < n;
  const ratio = Math.log(t1 / t0) / iterations;
  // Zwischenspeicher für bis zu zwei Tauschzüge: [runde, i, j] × 2
  const mv = new Int32Array(6);
  for (let it = 0; it < iterations; it++) {
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
    let moves = 1;
    mv[0] = r;
    mv[1] = i;
    mv[2] = j;
    if (hasSitters && rounds > 1 && i < play !== j < play && rng() < 0.5) {
      const perm = state[r];
      const x = perm[i < play ? i : j]; // spielt in r
      const y = perm[i < play ? j : i]; // setzt aus in r
      const r2 = randInt(rng, rounds);
      if (r2 !== r) {
        const p2 = state[r2];
        const ix = p2.indexOf(x);
        const iy = p2.indexOf(y);
        if (ix >= play && iy < play) {
          mv[3] = r2;
          mv[4] = ix;
          mv[5] = iy;
          moves = 2;
        }
      }
    }
    for (let k = 0; k < moves; k++) search.swap(mv[3 * k], mv[3 * k + 1], mv[3 * k + 2]);
    const nc = search.cost();
    const d = nc - c;
    if (d <= 0 || rng() < Math.exp(-d / (t0 * Math.exp(ratio * it)))) {
      c = nc;
      if (c < bestCost) {
        bestCost = c;
        best = state.map((p) => p.slice());
      }
    } else {
      for (let k = moves - 1; k >= 0; k--) search.swap(mv[3 * k], mv[3 * k + 1], mv[3 * k + 2]);
    }
  }
  return { state: best, c: bestCost };
}

/**
 * 8 Spieler / 2 Plätze bzw. 12 Spieler / 3 Plätze: Kreismethode über Z_m (m = N−1).
 * Spieler ∞ = m bleibt fix, 0..m−1 rotieren. Runde k: Paar (∞, k) plus die
 * um k verschobenen Paare eines „Starters“. Jeder Starter ergibt eine
 * 1-Faktorisierung von K_N → nach N−1 Runden hatte jeder jeden genau einmal
 * als Partner. Welche Paare gegeneinander spielen (3 bzw. 15 Möglichkeiten
 * je Runde), wird so gewählt, dass auch die Gegner möglichst gut rotieren.
 */
function constructCircle(rounds: number, ctx: Ctx, rng: () => number): Int32Array[] {
  const n = ctx.n;
  const m = n - 1;
  const label = shuffle([...Array(n).keys()], rng);
  const splits = pairGroupings(n / 2);
  let best: Int32Array[] = [];
  let bestCost = Infinity;
  for (const starter of starters(m)) {
    const factors: number[][] = [];
    for (let r = 0; r < rounds; r++) {
      const k = r % m;
      const pairs = [[m, k], ...starter.map(([x, y]) => [(x + k) % m, (y + k) % m])];
      factors.push(pairs.flatMap(([x, y]) => [label[x], label[y]]));
    }
    const cand = optimizeSplits(factors, splits, ctx, rounds <= 8 && splits.length === 3);
    const c = new Search(ctx, cand).cost();
    if (c < bestCost) {
      bestCost = c;
      best = cand;
    }
  }
  return best;
}

/**
 * Alle „Starter“ von Z_m: Zerlegungen von {1..m−1} in Paare, deren
 * Differenzen (±1 … ±(m−1)/2) je genau einmal vorkommen.
 */
function starters(m: number): [number, number][][] {
  const half = (m - 1) / 2;
  const target = Array.from({ length: half }, (_, i) => i + 1).join();
  const out: [number, number][][] = [];
  const rec = (rest: number[], acc: [number, number][], used: Set<number>) => {
    if (rest.length === 0) {
      const diffs = acc.map(([x, y]) => Math.min((y - x + m) % m, (x - y + m) % m)).sort((p, q) => p - q);
      if (diffs.join() === target) out.push(acc);
      return;
    }
    const [x, ...others] = rest;
    for (let k = 0; k < others.length; k++) {
      const d = Math.min((others[k] - x + m) % m, (x - others[k] + m) % m);
      if (used.has(d)) continue; // Differenz schon vergeben → abschneiden
      used.add(d);
      rec(others.filter((_, i) => i !== k), [...acc, [x, others[k]]], used);
      used.delete(d);
    }
  };
  rec(Array.from({ length: m - 1 }, (_, i) => i + 1), [], new Set());
  return out;
}

/** Alle Aufteilungen von k Paaren (k gerade) in Plätze à 2 Paare, als Reihenfolge der Paar-Indizes. */
function pairGroupings(k: number): number[][] {
  const out: number[][] = [];
  const rec = (rest: number[], acc: number[]) => {
    if (rest.length === 0) return void out.push(acc);
    const [x, ...others] = rest;
    for (let i = 0; i < others.length; i++) rec(others.filter((_, j) => j !== i), [...acc, x, others[i]]);
  };
  rec([...Array(k).keys()], []);
  return out;
}

/**
 * Wählt je Runde die Aufteilung der Paare auf die Plätze.
 * Klein (8 Spieler, ≤ 8 Runden): alle Kombinationen durchprobieren.
 * Sonst: koordinatenweise verbessern (je Runde die beste Aufteilung), bis nichts mehr besser wird.
 */
function optimizeSplits(factors: number[][], splits: number[][], ctx: Ctx, exhaustive: boolean): Int32Array[] {
  const rounds = factors.length;
  const buildRound = (r: number, s: number) => {
    const out = new Int32Array(ctx.n);
    let o = 0;
    for (const pi of splits[s]) {
      out[o++] = factors[r][2 * pi];
      out[o++] = factors[r][2 * pi + 1];
    }
    return out;
  };
  const choice = new Array(rounds).fill(0);
  const evalChoice = () => new Search(ctx, choice.map((s, r) => buildRound(r, s))).cost();

  if (exhaustive) {
    let bestChoice = choice.slice();
    let bestCost = Infinity;
    const total = splits.length ** rounds;
    for (let code = 0; code < total; code++) {
      let x = code;
      for (let r = 0; r < rounds; r++) {
        choice[r] = x % splits.length;
        x = Math.floor(x / splits.length);
      }
      const c = evalChoice();
      if (c < bestCost) {
        bestCost = c;
        bestChoice = choice.slice();
      }
    }
    return bestChoice.map((s, r) => buildRound(r, s));
  }

  // Inkrementell: je Runde alle Aufteilungen probieren, die beste behalten.
  const options = factors.map((_, r) => splits.map((_, s) => buildRound(r, s)));
  const search = new Search(ctx, choice.map((s, r) => options[r][s]));
  let current = search.cost();
  for (let pass = 0; pass < 6; pass++) {
    let improved = false;
    for (let r = 0; r < rounds; r++) {
      let bestS = choice[r];
      for (let s = 0; s < splits.length; s++) {
        if (s === bestS) continue;
        search.replaceRound(r, options[r][s]);
        const c = search.cost();
        if (c < current) {
          current = c;
          bestS = s;
          improved = true;
        }
      }
      search.replaceRound(r, options[r][bestS]);
      choice[r] = bestS;
    }
    if (!improved) break;
  }
  return choice.map((s, r) => buildRound(r, s));
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

export interface PauseSpacing {
  /** Mittlere Abweichung der Pausenabstände vom Idealabstand (Runden / Pausen) */
  avgDeviation: number;
  /** Größte Abweichung eines Pausenabstands vom Idealabstand */
  maxDeviation: number;
  /** Größte Abweichung, bezogen auf den Idealabstand des jeweiligen Spielers (0,5 = 50 %) */
  maxRelDeviation: number;
}

/**
 * Wie gleichmäßig liegen die Pausen jedes Spielers über das Turnier verteilt?
 * Gemessen werden die Abstände zwischen zwei Pausen desselben Spielers
 * (1 = direkt hintereinander) im Vergleich zum Idealabstand Runden / Pausen.
 */
export function pauseSpacing(rounds: Round[], players: PlayerId[]): PauseSpacing {
  const R = rounds.length;
  let sum = 0;
  let cnt = 0;
  let max = 0;
  let rel = 0;
  for (const p of players) {
    const pos: number[] = [];
    rounds.forEach((r, i) => r.sitting.includes(p) && pos.push(i));
    if (pos.length < 2) continue;
    const ideal = R / pos.length;
    for (let i = 1; i < pos.length; i++) {
      const dev = Math.abs(pos[i] - pos[i - 1] - ideal);
      sum += dev;
      cnt++;
      max = Math.max(max, dev);
      rel = Math.max(rel, dev / ideal);
    }
  }
  return { avgDeviation: cnt ? sum / cnt : 0, maxDeviation: max, maxRelDeviation: rel };
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
