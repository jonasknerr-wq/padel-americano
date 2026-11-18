import { describe, expect, it } from 'vitest';
import { activeCourts, chooseRounds, COURT_OPTIONS, DURATION_OPTIONS, MAX_PLAYERS, MIN_PLAYERS } from './rounds';

const t = (total: number) => ({ totalMinutes: total, warmupMinutes: 5, changeMinutes: 2 });

describe('activeCourts', () => {
  it('nutzt bei 5–7 Spielern nur einen Platz', () => {
    expect(activeCourts(5, 2)).toBe(1);
    expect(activeCourts(7, 2)).toBe(1);
    expect(activeCourts(8, 2)).toBe(2);
    expect(activeCourts(8, 1)).toBe(1);
  });
});

describe('chooseRounds', () => {
  it('8 Spieler / 2 Plätze / 90 Min → 7 Runden à 10 Min', () => {
    const p = chooseRounds(8, 2, t(90));
    expect(p.rounds).toBe(7);
    expect(p.roundMinutes).toBe(10);
    expect(p.fair).toBe(true);
  });

  it('7 Spieler / 60 Min hat keine faire Lösung und meldet das', () => {
    const p = chooseRounds(7, 1, t(60));
    expect(p.fair).toBe(false);
    expect(p.maxMatches - p.minMatches).toBe(1);
  });

  it('Zeitbudget wird nie überschritten und Längen sind halbe Minuten', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++)
      for (const c of COURT_OPTIONS)
        for (const total of DURATION_OPTIONS) {
          const p = chooseRounds(n, c, t(total));
          const used = 5 + p.rounds * p.roundMinutes + (p.rounds - 1) * 2;
          expect(used).toBeLessThanOrEqual(total);
          expect(p.roundMinutes * 2).toBe(Math.round(p.roundMinutes * 2));
          expect(p.roundMinutes).toBeGreaterThanOrEqual(8);
          expect(p.roundMinutes).toBeLessThanOrEqual(20);
        }
  });

  it('wählt faire Lösungen überall außer bei 7 Spielern (60 Min) und 9 oder 11 Spielern (60/90 Min)', () => {
    const unfair = (n: number, total: number) =>
      (n === 7 && total === 60) || ((n === 9 || n === 11) && (total === 60 || total === 90));
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++)
      for (const c of COURT_OPTIONS)
        for (const total of DURATION_OPTIONS) {
          const p = chooseRounds(n, c, t(total));
          expect(p.fair, `${n} Spieler, ${c} Plätze, ${total} Min`).toBe(!unfair(n, total));
          // Unfair heißt immer: höchstens 1 Match Unterschied
          expect(p.maxMatches - p.minMatches).toBeLessThanOrEqual(1);
        }
  });

  it('12 Spieler / 3 Plätze / 240 Min → 22 Runden à 8,5 Min, jeder spielt 22 Matches', () => {
    const p = chooseRounds(12, 3, t(240));
    expect(p.activeCourts).toBe(3);
    expect(p.rounds).toBe(22);
    expect(p.roundMinutes).toBe(8.5);
    expect(p.fair).toBe(true);
    expect(p.minMatches).toBe(22);
  });

  it('240 Min: Rundenzahl bleibt im Rahmen und alle Runden liegen bei 8–20 Min', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const p = chooseRounds(n, 3, t(240));
      expect(p.inRange).toBe(true);
      expect(p.rounds).toBeLessThanOrEqual(29);
    }
  });
});

describe('activeCourts bei bis zu 12 Spielern und 3 Plätzen', () => {
  it('nutzt nie mehr Plätze, als Spieler da sind', () => {
    expect(activeCourts(6, 3)).toBe(1);
    expect(activeCourts(9, 3)).toBe(2);
    expect(activeCourts(11, 3)).toBe(2);
    expect(activeCourts(12, 3)).toBe(3);
    expect(activeCourts(12, 1)).toBe(1);
    expect(activeCourts(12, 2)).toBe(2);
  });
});
