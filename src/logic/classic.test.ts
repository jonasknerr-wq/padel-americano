import { describe, expect, it } from 'vitest';
import { parseState } from '../store';
import {
  classicDefaultRounds,
  classicMatchMinutes,
  classicScore,
  estimateClassicMinutes,
  fullRotationRounds,
  isWhistCase,
  perfectRotationPossible,
  roundToFive,
  serveRule,
} from './classic';
import { pairKey, scheduleStats } from './schedule';
import { computeStandings } from './standings';
import { elapsed, start, tick } from './timer';
import {
  addPlayer,
  createTournament,
  DEFAULT_SETTINGS,
  dropPlayer,
  replanFrom,
  setResult,
  timerConfig,
  undo,
  validateClassicResult,
  type Settings,
  type Tournament,
} from './tournament';
import type { Player } from './types';

const players = (n: number): Player[] => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Name${i + 1}` }));
const CLASSIC: Settings = { ...DEFAULT_SETTINGS, mode: 'classic', pointSum: 24, classicRounds: null };
const times = { warmupMinutes: 5, changeMinutes: 2 };

/** Alle Ergebnisse einer Runde eintragen (Team A bekommt a Punkte). */
function playRound(t: Tournament, r: number, a = 15, now = 0): Tournament {
  for (const m of t.rounds[r].matches) t = setResult(t, r, m.court, a, t.settings.pointSum - a, now);
  return t;
}

describe('Klassisch: Whist-Eigenschaft (jeder 1× mit, 2× gegen jeden)', () => {
  for (const [n, courts] of [
    [4, 1],
    [8, 2],
    [12, 3],
  ]) {
    it(`${n} Spieler, ${courts} ${courts === 1 ? 'Platz' : 'Plätze'}, ${n - 1} Runden – 40 Mischungen`, () => {
      expect(isWhistCase(n, courts)).toBe(true);
      for (let seed = 1; seed <= 40; seed++) {
        const t = createTournament(players(n), { ...CLASSIC, courts }, seed);
        expect(t.rounds).toHaveLength(n - 1);
        const ids = t.players.map((p) => p.id);
        const st = scheduleStats(t.rounds, ids);
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) {
            expect(st.partner[pairKey(ids[i], ids[j])]).toBe(1);
            expect(st.opponent[pairKey(ids[i], ids[j])]).toBe(2);
          }
      }
    });
  }
});

describe('Klassisch: Ergebnis-Validierung', () => {
  it('Summe muss genau S sein, ganze Zahlen ab 0', () => {
    expect(validateClassicResult(15, 9, 24)).toBeNull();
    expect(validateClassicResult(12, 12, 24)).toBeNull();
    expect(validateClassicResult(24, 0, 24)).toBeNull();
    expect(validateClassicResult(15, 10, 24)).toMatch(/genau 24/);
    expect(validateClassicResult(-1, 25, 24)).toMatch(/ab 0/);
    expect(validateClassicResult(12.5, 11.5, 24)).toMatch(/ganze/);
  });

  it('Gegenseite wird automatisch zu S − Wert ergänzt und begrenzt', () => {
    expect(classicScore(15, 24)).toEqual({ a: 15, b: 9 });
    expect(classicScore(0, 21)).toEqual({ a: 0, b: 21 });
    expect(classicScore(30, 24)).toEqual({ a: 24, b: 0 });
    expect(classicScore(-3, 16)).toEqual({ a: 0, b: 16 });
  });

  it('setResult lehnt falsche Summen ab und speichert gültige ohne Normierung', () => {
    const t = createTournament(players(8), { ...CLASSIC, courts: 2 }, 1);
    expect(() => setResult(t, 0, 0, 15, 10)).toThrow(/genau 24/);
    const t2 = setResult(t, 0, 0, 15, 9);
    expect(t2.rounds[0].matches[0].result).toEqual({ rawA: 15, rawB: 9, normA: 15, normB: 9 });
  });

  it('Zeit-Modus bleibt unverändert: beliebige Summen, Normierung auf S', () => {
    const t = setResult(createTournament(players(8), DEFAULT_SETTINGS, 1), 0, 0, 10, 6);
    expect(t.rounds[0].matches[0].result).toEqual({ rawA: 10, rawB: 6, normA: 15, normB: 9 });
  });
});

describe('Klassisch: Standard-Rundenzahl', () => {
  const def = (n: number, c: number, s = 24) => classicDefaultRounds(n, c, s, times);
  it('volle Rotation ohne Aussetzer = Spielerzahl − 1', () => {
    expect(def(4, 1)).toMatchObject({ rounds: 3, perfect: true, capped: false });
    expect(def(8, 2)).toMatchObject({ rounds: 7, perfect: true, capped: false });
    expect(def(12, 3)).toMatchObject({ rounds: 11, perfect: true, capped: false });
  });

  it('mit Aussetzern: volle Rotation, wenn sie aufgeht (5/1 → 5, 9/2 → 9)', () => {
    expect(def(5, 1)).toMatchObject({ rounds: 5, perfect: true });
    expect(def(9, 2)).toMatchObject({ rounds: 9, perfect: true });
    expect(perfectRotationPossible(8, 1)).toBe(true);
  });

  it('sonst nächstgelegene faire Rundenzahl, bei Gleichstand die kürzere', () => {
    expect(fullRotationRounds(6, 1)).toBe(7.5);
    expect(def(6, 1)).toMatchObject({ rounds: 6, perfect: false });
    expect(def(7, 1)).toMatchObject({ rounds: 7, perfect: false });
    expect(def(10, 2)).toMatchObject({ rounds: 10, perfect: false });
    expect(def(11, 2)).toMatchObject({ rounds: 11, perfect: false });
    // 12/2: nächstgelegen wäre 15 (ca. 3:20 h) → auf ≤ 3 h gekürzt: 12 Runden
    expect(def(12, 2)).toMatchObject({ rounds: 12, perfect: false, capped: true });
  });

  it('wird auf rund 3 Stunden begrenzt (12 Spieler auf 1 Platz: 33 → kürzer, weiterhin fair)', () => {
    const d = def(12, 1);
    expect(d.fullRotation).toBe(33);
    expect(d.capped).toBe(true);
    expect(estimateClassicMinutes(d.rounds, 24, times)).toBeLessThanOrEqual(180);
    expect((d.rounds * 4) % 12).toBe(0); // alle gleich viele Matches
    expect(d.rounds).toBe(12);
  });

  it('jeder Vorschlag ist fair (alle gleich viele Matches) für 4–12 Spieler und 1–3 Plätze', () => {
    for (let n = 4; n <= 12; n++)
      for (const c of [1, 2, 3])
        for (const s of [16, 21, 24, 32]) {
          const d = def(n, c, s);
          const t = createTournament(players(n), { ...CLASSIC, courts: c, pointSum: s }, 3);
          expect(t.rounds).toHaveLength(d.rounds);
          expect(t.plan.fair, `${n}/${c}/${s}`).toBe(true);
        }
  });

  it('gewählte Rundenzahl gilt statt des Vorschlags', () => {
    const t = createTournament(players(8), { ...CLASSIC, courts: 2, classicRounds: 5 }, 1);
    expect(t.rounds).toHaveLength(5);
    const st = scheduleStats(t.rounds, t.activeIds);
    expect(st.maxPartnerCount).toBe(1); // gekürzt: trotzdem keine Partner-Wiederholung
  });
});

describe('Klassisch: Dauer-Schätzung', () => {
  it('Matchdauer 3,5 Min + 0,3125 Min pro Punkt', () => {
    expect(classicMatchMinutes(16)).toBe(8.5);
    expect(classicMatchMinutes(24)).toBe(11);
    expect(classicMatchMinutes(32)).toBe(13.5);
    expect(classicMatchMinutes(21)).toBeCloseTo(10.06, 2);
  });

  it('8 Spieler / 2 Plätze / 24 Punkte: 5 + 7×11 + 6×2 = 94 Min → ca. 1:35 h', () => {
    expect(estimateClassicMinutes(7, 24, times)).toBe(94);
    expect(roundToFive(94)).toBe(95);
  });

  it('ohne Wechsel bei 1 Runde', () => {
    expect(estimateClassicMinutes(1, 24, times)).toBe(16);
  });
});

describe('Klassisch: Aufschlag-Intervall', () => {
  it('16 → 2, 24 → 3, 32 → 4: jeder schlägt genau zweimal auf', () => {
    for (const [s, k] of [
      [16, 2],
      [24, 3],
      [32, 4],
    ]) {
      expect(serveRule(s)).toEqual({ every: k, minTurns: 2, maxTurns: 2, exact: true });
      expect((s / k) % 4).toBe(0);
    }
  });

  it('21 → 3, nicht exakt: einer schlägt einmal weniger auf', () => {
    expect(serveRule(21)).toEqual({ every: 3, minTurns: 1, maxTurns: 2, exact: false });
  });
});

describe('Tabelle in beiden Modi', () => {
  it('klassisch: Punkte = echte Teampunkte, Sortierung nach Ø', () => {
    let t = createTournament(players(4), { ...CLASSIC, courts: 1 }, 1);
    t = setResult(t, 0, 0, 15, 9);
    t = setResult(t, 1, 0, 12, 12);
    const rows = computeStandings(t.players, t.rounds);
    const total = rows.reduce((s, r) => s + r.points, 0);
    expect(total).toBe(4 * 24); // 2 Matches × 2 Teams × 2 Spieler … Summe = Matches × 2 × S
    for (const r of rows) expect(Number.isInteger(r.points)).toBe(true);
    expect(rows[0].avgPoints).toBeGreaterThanOrEqual(rows[3].avgPoints);
  });

  it('klassisch mit ungleicher Matchzahl: Ø entscheidet, nicht die Summe', () => {
    let t = createTournament(players(4), { ...CLASSIC, courts: 1 }, 1);
    t = setResult(t, 0, 0, 20, 4);
    t = addPlayer(t, 'Neu'); // ab Runde 2 dabei → weniger Matches
    for (let r = 1; r < t.rounds.length; r++) for (const m of t.rounds[r].matches) t = setResult(t, r, m.court, 12, 12);
    const rows = computeStandings(t.players, t.rounds);
    const sorted = [...rows].sort((a, b) => b.avgPoints - a.avgPoints);
    expect(rows.map((r) => r.id)).toEqual(sorted.map((r) => r.id));
  });

  it('Zeit-Modus: normierte Punkte wie bisher', () => {
    let t = createTournament(players(4), { ...DEFAULT_SETTINGS, courts: 1 }, 1);
    t = setResult(t, 0, 0, 10, 6);
    const rows = computeStandings(t.players, t.rounds);
    expect(rows[0].points).toBe(15);
    expect(rows[rows.length - 1].points).toBe(9);
  });
});

describe('Klassisch: Ablauf (Timer)', () => {
  it('Einspielen-Countdown, dann hochzählende Runde, die nicht von selbst endet', () => {
    const t = createTournament(players(8), { ...CLASSIC, courts: 2 }, 1);
    const cfg = timerConfig(t);
    let r = tick(start(t.timer, 0), cfg, 300_000); // Einspielen 5 Min vorbei
    expect(r.state.phase).toBe('round');
    expect(r.state.countUp).toBe(true);
    r = tick(r.state, cfg, 300_000 + 3 * 3_600_000); // 3 Stunden später: Runde läuft noch
    expect(r.state.phase).toBe('round');
    expect(elapsed(r.state, 300_000 + 125_000)).toBe(125);
  });

  it('Runde endet, wenn alle Plätze ein Ergebnis haben → Wechsel startet; letzte Runde → fertig', () => {
    let t = createTournament(players(8), { ...CLASSIC, courts: 2 }, 1);
    t = { ...t, timer: tick(start(t.timer, 0), timerConfig(t), 300_000).state };
    t = setResult(t, 0, 0, 15, 9, 400_000);
    expect(t.timer.phase).toBe('round'); // Platz 2 fehlt noch
    t = setResult(t, 0, 1, 10, 14, 500_000);
    expect(t.timer).toMatchObject({ phase: 'change', round: 1, running: true });
    for (let r = 1; r < t.rounds.length; r++) t = playRound(t, r, 13, 600_000 + r);
    expect(t.timer.phase).toBe('done');
  });

  it('Nachgetragenes Ergebnis einer früheren Runde ändert den Timer nicht', () => {
    let t = createTournament(players(4), { ...CLASSIC, courts: 1, warmupMinutes: 0 }, 1);
    t = { ...t, timer: start(t.timer, 0) };
    t = setResult(t, 0, 0, 15, 9, 1000); // Runde 1 fertig → Wechsel vor Runde 2
    t = setResult(t, 1, 0, 12, 12, 2000); // Runde 2 im Wechsel schon gespielt → Wechsel vor Runde 3
    expect(t.timer).toMatchObject({ phase: 'change', round: 2 });
    const before = t.timer;
    t = setResult(t, 0, 0, 14, 10, 3000); // Korrektur Runde 1
    expect(t.timer).toEqual(before);
  });

  it('Rückgängig nimmt das Ergebnis zurück, der Timer bleibt (wie besprochen)', () => {
    let t = createTournament(players(4), { ...CLASSIC, courts: 1 }, 1);
    t = setResult(t, 0, 0, 15, 9, 1000);
    expect(t.timer.phase).toBe('change');
    t = undo(t);
    expect(t.rounds[0].matches[0].result).toBeUndefined();
    expect(t.timer.phase).toBe('change');
  });
});

describe('Klassisch: Neuplanung', () => {
  it('Nachzügler: gespielte Runden bleiben, Rest neu, Rundenzahl gleich', () => {
    let t = createTournament(players(8), { ...CLASSIC, courts: 2 }, 1);
    t = playRound(t, 0);
    t = playRound(t, 1);
    expect(replanFrom(t)).toBe(2);
    const before = t.rounds.slice(0, 2);
    t = addPlayer(t, 'Neu');
    expect(t.rounds).toHaveLength(7);
    expect(t.rounds.slice(0, 2)).toEqual(before);
    for (const r of t.rounds.slice(2)) {
      expect(r.matches).toHaveLength(2);
      expect(r.sitting).toHaveLength(1);
    }
    const st = scheduleStats(t.rounds.slice(2), t.activeIds);
    expect(st.consecutiveSits).toBe(0);
    expect(st.matches[t.activeIds[8]]).toBeGreaterThanOrEqual(4); // Nachzügler holt auf
  });

  it('Ausfall während einer laufenden Runde: Neuplanung erst ab der nächsten', () => {
    let t = createTournament(players(8), { ...CLASSIC, courts: 2, warmupMinutes: 0 }, 1);
    t = { ...t, timer: start(t.timer, 0) }; // Runde 1 läuft (hochzählend)
    expect(replanFrom(t)).toBe(1);
    const first = t.rounds[0];
    t = dropPlayer(t, 'p3');
    expect(t.rounds[0]).toEqual(first);
    for (const r of t.rounds.slice(1)) {
      expect(r.matches).toHaveLength(1);
      expect([...r.sitting, ...r.matches.flatMap((m) => [...m.teamA, ...m.teamB])]).not.toContain('p3');
    }
  });
});

describe('Laden alter Speicherstände', () => {
  it('Turnier und Entwurf ohne Modus-Feld laden als Zeit-Modus', () => {
    const old = createTournament(players(8), DEFAULT_SETTINGS, 1) as unknown as Record<string, unknown>;
    const oldSettings = { totalMinutes: 90, courts: 2, warmupMinutes: 5, changeMinutes: 2, pointSum: 24 }; // Format vor dem Modus
    const raw = JSON.stringify({
      draft: { names: ['A', 'B'], settings: oldSettings, seed: 5 },
      tournament: { ...old, settings: oldSettings },
      theme: 'dark',
    });
    const s = parseState(raw);
    expect(s.draft.settings.mode).toBe('time');
    expect(s.draft.settings.classicRounds).toBeNull();
    expect(s.tournament?.settings.mode).toBe('time');
    expect(s.tournament?.rounds).toHaveLength((old.rounds as unknown[]).length);
    expect(s.theme).toBe('dark');
    // weiterspielen funktioniert
    const next = setResult(s.tournament!, 0, 0, 10, 6);
    expect(next.rounds[0].matches[0].result?.normA).toBe(15);
  });

  it('leerer Speicher → Standardwerte (Zeit-Modus)', () => {
    expect(parseState(null).draft.settings.mode).toBe('time');
  });
});

describe('Klassisch: Rechenzeit', () => {
  it('größte Pläne deutlich unter 1 s', () => {
    for (const [n, courts, rounds] of [
      [12, 3, null],
      [12, 1, null],
      [11, 2, null],
      [12, 2, 40],
    ] as const) {
      const t0 = performance.now();
      createTournament(players(n), { ...CLASSIC, courts, classicRounds: rounds }, 1);
      expect(performance.now() - t0).toBeLessThan(1000);
    }
  });
});
