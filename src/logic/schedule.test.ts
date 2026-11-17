import { describe, expect, it } from 'vitest';
import { chooseRounds } from './rounds';
import { generateSchedule, pairKey, replan, scheduleStats } from './schedule';
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
  for (let n = 4; n <= 8; n++)
    for (const courts of [1, 2])
      for (const total of [60, 90, 120]) {
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

          // Doppel-Aussetzer nur bei 8 Spielern auf einem Platz (bewusster Kompromiss)
          if (!(n === 8 && plan.activeCourts === 1)) expect(st.consecutiveSits).toBe(0);
          else expect(st.consecutiveSits).toBeLessThanOrEqual(2);

          // Partner: niemand wiederholt, solange noch neue Partner möglich sind
          const minMatches = Math.min(...m);
          if (minMatches <= n - 1) expect(st.maxPartnerCount).toBe(1);
        });
      }
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

  it('Weniger als 4 Spieler → keine weiteren Runden', () => {
    const players = names(4);
    const full = generateSchedule({ players, rounds: 6, courts: 1, seed: 3 });
    const re = replan({ rounds: full, fromRound: 2, players: names(3), courts: 1, seed: 4 });
    expect(re).toHaveLength(2);
  });
});
