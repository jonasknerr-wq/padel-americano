import { describe, expect, it } from 'vitest';
import { scheduleStats } from './schedule';
import { initialTimer, pause, skip, start, tick } from './timer';
import {
  addPlayer,
  createTournament,
  DEFAULT_SETTINGS,
  dropPlayer,
  finishTournament,
  replanFrom,
  setResult,
  timerConfig,
  undo,
  validateNames,
} from './tournament';
import type { Player } from './types';

const players = (n: number): Player[] => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Name${i + 1}` }));

describe('Timer', () => {
  const cfg = { rounds: 2, warmupSec: 300, roundSec: 600, changeSec: 120 };
  it('läuft Einspielen → Runde → Wechsel → Runde → fertig und holt verpasste Zeit nach', () => {
    let t = start(initialTimer(cfg), 0);
    expect(t.phase).toBe('warmup');
    let r = tick(t, cfg, 300_000);
    expect(r.state.phase).toBe('round');
    expect(r.events).toEqual(['phaseEnd']);
    // Display war gesperrt: Sprung direkt in den Wechsel
    r = tick(r.state, cfg, 300_000 + 600_000 + 10_000);
    expect(r.state.phase).toBe('change');
    expect(r.state.round).toBe(1);
    expect(r.events).toContain('roundEnd');
    r = tick(r.state, cfg, 300_000 + 600_000 + 120_000 + 600_000);
    expect(r.state.phase).toBe('done');
  });
  it('warnt einmal 1 Minute vor Rundenende', () => {
    let t = start(skip(initialTimer(cfg), cfg, 0), 0);
    expect(t.phase).toBe('round');
    let r = tick(t, cfg, 539_000); // noch 61 s
    expect(r.events).toEqual([]);
    r = tick(r.state, cfg, 541_000); // noch 59 s
    expect(r.events).toEqual(['warn']);
    r = tick(r.state, cfg, 545_000);
    expect(r.events).toEqual([]);
  });
  it('Pause hält die Restzeit fest', () => {
    const t = pause(start(initialTimer(cfg), 0), 100_000);
    expect(t.remainingSec).toBe(200);
    expect(tick(t, cfg, 10_000_000).state.phase).toBe('warmup');
  });
});

describe('Turnier', () => {
  it('Ergebnis speichern, normieren und rückgängig machen', () => {
    let t = createTournament(players(8), DEFAULT_SETTINGS, 1);
    t = setResult(t, 0, 0, 10, 6);
    expect(t.rounds[0].matches[0].result).toEqual({ rawA: 10, rawB: 6, normA: 15, normB: 9 });
    t = undo(t);
    expect(t.rounds[0].matches[0].result).toBeUndefined();
  });

  it('Ausfall: Neuplanung ab nächster Runde, Spieler bleibt in der Liste', () => {
    let t = createTournament(players(8), DEFAULT_SETTINGS, 1);
    const cfg = timerConfig(t);
    t = { ...t, timer: start(skip(t.timer, cfg, 0), 0) }; // Runde 1 läuft
    t = setResult(t, 0, 0, 10, 6);
    expect(replanFrom(t)).toBe(1);
    const before = t.rounds[0];
    t = dropPlayer(t, 'p3');
    expect(t.rounds[0]).toEqual(before);
    expect(t.players).toHaveLength(8);
    expect(t.activeIds).not.toContain('p3');
    for (const r of t.rounds.slice(1)) {
      expect(r.matches).toHaveLength(1);
      expect([...r.sitting, ...r.matches.flatMap((m) => [...m.teamA, ...m.teamB])]).not.toContain('p3');
    }
    const st = scheduleStats(t.rounds.slice(1), t.activeIds);
    const m = Object.values(st.matches);
    expect(Math.max(...m) - Math.min(...m)).toBeLessThanOrEqual(1);
    // Rückgängig stellt den alten Plan wieder her
    expect(undo(t).activeIds).toContain('p3');
  });

  it('weniger als 4 Spieler ist nicht erlaubt', () => {
    const t = createTournament(players(4), DEFAULT_SETTINGS, 1);
    expect(() => dropPlayer(t, 'p1')).toThrow();
  });

  it('Nachzügler bekommt neue ID und wird eingeplant', () => {
    let t = createTournament(players(7), DEFAULT_SETTINGS, 1);
    t = addPlayer(t, 'Neu');
    expect(t.activeIds).toHaveLength(8);
    expect(t.rounds[0].matches).toHaveLength(2); // noch nicht begonnen → ab Runde 1
    expect(() => addPlayer(t, 'neu')).toThrow();
  });

  it('Turnier vorzeitig beenden schneidet leere Runden ab', () => {
    let t = createTournament(players(8), DEFAULT_SETTINGS, 1);
    t = setResult(t, 0, 0, 3, 2);
    t = finishTournament(t);
    expect(t.finished).toBe(true);
    expect(t.rounds).toHaveLength(1);
  });

  it('Namensprüfung', () => {
    expect(validateNames(['A', 'B', 'C'])).toMatch(/mindestens 4/);
    expect(validateNames(['A', 'B', 'C', 'a'])).toMatch(/einmal/);
    expect(validateNames(['A', 'B', 'C', ' '])).toMatch(/Leere/);
    expect(validateNames(['A', 'B', 'C', 'D'])).toBeNull();
  });
});
