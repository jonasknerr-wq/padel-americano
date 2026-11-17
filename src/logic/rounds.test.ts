import { describe, expect, it } from 'vitest';
import { activeCourts, chooseRounds } from './rounds';

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
    for (let n = 4; n <= 8; n++)
      for (const c of [1, 2])
        for (const total of [60, 90, 120]) {
          const p = chooseRounds(n, c, t(total));
          const used = 5 + p.rounds * p.roundMinutes + (p.rounds - 1) * 2;
          expect(used).toBeLessThanOrEqual(total);
          expect(p.roundMinutes * 2).toBe(Math.round(p.roundMinutes * 2));
          expect(p.roundMinutes).toBeGreaterThanOrEqual(8);
          expect(p.roundMinutes).toBeLessThanOrEqual(20);
        }
  });

  it('wählt faire Lösungen überall außer bei 7 Spielern in 60 Min', () => {
    for (let n = 4; n <= 8; n++)
      for (const c of [1, 2])
        for (const total of [60, 90, 120]) {
          const p = chooseRounds(n, c, t(total));
          expect(p.fair).toBe(!(n === 7 && total === 60));
        }
  });
});
