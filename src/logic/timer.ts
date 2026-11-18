/**
 * Timer als reine Zustandsmaschine: Einspielen → Runde 1 → Wechsel → Runde 2 … → fertig.
 * Läuft über absolute Zeitstempel, damit nach Reload/Display-Sperre
 * nichts verloren geht. `tick` holt verpasste Übergänge nach.
 *
 * Zeit-Modus: Jede Phase ist ein Countdown (endsAt).
 * Klassischer Modus (cfg.countUp): Die Rundenphase zählt hoch (startedAt) und endet
 * nicht von selbst, sondern über `finishRound`, sobald alle Ergebnisse da sind.
 * Einspielen und Wechsel bleiben Countdowns.
 */
export type Phase = 'warmup' | 'round' | 'change' | 'done';

export interface TimerState {
  phase: Phase;
  /** Runde, die gespielt wird bzw. als nächstes kommt (0-basiert) */
  round: number;
  durationSec: number;
  running: boolean;
  endsAt: number | null; // ms, nur wenn running (Countdown)
  remainingSec: number; // nur wenn pausiert (Countdown)
  warned: boolean;
  /** Rundenphase zählt hoch statt herunter (klassischer Modus) */
  countUp?: boolean;
  /** ms, nur wenn running und countUp: Zeitpunkt, an dem die Uhr bei 0 gestartet wäre */
  startedAt?: number | null;
  /** nur wenn pausiert und countUp */
  elapsedSec?: number;
}

export interface TimerConfig {
  rounds: number;
  warmupSec: number;
  roundSec: number;
  changeSec: number;
  /** Klassischer Modus: Runden zählen hoch und enden über finishRound */
  countUp?: boolean;
}

export type TimerEvent = 'warn' | 'roundEnd' | 'phaseEnd';

const WARN_SEC = 60;

function phaseState(phase: Phase, round: number, durationSec: number): TimerState {
  return { phase, round, durationSec, running: false, endsAt: null, remainingSec: durationSec, warned: false };
}

function roundState(round: number, cfg: TimerConfig): TimerState {
  if (cfg.countUp) return { ...phaseState('round', round, 0), countUp: true, startedAt: null, elapsedSec: 0 };
  return phaseState('round', round, cfg.roundSec);
}

export function initialTimer(cfg: TimerConfig): TimerState {
  if (cfg.warmupSec > 0) return phaseState('warmup', 0, cfg.warmupSec);
  return roundState(0, cfg);
}

/** Hochzählende Rundenphase? */
export function isCountUp(t: TimerState): boolean {
  return t.phase === 'round' && t.countUp === true;
}

export function remaining(t: TimerState, now: number): number {
  if (t.phase === 'done' || isCountUp(t)) return 0;
  if (t.running && t.endsAt !== null) return Math.min(t.durationSec, Math.max(0, (t.endsAt - now) / 1000));
  return t.remainingSec;
}

/** Wie lange die (hochzählende) Runde schon läuft, in Sekunden. */
export function elapsed(t: TimerState, now: number): number {
  if (!isCountUp(t)) return 0;
  if (t.running && t.startedAt != null) return Math.max(0, (now - t.startedAt) / 1000);
  return t.elapsedSec ?? 0;
}

/** Hat die aktuelle Phase schon begonnen (läuft oder war schon gelaufen)? */
export function phaseStarted(t: TimerState): boolean {
  if (isCountUp(t)) return t.running || (t.elapsedSec ?? 0) > 0;
  return t.running || t.remainingSec < t.durationSec;
}

/** Der Zustand nach dem Ende der aktuellen Phase (ohne Laufstatus). */
function nextPhase(t: TimerState, cfg: TimerConfig): TimerState {
  if (t.phase === 'warmup' || t.phase === 'change') return roundState(t.round, cfg);
  if (t.phase === 'round') return afterRound(t.round, cfg);
  return t;
}

/** Zustand nach Runde r: Wechsel vor Runde r+1, direkt Runde r+1 oder fertig. */
function afterRound(r: number, cfg: TimerConfig): TimerState {
  if (r >= cfg.rounds - 1) return phaseState('done', r, 0);
  if (cfg.changeSec > 0) return phaseState('change', r + 1, cfg.changeSec);
  return roundState(r + 1, cfg);
}

export function start(t: TimerState, now: number): TimerState {
  if (t.phase === 'done' || t.running) return t;
  if (isCountUp(t)) return { ...t, running: true, startedAt: now - (t.elapsedSec ?? 0) * 1000 };
  return { ...t, running: true, endsAt: now + t.remainingSec * 1000 };
}

export function pause(t: TimerState, now: number): TimerState {
  if (!t.running) return t;
  if (isCountUp(t)) return { ...t, running: false, startedAt: null, elapsedSec: elapsed(t, now) };
  return { ...t, running: false, endsAt: null, remainingSec: remaining(t, now) };
}

/** Phase manuell überspringen. Läuft der Timer, läuft er in der nächsten Phase weiter. */
export function skip(t: TimerState, cfg: TimerConfig, now: number): TimerState {
  const n = nextPhase(t, cfg);
  return t.running && n.phase !== 'done' ? start(n, now) : n;
}

/**
 * Klassischer Modus: Runde r ist fertig (alle Ergebnisse da). Läuft gerade Runde r
 * (oder noch das Einspielen bzw. der Wechsel davor – wenn z. B. schneller gespielt
 * als die Uhr), geht es direkt in den Wechsel bzw. die nächste Runde – automatisch
 * gestartet. Sonst (frühere Runde nachgetragen) bleibt der Timer, wie er ist.
 */
export function finishRound(t: TimerState, r: number, cfg: TimerConfig, now: number): TimerState {
  const current = (t.phase === 'round' || t.phase === 'warmup' || t.phase === 'change') && t.round === r;
  if (!current) return t;
  const n = afterRound(r, cfg);
  return n.phase === 'done' ? n : start(n, now);
}

/** Aktuelle Phase von vorn (pausiert). */
export function resetPhase(t: TimerState): TimerState {
  if (isCountUp(t)) return { ...t, running: false, startedAt: null, elapsedSec: 0, warned: false };
  return { ...t, running: false, endsAt: null, remainingSec: t.durationSec, warned: false };
}

/** Zu einer bestimmten Runde springen (pausiert, Rundenbeginn). */
export function jumpToRound(round: number, cfg: TimerConfig): TimerState {
  return roundState(Math.max(0, Math.min(round, cfg.rounds - 1)), cfg);
}

export function tick(t: TimerState, cfg: TimerConfig, now: number): { state: TimerState; events: TimerEvent[] } {
  const events: TimerEvent[] = [];
  let s = t;
  let guard = 0;
  while (s.running && s.endsAt !== null && now >= s.endsAt && guard++ < 1000) {
    const endedAt = s.endsAt;
    events.push(s.phase === 'round' ? 'roundEnd' : 'phaseEnd');
    const n = nextPhase(s, cfg);
    if (n.phase === 'done') s = n;
    else if (isCountUp(n)) s = { ...n, running: true, startedAt: endedAt };
    else s = { ...n, running: true, endsAt: endedAt + n.durationSec * 1000 };
  }
  if (s.phase === 'round' && !isCountUp(s) && s.running && !s.warned && s.durationSec > WARN_SEC && remaining(s, now) <= WARN_SEC) {
    s = { ...s, warned: true };
    events.push('warn');
  }
  return { state: s, events };
}
