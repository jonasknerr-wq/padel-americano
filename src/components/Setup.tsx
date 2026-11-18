import { useMemo, useRef, useState } from 'react';
import { courtsNote, fmtHours, fmtMin, joinNames } from '../format';
import { newSeed } from '../logic/rng';
import { activeCourts, COURT_OPTIONS, DURATION_OPTIONS, MAX_PLAYERS, MAX_ROUND_MINUTES, MIN_ROUND_MINUTES } from '../logic/rounds';
import { scheduleStats } from '../logic/schedule';
import { buildSchedule, createTournament, validateNames, type Settings, type Tournament } from '../logic/tournament';
import type { Player } from '../logic/types';
import type { SetupDraft } from '../store';
import { Layout } from './Layout';

interface Props {
  draft: SetupDraft;
  onChange: (d: SetupDraft) => void;
  onStart: (t: Tournament) => void;
}

const toPlayers = (names: string[]): Player[] => names.map((name, i) => ({ id: `p${i + 1}`, name: name.trim() }));

export function Setup({ draft, onChange, onStart }: Props) {
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { names, settings, seed } = draft;

  const set = (patch: Partial<Settings>) => onChange({ ...draft, settings: { ...settings, ...patch } });

  const addName = () => {
    const n = input.trim();
    if (!n) return setInputError('Bitte einen Namen eingeben.');
    if (names.some((x) => x.toLowerCase() === n.toLowerCase())) return setInputError(`„${n}“ ist schon dabei.`);
    if (names.length >= MAX_PLAYERS) return setInputError(`Höchstens ${MAX_PLAYERS} Spieler.`);
    onChange({ ...draft, names: [...names, n] });
    setInput('');
    setInputError(null);
    inputRef.current?.focus();
  };

  const removeName = (i: number) => onChange({ ...draft, names: names.filter((_, k) => k !== i) });

  const nameError = validateNames(names);
  const players = useMemo(() => toPlayers(names), [names]);

  const preview = useMemo(() => {
    if (nameError) return null;
    const { plan, rounds } = buildSchedule(players, settings, seed);
    const stats = scheduleStats(rounds, players.map((p) => p.id));
    return { plan, rounds, stats };
  }, [players, settings, seed, nameError]);

  const settingsError =
    preview && preview.plan.roundMinutes < 1 ? 'Die Gesamtdauer reicht mit diesen Einstellungen nicht für eine Runde.' : null;

  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const usedNote = courtsNote(names.length, settings.courts, activeCourts(names.length, settings.courts));

  return (
    <Layout
      className="setup"
      header={
        <div className="app-header">
          <h1>Padel Americano</h1>
        </div>
      }
      footer={
        <div className="footer-actions">
          <button
            className="btn btn-primary btn-xl"
            disabled={!preview || !!settingsError}
            onClick={() => onStart(createTournament(players, settings, seed))}
          >
            {preview ? 'Turnier starten' : nameError ?? 'Turnier starten'}
          </button>
        </div>
      }
    >
      <section className="card">
        <h2>
          Spieler ({names.length}/{MAX_PLAYERS})
        </h2>
        <ul className="name-list">
          {names.map((n, i) => (
            <li key={n + i}>
              <span className="name-num">{i + 1}</span>
              <span className="name-text">{n}</span>
              <button className="icon-btn" aria-label={`${n} entfernen`} onClick={() => removeName(i)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        {names.length < MAX_PLAYERS && (
          <form
            className="add-row"
            onSubmit={(e) => {
              e.preventDefault();
              addName();
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setInputError(null);
              }}
              placeholder="Name"
              aria-label="Spielername"
              autoComplete="off"
              enterKeyHint="done"
              maxLength={24}
            />
            <button className="btn btn-primary" type="submit">
              Hinzufügen
            </button>
          </form>
        )}
        {inputError && <p className="error">{inputError}</p>}
        {!inputError && nameError && names.length > 0 && <p className="hint">{nameError}</p>}
      </section>

      <section className="card">
        <h2 id="dur-label">Gesamtdauer</h2>
        <DurationStepper value={settings.totalMinutes} onChange={(v) => set({ totalMinutes: v })} />
        <h2 className="mt">Verfügbare Plätze</h2>
        <Segmented value={settings.courts} options={COURT_OPTIONS} label={(v) => `${v} ${v === 1 ? 'Platz' : 'Plätze'}`} onChange={(v) => set({ courts: v })} />
        {usedNote && <p className="court-note">{usedNote}</p>}

        <details className="advanced">
          <summary>Weitere Einstellungen</summary>
          <Stepper label="Einspielzeit" unit="Min" value={settings.warmupMinutes} min={0} max={20} onChange={(v) => set({ warmupMinutes: v })} />
          <Stepper label="Wechselzeit" unit="Min" value={settings.changeMinutes} min={0} max={10} onChange={(v) => set({ changeMinutes: v })} />
          <Stepper label="Punktsumme pro Match" unit="Pkt" value={settings.pointSum} min={4} max={64} onChange={(v) => set({ pointSum: v })} />
        </details>
      </section>

      {preview && (
        <section className="card preview">
          <div className="preview-head">
            <h2>Vorschau</h2>
            <button className="btn btn-small" onClick={() => onChange({ ...draft, seed: newSeed() })}>
              Neu mischen
            </button>
          </div>
          <div className="facts">
            <Fact big={`${preview.plan.rounds}`} small="Runden" />
            <Fact big={fmtMin(preview.plan.roundMinutes)} small="Min pro Runde" />
            <Fact
              big={preview.plan.fair ? `${preview.plan.minMatches}` : `${preview.plan.minMatches}–${preview.plan.maxMatches}`}
              small="Matches je Spieler"
            />
            <Fact big={`${preview.plan.activeCourts}`} small={preview.plan.activeCourts === 1 ? 'Platz aktiv' : 'Plätze aktiv'} />
          </div>
          <p className="muted small">
            {settings.warmupMinutes > 0 && `${fmtMin(settings.warmupMinutes)} Min Einspielen · `}
            {preview.plan.rounds > 1 && `${fmtMin(settings.changeMinutes)} Min Wechsel · `}
            {preview.plan.bufferMinutes > 0 ? `${fmtMin(preview.plan.bufferMinutes)} Min Puffer` : 'kein Puffer'}
          </p>

          {!preview.plan.fair && <UnfairHint stats={preview.stats.matches} name={name} />}
          {!preview.plan.inRange && !settingsError && (
            <p className="warning">
              Hinweis: Die Rundenlänge liegt außerhalb von {MIN_ROUND_MINUTES}–{MAX_ROUND_MINUTES} Minuten.
            </p>
          )}
          {settingsError && <p className="error">{settingsError}</p>}

          {preview.plan.sittingPerRound > 0 && (
            <>
              <h3>Wer wann aussetzt</h3>
              <div className="sit-grid-wrap">
                <table className="sit-grid">
                  <thead>
                    <tr>
                      <th />
                      {preview.rounds.map((_, i) => (
                        <th key={i}>R{i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => (
                      <tr key={p.id}>
                        <th>{p.name}</th>
                        {preview.rounds.map((r, i) => (
                          <td key={i} className={r.sitting.includes(p.id) ? 'sit' : 'play'}>
                            {r.sitting.includes(p.id) ? 'Pause' : '●'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <details>
            <summary>Kompletten Spielplan anzeigen</summary>
            <ol className="plan-list">
              {preview.rounds.map((r, i) => (
                <li key={i}>
                  <strong>Runde {i + 1}</strong>
                  {r.matches.map((m) => (
                    <div key={m.court}>
                      {r.matches.length > 1 && `Platz ${m.court + 1}: `}
                      {name(m.teamA[0])} & {name(m.teamA[1])} – {name(m.teamB[0])} & {name(m.teamB[1])}
                    </div>
                  ))}
                  {r.sitting.length > 0 && <div className="muted">Pause: {r.sitting.map(name).join(', ')}</div>}
                </li>
              ))}
            </ol>
          </details>
        </section>
      )}
    </Layout>
  );
}

function UnfairHint({ stats, name }: { stats: Record<string, number>; name: (id: string) => string }) {
  const counts = Object.values(stats);
  const max = Math.max(...counts);
  const more = Object.keys(stats).filter((id) => stats[id] === max).map(name);
  const less = Object.keys(stats).filter((id) => stats[id] < max).map(name);
  return (
    <p className="warning">
      <strong>Nicht alle spielen gleich oft:</strong> {joinNames(more)} {more.length === 1 ? 'spielt' : 'spielen'} {max},{' '}
      {joinNames(less)} {less.length === 1 ? 'spielt' : 'spielen'} {max - 1} Matches. Die Tabelle wertet deshalb nach Ø Punkten pro
      Match.
    </p>
  );
}

function Fact({ big, small }: { big: string; small: string }) {
  return (
    <div className="fact">
      <div className="fact-big">{big}</div>
      <div className="fact-small">{small}</div>
    </div>
  );
}

/**
 * Gesamtdauer 60–240 Min in 30er-Schritten. Sieben Knöpfe passen nicht in eine
 * Zeile, deshalb Minus/Plus mit großem Wert in der Mitte: kompakt, große
 * Touch-Flächen, und der Standard (90 Min) ist mit einem Tipp erreichbar.
 */
function DurationStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const i = Math.max(0, DURATION_OPTIONS.indexOf(value));
  const prev = DURATION_OPTIONS[i - 1];
  const next = DURATION_OPTIONS[i + 1];
  return (
    <div className="big-stepper" role="group" aria-labelledby="dur-label">
      <button className="btn btn-icon" aria-label="30 Minuten weniger" disabled={prev === undefined} onClick={() => onChange(prev)}>
        −
      </button>
      <div className="big-stepper-value" aria-live="polite">
        <strong>{value} Min</strong>
        <span className="muted small">{fmtHours(value)}</span>
      </div>
      <button className="btn btn-icon" aria-label="30 Minuten mehr" disabled={next === undefined} onClick={() => onChange(next)}>
        +
      </button>
    </div>
  );
}

function Segmented<T extends number>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: T[];
  label: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o} role="radio" aria-checked={o === value} className={o === value ? 'active' : ''} onClick={() => onChange(o)}>
          {label(o)}
        </button>
      ))}
    </div>
  );
}

function Stepper({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <div className="stepper-ctrl">
        <button className="icon-btn" aria-label={`${label} verringern`} onClick={() => onChange(clamp(value - 1))}>
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          aria-label={label}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) onChange(clamp(Math.round(v)));
          }}
        />
        <span className="unit">{unit}</span>
        <button className="icon-btn" aria-label={`${label} erhöhen`} onClick={() => onChange(clamp(value + 1))}>
          +
        </button>
      </div>
    </div>
  );
}
