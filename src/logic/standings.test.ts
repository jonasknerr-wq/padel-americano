import { describe, expect, it } from 'vitest';
import { makeResult } from './scoring';
import { computeStandings } from './standings';
import type { Match, Player, Round } from './types';

const P = (...ids: string[]): Player[] => ids.map((id) => ({ id, name: id }));
const match = (a: [string, string], b: [string, string], ra: number, rb: number): Match => ({
  court: 0,
  teamA: a,
  teamB: b,
  result: makeResult(ra, rb, 24),
});
const round = (...m: Match[]): Round => ({ matches: m, sitting: [] });

describe('computeStandings', () => {
  it('zählt Punkte, Siege, Ø und Differenz', () => {
    const rows = computeStandings(P('A', 'B', 'C', 'D'), [round(match(['A', 'B'], ['C', 'D'], 10, 6))]);
    const a = rows.find((r) => r.id === 'A')!;
    expect(a).toMatchObject({ matches: 1, wins: 1, draws: 0, losses: 0, points: 15, avgPoints: 15, avgDiff: 6 });
    const c = rows.find((r) => r.id === 'C')!;
    expect(c).toMatchObject({ wins: 0, losses: 1, points: 9, avgDiff: -6 });
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3, 3]);
  });

  it('sortiert nach Ø Punkten, nicht nach Gesamtpunkten (Ausfall bleibt fair)', () => {
    const rows = computeStandings(P('A', 'B', 'C', 'D', 'E'), [
      round(match(['A', 'B'], ['C', 'D'], 13, 11)), // A,B 13
      round(match(['A', 'C'], ['B', 'E'], 12, 12)), // alle 12
      round(match(['E', 'D'], ['B', 'C'], 14, 10)),
    ]);
    // A: 2 Matches, 13+12 = 25 → Ø 12.5 ; B: 13+12+10=35 → Ø 11.67 ; E: 12+14 = 26 → Ø 13
    expect(rows[0].id).toBe('E');
    expect(rows[1].id).toBe('A');
  });

  it('Tiebreaker: Siege vor Ø Differenz', () => {
    // A und B gleicher Ø (12), A hat mehr Siege
    const rows = computeStandings(P('A', 'B', 'C', 'D', 'X', 'Y'), [
      round(match(['A', 'X'], ['C', 'D'], 13, 11)), // A 13 (Sieg)
      round(match(['A', 'Y'], ['C', 'D'], 11, 13)), // A 11 → Ø 12, 1 Sieg
      round(match(['B', 'X'], ['C', 'Y'], 12, 12)), // B 12
      round(match(['B', 'Y'], ['D', 'X'], 12, 12)), // B 12 → Ø 12, 0 Siege
    ]);
    const ia = rows.findIndex((r) => r.id === 'A');
    const ib = rows.findIndex((r) => r.id === 'B');
    expect(ia).toBeLessThan(ib);
  });

  it('Gleichstand inkl. direktem Vergleich → gleicher Rang, alphabetisch', () => {
    const rows = computeStandings(P('A', 'B', 'C', 'D', 'E', 'F'), [
      round(match(['A', 'C'], ['B', 'D'], 3, 1)), // A,C 18 ; B,D 6
      round(match(['A', 'E'], ['B', 'F'], 1, 3)), // A,E 6  ; B,F 18
    ]);
    // A und B: Ø 12, 1 Sieg, Ø Diff 0 → direkter Vergleich: A vs B: +12 und −12 = 0 → alphabetisch, gleicher Rang
    const a = rows.find((r) => r.id === 'A')!;
    const b = rows.find((r) => r.id === 'B')!;
    expect(a.rank).toBe(b.rank);
    expect(rows.indexOf(a)).toBeLessThan(rows.indexOf(b));
  });

  it('Tiebreaker: direkter Vergleich entscheidet', () => {
    // A und B: je zwei Matches, Ø 12, 1 Sieg, Ø Diff 0. A schlug B direkt höher.
    const rows = computeStandings(P('A', 'B', 'C', 'D', 'E', 'F'), [
      round(match(['A', 'C'], ['B', 'D'], 3, 1)), // A +12 gegen B
      round(match(['B', 'E'], ['C', 'F'], 3, 1)), // B 18
      round(match(['A', 'F'], ['D', 'E'], 1, 3)), // A 6
    ]);
    // B: 6 + 18 = 24 → Ø 12, 1 Sieg, Diff (−12 + 12)/2 = 0
    // A: 18 + 6 = 24 → Ø 12, 1 Sieg, Diff 0 ; direkter Vergleich A gegen B: +12
    const ia = rows.findIndex((r) => r.id === 'A');
    const ib = rows.findIndex((r) => r.id === 'B');
    expect(ia).toBeLessThan(ib);
    expect(rows[ia].rank).toBeLessThan(rows[ib].rank);
  });

  it('alphabetisch, wenn alles gleich ist; ohne Matches ganz unten', () => {
    const rows = computeStandings(P('Zoe', 'Anna', 'Ben', 'Carl', 'Dora'), [
      round(match(['Zoe', 'Anna'], ['Ben', 'Carl'], 5, 5)),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Anna', 'Ben', 'Carl', 'Zoe', 'Dora']);
    expect(rows.slice(0, 4).every((r) => r.rank === 1)).toBe(true);
    expect(rows[4].rank).toBe(5);
  });
});
