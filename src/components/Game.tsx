import { fmt1, fmtClock } from '../format';
import { pause, remaining, resetPhase, skip, start, type TimerConfig } from '../logic/timer';
import { missingResults, playerName, type Tournament } from '../logic/tournament';
import type { Round } from '../logic/types';
import { unlockAudio } from '../device';
import { useConfirm } from './Dialog';

interface Props {
  t: Tournament;
  cfg: TimerConfig;
  now: number;
  setTimer: (fn: (t: Tournament) => Tournament) => void;
  openResult: (round: number, court: number) => void;
  onFinish: () => void;
}

const PHASE_LABEL = { warmup: 'Einspielen', round: 'Runde', change: 'Wechsel', done: 'Fertig' } as const;

export function Game({ t, cfg, now, setTimer, openResult, onFinish }: Props) {
  const ask = useConfirm();
  const { timer } = t;
  const rem = remaining(timer, now);
  const total = t.rounds.length;
  const progress = timer.durationSec > 0 ? 1 - rem / timer.durationSec : 1;
  const warn = timer.phase === 'round' && rem <= 60 && timer.durationSec > 60;
  const notStarted = !timer.running && rem === timer.durationSec;

  // Fehlende Ergebnisse aus bereits gespielten Runden
  const lastPlayed = timer.phase === 'done' ? total - 1 : timer.round - 1;
  const missing = missingResults(t, lastPlayed);

  const current = t.rounds[timer.round];
  const next = timer.phase === 'done' ? undefined : t.rounds[timer.round + 1];

  const title =
    timer.phase === 'warmup'
      ? 'Einspielen'
      : timer.phase === 'change'
        ? `Wechsel – gleich Runde ${timer.round + 1}`
        : timer.phase === 'round'
          ? `Runde ${timer.round + 1} von ${total}`
          : 'Alle Runden gespielt';

  const toggle = () => {
    unlockAudio();
    setTimer((x) => ({ ...x, timer: x.timer.running ? pause(x.timer, Date.now()) : start(x.timer, Date.now()) }));
  };

  const doSkip = async () => {
    const what = timer.phase === 'round' ? `Runde ${timer.round + 1} beenden` : `${PHASE_LABEL[timer.phase]} überspringen`;
    if (await ask({ title: `${what}?`, confirm: 'Weiter' })) setTimer((x) => ({ ...x, timer: skip(x.timer, cfg, Date.now()) }));
  };

  return (
    <div className="game">
      <section className={`card timer-card phase-${timer.phase} ${warn ? 'warn' : ''}`}>
        <div className="timer-title">{title}</div>
        {timer.phase !== 'done' ? (
          <>
            <div className="timer-clock" aria-live="off">
              {fmtClock(rem)}
            </div>
            <div className="progress" aria-hidden>
              <div style={{ width: `${Math.min(100, progress * 100)}%` }} />
            </div>
            {warn && <div className="timer-warn">Noch 1 Minute!</div>}
            <div className="timer-actions">
              <button className="btn btn-primary btn-xl grow" onClick={toggle}>
                {timer.running ? '❚❚ Pause' : notStarted ? '▶ Start' : '▶ Weiter'}
              </button>
              <button className="btn btn-icon" aria-label="Phase neu starten" title="Phase neu starten" onClick={() => setTimer((x) => ({ ...x, timer: resetPhase(x.timer) }))}>
                ↺
              </button>
              <button className="btn btn-icon" aria-label="Phase überspringen" title="Phase überspringen" onClick={doSkip}>
                ⏭
              </button>
            </div>
            {notStarted && timer.phase === 'warmup' && timer.round === 0 && (
              <p className="muted small center">Start drückt den Einspiel-Countdown. Danach laufen Runden und Wechsel automatisch.</p>
            )}
          </>
        ) : (
          <div className="done-box">
            <p>{missing.length ? `Es fehlen noch ${missing.length} Ergebnis(se).` : 'Alle Ergebnisse sind eingetragen.'}</p>
            <button className="btn btn-primary btn-xl" onClick={onFinish}>
              🏆 Endstand anzeigen
            </button>
          </div>
        )}
      </section>

      {missing.length > 0 && (
        <section className="card missing">
          <h2>Ergebnis fehlt</h2>
          <div className="missing-list">
            {missing.map(({ round, court }) => (
              <button key={`${round}-${court}`} className="btn btn-accent" onClick={() => openResult(round, court)}>
                Runde {round + 1}
                {t.rounds[round].matches.length > 1 && ` · Platz ${court + 1}`}
              </button>
            ))}
          </div>
        </section>
      )}

      {current && timer.phase !== 'done' && (
        <RoundCard t={t} round={current} index={timer.round} heading={timer.phase === 'round' ? 'Jetzt' : 'Als Nächstes'} openResult={openResult} big />
      )}
      {next && <RoundCard t={t} round={next} index={timer.round + 1} heading="Danach" />}
    </div>
  );
}

export function RoundCard({
  t,
  round,
  index,
  heading,
  openResult,
  big,
}: {
  t: Tournament;
  round: Round;
  index: number;
  heading: string;
  openResult?: (round: number, court: number) => void;
  big?: boolean;
}) {
  const name = (id: string) => playerName(t, id);
  return (
    <section className={`card round-card ${big ? 'big' : 'small-card'}`}>
      <h2>
        {heading}: Runde {index + 1}
      </h2>
      <div className="courts">
        {round.matches.map((m) => (
          <div key={m.court} className="court">
            {round.matches.length > 1 || t.settings.courts > 1 ? <div className="court-label">Platz {m.court + 1}</div> : null}
            <div className="team">
              {name(m.teamA[0])} & {name(m.teamA[1])}
            </div>
            <div className="vs">
              {m.result ? (
                <span className="score-chip">
                  {m.result.rawA} : {m.result.rawB}
                  <small>
                    {' '}
                    ({fmt1(m.result.normA)} : {fmt1(m.result.normB)})
                  </small>
                </span>
              ) : (
                'gegen'
              )}
            </div>
            <div className="team">
              {name(m.teamB[0])} & {name(m.teamB[1])}
            </div>
            {openResult && (
              <button className="btn btn-block mt-s" onClick={() => openResult(index, m.court)}>
                {m.result ? 'Ergebnis ändern' : 'Ergebnis eintragen'}
              </button>
            )}
          </div>
        ))}
      </div>
      {round.sitting.length > 0 && (
        <p className="sitting">
          <span>Pause:</span> {round.sitting.map(name).join(', ')}
        </p>
      )}
    </section>
  );
}
