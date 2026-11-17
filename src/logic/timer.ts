/**
 * Timer als reine Zustandsmaschine: Einspielen → Runde 1 → Wechsel → Runde 2 … → fertig.
 * Läuft über absolute Zeitstempel (endsAt), damit nach Reload/Display-Sperre
 * nichts verloren geht. `tick` holt verpasste Übergänge nach.
 */
export type Phase = 'warmup' | 'round' | 'change' | 'done';

export interface TimerState {
  phase: Phase;
  /** Runde, die gespielt wird bzw. als nächstes kommt (0-basiert) */
  round: number;
  durationSec: number;
  running: boolean;
  endsAt: number | null; // ms, nur wenn running
  remainingSec: number; // nur wenn pausiert
  warned: boolean;
}

export interface TimerConfig {
  rounds: number;
  warmupSec: number;
  roundSec: number;
  changeSec: number;
}

export type TimerEvent = 'warn' | 'roundEnd' | 'phaseEnd';

const WARN_SEC = 60;

function phaseState(phase: Phase, round: number, durationSec: number): TimerState {
  return { phase, round, durationSec, running: false, endsAt: null, remainingSec: durationSec, warned: false };
}

export function initialTimer(cfg: TimerConfig): TimerState {
  if (cfg.warmupSec > 0) return phaseState('warmup', 0, cfg.warmupSec);
  return phaseState('round', 0, cfg.roundSec);
}

export function remaining(t: TimerState, now: number): number {
  if (t.phase === 'done') return 0;
  if (t.running && t.endsAt !== null) return Math.min(t.durationSec, Math.max(0, (t.endsAt - now) / 1000));
  return t.remainingSec;
}

/** Der Zustand nach dem Ende der aktuellen Phase (ohne Laufstatus). */
function nextPhase(t: TimerState, cfg: TimerConfig): TimerState {
  if (t.phase === 'warmup' || t.phase === 'change') return phaseState('round', t.round, cfg.roundSec);
  if (t.phase === 'round') {
    if (t.round >= cfg.rounds - 1) return phaseState('done', t.round, 0);
    if (cfg.changeSec > 0) return phaseState('change', t.round + 1, cfg.changeSec);
    return phaseState('round', t.round + 1, cfg.roundSec);
  }
  return t;
}

export function start(t: TimerState, now: number): TimerState {
  if (t.phase === 'done' || t.running) return t;
  return { ...t, running: true, endsAt: now + t.remainingSec * 1000 };
}

export function pause(t: TimerState, now: number): TimerState {
  if (!t.running) return t;
  return { ...t, running: false, endsAt: null, remainingSec: remaining(t, now) };
}

/** Phase manuell überspringen. Läuft der Timer, läuft er in der nächsten Phase weiter. */
export function skip(t: TimerState, cfg: TimerConfig, now: number): TimerState {
  const n = nextPhase(t, cfg);
  return t.running && n.phase !== 'done' ? start(n, now) : n;
}

/** Aktuelle Phase von vorn (pausiert). */
export function resetPhase(t: TimerState): TimerState {
  return { ...t, running: false, endsAt: null, remainingSec: t.durationSec, warned: false };
}

/** Zu einer bestimmten Runde springen (pausiert, Rundenbeginn). */
export function jumpToRound(round: number, cfg: TimerConfig): TimerState {
  return phaseState('round', Math.max(0, Math.min(round, cfg.rounds - 1)), cfg.roundSec);
}

export function tick(t: TimerState, cfg: TimerConfig, now: number): { state: TimerState; events: TimerEvent[] } {
  const events: TimerEvent[] = [];
  let s = t;
  let guard = 0;
  while (s.running && s.endsAt !== null && now >= s.endsAt && guard++ < 1000) {
    const endedAt = s.endsAt;
    events.push(s.phase === 'round' ? 'roundEnd' : 'phaseEnd');
    const n = nextPhase(s, cfg);
    s = n.phase === 'done' ? n : { ...n, running: true, endsAt: endedAt + n.durationSec * 1000 };
  }
  if (s.phase === 'round' && s.running && !s.warned && s.durationSec > WARN_SEC && remaining(s, now) <= WARN_SEC) {
    s = { ...s, warned: true };
    events.push('warn');
  }
  return { state: s, events };
}
