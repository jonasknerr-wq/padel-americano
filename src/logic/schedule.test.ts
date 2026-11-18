import { describe, expect, it } from 'vitest';
import { activeCourts, chooseRounds, COURT_OPTIONS, DURATION_OPTIONS, MAX_PLAYERS, MIN_PLAYERS } from './rounds';
import { generateSchedule, pairKey, pauseSpacing, replan, scheduleStats } from './schedule';
import type { Round } from './types';

const t = (total: number) => ({ totalMinutes: total, warmupMinutes: 5, changeMinutes: 2 });
const names = (n: number) => Array.from({ length: n }, (_, i) => `S${i + 1}`);

function assertNoDuplicates(rounds: Round[], players: string[]) {
  for (const r of rounds) {
    const onCourt = r.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
    const everyone = [...onCourt, ...r.sitting];
    expect(new Set(onCourt).size).toBe(onCourt.length);
    expect(new Set(everyone).size).toBe(everyone.length);
    expect(everyone.sort()).toEqual([...players].sort());
  }
}

describe('Spielplan für alle Kombinationen', () => {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++)
    for (const courts of COURT_OPTIONS) {
      // Mehr gewählte Plätze als nutzbar → identisch zur kleineren Platzzahl, nicht doppelt testen
      if (courts > 1 && activeCourts(n, courts) < courts) continue;
      for (const total of DURATION_OPTIONS) {
        it(`${n} Spieler, ${courts} Plätze, ${total} Min`, () => {
          const plan = chooseRounds(n, courts, t(total));
          const players = names(n);
          const rounds = generateSchedule({ players, rounds: plan.rounds, courts, seed: 42 });
          expect(rounds).toHaveLength(plan.rounds);
          expect(rounds[0].matches).toHaveLength(plan.activeCourts);
          assertNoDuplicates(rounds, players);

          const st = scheduleStats(rounds, players);
          const m = Object.values(st.matches);
          const spread = Math.max(...m) - Math.min(...m);
          expect(spread).toBeLessThanOrEqual(1);
          if (plan.fair) expect(spread).toBe(0);

          // Doppel-Aussetzer: Setzt mehr als die Hälfte aus, überschneiden sich die
          // Aussetzer zweier aufeinanderfolgender Runden zwangsläufig um ≥ 2s − n Spieler.
          const s = plan.sittingPerRound;
          const minMatches = Math.min(...m);
          if (2 * s < n) {
            expect(st.consecutiveSits).toBe(0);
            // Partner: niemand wiederholt, solange noch neue Partner möglich sind
            if (minMatches <= n - 1) expect(st.maxPartnerCount).toBe(1);
          } else if (2 * s === n) {
            // 8 Spieler auf 1 Platz: bewusster Kompromiss zwischen Doppel-Aussetzern und Partnerwechsel
            expect(st.consecutiveSits).toBeLessThanOrEqual(Math.ceil(plan.rounds / 2));
            expect(st.maxPartnerCount).toBeLessThanOrEqual(2);
          } else {
            const lowerBound = (plan.rounds - 1) * (2 * s - n);
            expect(st.consecutiveSits).toBeGreaterThanOrEqual(lowerBound);
            expect(st.consecutiveSits).toBeLessThanOrEqual(lowerBound + 3); // Untergrenze ist nicht immer erreichbar
            // Hier konkurrieren Doppel-Aussetzer und Partnerwechsel: höchstens eine Wiederholung
            if (minMatches <= n - 1) expect(st.maxPartnerCount).toBeLessThanOrEqual(2);
          }
          // Partner gleichmäßig: höchstens eine Wiederholung mehr als rechnerisch nötig
          expect(st.maxPartnerCount).toBeLessThanOrEqual(Math.ceil(Math.max(...m) / (n - 1)) + 1);

          // Pausen zeitlich gleichmäßig (siehe Beschreibung 'Pausen zeitlich verteilt')
          expectEvenPauses(rounds, players);
        });
      }
    }
});

/**
 * Abstands-Kennzahl im Rahmen: Kein Abstand zwischen zwei Pausen eines Spielers
 * weicht um mehr als 75 % vom Idealabstand (Runden / Pausen) ab, im Mittel um
 * höchstens 1,2 Runden. Vor der Optimierung lagen die Werte bei bis zu 233 % bzw. 5,6 Runden.
 */
function expectEvenPauses(rounds: Round[], players: string[]) {
  const sp = pauseSpacing(rounds, players);
  expect(sp.maxRelDeviation).toBeLessThanOrEqual(0.75);
  expect(sp.avgDeviation).toBeLessThanOrEqual(1.2);
}

describe('Pausen zeitlich verteilt', () => {
  // Typische Fälle mit Aussetzern; „Neu mischen“ = anderer Seed → jeder Plan muss passen
  const cases: [number, number, number][] = [
    [5, 1, 120],
    [6, 1, 120],
    [7, 1, 90],
    [9, 2, 120],
    [10, 2, 120],
    [11, 2, 120],
    [11, 3, 240],
    [10, 1, 120],
  ];
  for (const [n, courts, total] of cases) {
    it(`${n} Spieler, ${courts} Plätze, ${total} Min: 20× gemischt, keine vermeidbare Doppelpause, Abstände im Rahmen`, () => {
      const plan = chooseRounds(n, courts, t(total));
      const players = names(n);
      const s = plan.sittingPerRound;
      const minDbl = 2 * s > n ? (plan.rounds - 1) * (2 * s - n) : 0;
      for (let seed = 1; seed <= 20; seed++) {
        const rounds = generateSchedule({ players, rounds: plan.rounds, courts, seed });
        const st = scheduleStats(rounds, players);
        if (minDbl === 0) expect(st.consecutiveSits).toBe(0);
        else expect(st.consecutiveSits).toBeLessThanOrEqual(minDbl + 3);
        expectEvenPauses(rounds, players);
        expect(new Set(Object.values(st.sits)).size).toBeLessThanOrEqual(plan.fair ? 1 : 2);
      }
    });
  }

  it('Beispiel 10 Spieler / 2 Plätze / 10 Runden: Pausen 4–6 Runden auseinander (ideal 5, vorher teils 2)', () => {
    const players = names(10);
    for (let seed = 1; seed <= 10; seed++) {
      const rounds = generateSchedule({ players, rounds: 10, courts: 2, seed });
      for (const p of players) {
        const pos = rounds.flatMap((r, i) => (r.sitting.includes(p) ? [i] : []));
        expect(pos).toHaveLength(2);
        expect(pos[1] - pos[0]).toBeGreaterThanOrEqual(4);
        expect(pos[1] - pos[0]).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe('12 Spieler, 3 Plätze', () => {
  for (const seed of [1, 2, 3, 99, 123456]) {
    it(`11 Runden: jeder Partner genau einmal, jeder Gegner genau zweimal (Seed ${seed})`, () => {
      const players = names(12);
      const rounds = generateSchedule({ players, rounds: 11, courts: 3, seed });
      assertNoDuplicates(rounds, players);
      const st = scheduleStats(rounds, players);
      for (let i = 0; i < 12; i++)
        for (let j = i + 1; j < 12; j++) {
          expect(st.partner[pairKey(players[i], players[j])]).toBe(1);
          expect(st.opponent[pairKey(players[i], players[j])]).toBe(2);
        }
    });
  }

  it('240 Min (22 Runden): jeder Partner genau zweimal, Gegner höchstens viermal', () => {
    const plan = chooseRounds(12, 3, t(240));
    expect(plan.rounds).toBe(22);
    const players = names(12);
    const rounds = generateSchedule({ players, rounds: plan.rounds, courts: 3, seed: 7 });
    const st = scheduleStats(rounds, players);
    for (let i = 0; i < 12; i++)
      for (let j = i + 1; j < 12; j++) expect(st.partner[pairKey(players[i], players[j])]).toBe(2);
    expect(st.maxOpponentCount).toBeLessThanOrEqual(4);
  });

  it('12 Spieler auf 1 Platz: Aussetzer gleich verteilt, keine Partner-Wiederholung', () => {
    const plan = chooseRounds(12, 1, t(240));
    const players = names(12);
    const rounds = generateSchedule({ players, rounds: plan.rounds, courts: 1, seed: 3 });
    const st = scheduleStats(rounds, players);
    expect(new Set(Object.values(st.sits)).size).toBe(1);
    expect(st.maxPartnerCount).toBe(1);
  });
});

describe('Rechenzeit', () => {
  it('auch die größten Pläne sind schnell (Ziel Handy < 1 s)', () => {
    const cases: [number, number][] = [
      [12, 3],
      [12, 2],
      [11, 2],
      [12, 1],
    ];
    for (const [n, courts] of cases) {
      const plan = chooseRounds(n, courts, t(240));
      const start = performance.now();
      generateSchedule({ players: names(n), rounds: plan.rounds, courts, seed: 1 });
      // Am PC ≤ ~100 ms; 400 ms lassen Luft für langsame Test-Rechner.
      expect(performance.now() - start).toBeLessThan(400);
    }
  });

  it('größter Fall 12 Spieler / 3 Plätze / 240 Min inkl. Pausen-Optimierung deutlich unter 1 s', () => {
    for (const seed of [1, 2, 3]) {
      const start = performance.now();
      generateSchedule({ players: names(12), rounds: chooseRounds(12, 3, t(240)).rounds, courts: 3, seed });
      expect(performance.now() - start).toBeLessThan(1000);
    }
  });
});

describe('8 Spieler, 2 Plätze, 7 Runden', () => {
  for (const seed of [1, 2, 3, 99, 123456]) {
    it(`jede Partnerkombination genau einmal (Seed ${seed})`, () => {
      const players = names(8);
      const rounds = generateSchedule({ players, rounds: 7, courts: 2, seed });
      const st = scheduleStats(rounds, players);
      for (let i = 0; i < 8; i++)
        for (let j = i + 1; j < 8; j++) expect(st.partner[pairKey(players[i], players[j])]).toBe(1);
      // Bonus: auch jeder Gegner genau zweimal
      for (let i = 0; i < 8; i++)
        for (let j = i + 1; j < 8; j++) expect(st.opponent[pairKey(players[i], players[j])]).toBe(2);
    });
  }
});

describe('Determinismus', () => {
  it('gleicher Seed → identischer Plan', () => {
    const a = generateSchedule({ players: names(7), rounds: 7, courts: 1, seed: 777 });
    const b = generateSchedule({ players: names(7), rounds: 7, courts: 1, seed: 777 });
    expect(a).toEqual(b);
  });
});

describe('Neuplanung', () => {
  it('Ausfall eines Spielers nach Runde 3 (8 Spieler, 2 Plätze, 7 Runden)', () => {
    const players = names(8);
    const full = generateSchedule({ players, rounds: 7, courts: 2, seed: 5 });
    const remaining = players.filter((p) => p !== 'S3');
    const re = replan({ rounds: full, fromRound: 3, players: remaining, courts: 2, seed: 6 });

    expect(re).toHaveLength(7);
    expect(re.slice(0, 3)).toEqual(full.slice(0, 3)); // gespielte Runden bleiben
    const future = re.slice(3);
    assertNoDuplicates(future, remaining);
    for (const r of future) {
      expect(r.matches).toHaveLength(1); // 7 Spieler → 1 Platz
      expect(r.sitting).toHaveLength(3);
    }
    // Zukünftige Matches gleichmäßig verteilt (4 Runden × 4 Plätze / 7 Spieler)
    const st = scheduleStats(future, remaining);
    const m = Object.values(st.matches);
    expect(Math.max(...m) - Math.min(...m)).toBeLessThanOrEqual(1);
    expect(st.consecutiveSits).toBe(0);
    // Wer in Runde 3 schon ... (8 Spieler → niemand saß aus) – Gesamt-Matches max. 1 Unterschied
    const total = scheduleStats(re, remaining).matches;
    const tv = remaining.map((p) => total[p]);
    expect(Math.max(...tv) - Math.min(...tv)).toBeLessThanOrEqual(1);
  });

  it('Ausfall berücksichtigt Historie: keine Partner-Wiederholung, wenn vermeidbar', () => {
    const players = names(6);
    const full = generateSchedule({ players, rounds: 6, courts: 1, seed: 11 });
    const remaining = players.filter((p) => p !== 'S1');
    const re = replan({ rounds: full, fromRound: 2, players: remaining, courts: 1, seed: 12 });
    assertNoDuplicates(re.slice(2), remaining);
    const st = scheduleStats(re, remaining);
    // 5 Spieler, 4 Runden Rest: Aussetzer gleichmäßig, wer zuletzt aussaß, setzt nicht direkt wieder aus
    const lastSat = new Set(full[1].sitting);
    for (const p of re[2].sitting) expect(lastSat.has(p)).toBe(false);
    expect(st.consecutiveSits).toBe(0);
  });

  it('Nachzügler wird in den Restplan aufgenommen', () => {
    const players = names(7);
    const full = generateSchedule({ players, rounds: 7, courts: 2, seed: 3 });
    const withNew = [...players, 'NEU'];
    const re = replan({ rounds: full, fromRound: 2, players: withNew, courts: 2, seed: 4 });
    expect(re).toHaveLength(7);
    for (const r of re.slice(2)) {
      expect(r.matches).toHaveLength(2); // jetzt 8 → 2 Plätze
      expect(r.matches.flatMap((m) => [...m.teamA, ...m.teamB])).toContain('NEU');
    }
    assertNoDuplicates(re.slice(2), withNew);
  });

  it('12 Spieler / 3 Plätze: Ausfall → 11 Spieler auf 2 Plätzen, Rückkehr → wieder 3 Plätze', () => {
    const players = names(12);
    const plan = chooseRounds(12, 3, t(240));
    const full = generateSchedule({ players, rounds: plan.rounds, courts: 3, seed: 21 });
    const eleven = players.filter((p) => p !== 'S5');
    const re = replan({ rounds: full, fromRound: 4, players: eleven, courts: 3, seed: 22 });
    expect(re).toHaveLength(plan.rounds);
    expect(re.slice(0, 4)).toEqual(full.slice(0, 4));
    assertNoDuplicates(re.slice(4), eleven);
    for (const r of re.slice(4)) {
      expect(r.matches).toHaveLength(2);
      expect(r.sitting).toHaveLength(3);
    }
    const st = scheduleStats(re.slice(4), eleven);
    expect(st.consecutiveSits).toBe(0);
    const totalMatches = scheduleStats(re, eleven).matches;
    const total = eleven.map((p) => totalMatches[p]);
    expect(Math.max(...total) - Math.min(...total)).toBeLessThanOrEqual(1);

    const back = replan({ rounds: re, fromRound: 10, players, courts: 3, seed: 23 });
    for (const r of back.slice(10)) expect(r.matches).toHaveLength(3);
    assertNoDuplicates(back.slice(10), players);
  });

  it('Pausen über die Neuplanungsgrenze hinweg: keine Doppelpause, nächste Pause nicht zu früh und nicht zu spät', () => {
    // 11 Spieler / 2 Plätze / 11 Runden (3 Aussetzer je Runde) → Ausfall nach Runde 5 → 10 Spieler, 2 Aussetzer
    const players = names(11);
    for (let seed = 1; seed <= 15; seed++) {
      const full = generateSchedule({ players, rounds: 11, courts: 2, seed });
      const ten = players.filter((p) => p !== 'S4');
      const re = replan({ rounds: full, fromRound: 5, players: ten, courts: 2, seed: seed + 100 });
      // Wer in der letzten gespielten Runde pausiert hat, pausiert nicht direkt danach
      for (const p of re[4].sitting) expect(re[5].sitting).not.toContain(p);
      // Über den ganzen Abend gezählt: keine Doppelpause, Abstand zur letzten Pause sinnvoll
      expect(scheduleStats(re, ten).consecutiveSits).toBe(0);
      const ideal = 6 / ((6 * 2) / 10); // Rest: 6 Runden, 2 Aussetzer, 10 Spieler → Abstand 5
      for (const p of ten) {
        const before = re.slice(0, 5).flatMap((r, i) => (r.sitting.includes(p) ? [i] : []));
        const after = re.slice(5).flatMap((r, i) => (r.sitting.includes(p) ? [i + 5] : []));
        if (before.length && after.length) {
          const gap = after[0] - before[before.length - 1];
          expect(gap).toBeGreaterThanOrEqual(2);
          expect(gap).toBeLessThanOrEqual(Math.ceil(ideal) + 2);
        }
      }
    }
  });

  it('Nachzügler: Pausen der Bisherigen laufen über die Grenze gleichmäßig weiter', () => {
    // 9 Spieler / 2 Plätze (1 Aussetzer) → Nachzügler nach Runde 3 → 10 Spieler, 2 Aussetzer
    const players = names(9);
    for (let seed = 1; seed <= 10; seed++) {
      const full = generateSchedule({ players, rounds: 10, courts: 2, seed });
      const withNew = [...players, 'NEU'];
      const re = replan({ rounds: full, fromRound: 3, players: withNew, courts: 2, seed: seed + 50 });
      for (const p of re[2].sitting) expect(re[3].sitting).not.toContain(p);
      expect(scheduleStats(re, withNew).consecutiveSits).toBe(0);
      // Über den ganzen Abend gemessen (inkl. der Pausen vor der Neuplanung)
      expectEvenPauses(re, players);
      expect(pauseSpacing(re, players).maxRelDeviation).toBeLessThanOrEqual(0.5);
    }
  });

  it('Neuplanung mit 12 Spielern ist schnell', () => {
    const players = names(12);
    const full = generateSchedule({ players, rounds: 21, courts: 2, seed: 1 });
    const start = performance.now();
    replan({ rounds: full, fromRound: 1, players: players.slice(0, 11), courts: 2, seed: 2 });
    expect(performance.now() - start).toBeLessThan(400);
  });

  it('Weniger als 4 Spieler → keine weiteren Runden', () => {
    const players = names(4);
    const full = generateSchedule({ players, rounds: 6, courts: 1, seed: 3 });
    const re = replan({ rounds: full, fromRound: 2, players: names(3), courts: 1, seed: 4 });
    expect(re).toHaveLength(2);
  });
});
