import { useState } from 'react';
import { courtsChange, courtsNote } from '../format';
import { activeCourts, MAX_PLAYERS } from '../logic/rounds';
import { scheduleStats } from '../logic/schedule';
import { isClassic, replanFrom, type Tournament } from '../logic/tournament';
import type { Theme } from '../store';
import { useConfirm } from './Dialog';

interface Props {
  t: Tournament;
  theme: Theme;
  setTheme: (t: Theme) => void;
  onDrop: (id: string) => void;
  onDropAndFinish: (id: string) => void;
  onAdd: (name: string) => string | null;
  onFinish: () => void;
  onNew: () => void;
}

export function Players({ t, theme, setTheme, onDrop, onDropAndFinish, onAdd, onFinish, onNew }: Props) {
  const ask = useConfirm();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const from = replanFrom(t);
  const canReplan = from < t.rounds.length;
  const active = t.players.filter((p) => t.activeIds.includes(p.id));
  const inactive = t.players.filter((p) => !t.activeIds.includes(p.id));
  const played = scheduleStats(
    t.rounds.slice(0, from),
    t.players.map((p) => p.id),
  ).matches;
  const planned = scheduleStats(t.rounds, t.players.map((p) => p.id)).matches;
  const courts = t.settings.courts;
  const usedNow = activeCourts(active.length, courts);
  const usedNote = courtsNote(active.length, courts, usedNow);
  const changeNote = (count: number) => courtsChange(usedNow, activeCourts(count, courts), from);

  const drop = async (id: string, name: string) => {
    if (active.length <= 4) {
      const ok = await ask({
        title: `${name} fällt aus?`,
        text: <p>Dann sind nur noch {active.length - 1} Spieler übrig – zu wenig für ein Match. Das Turnier wird beendet und der Endstand angezeigt.</p>,
        confirm: 'Turnier beenden',
        danger: true,
      });
      if (ok) onDropAndFinish(id);
      return;
    }
    const ok = await ask({
      title: `${name} fällt aus?`,
      text: (
        <p>
          {canReplan ? `Der Restplan ab Runde ${from + 1} wird für die übrigen ${active.length - 1} Spieler neu berechnet.` : 'Es gibt keine weiteren Runden mehr.'}{' '}
          Bisherige Ergebnisse bleiben, {name} bleibt mit Ø-Wertung in der Tabelle.
          {canReplan && changeNote(active.length - 1) && <strong> {changeNote(active.length - 1)}</strong>}
        </p>
      ),
      confirm: 'Fällt aus',
      danger: true,
    });
    if (ok) onDrop(id);
  };

  const add = async (name: string) => {
    const n = name.trim();
    if (!n) return setError('Bitte einen Namen eingeben.');
    const ok = await ask({
      title: `${n} kommt dazu?`,
      text: (
        <p>
          Der Restplan ab Runde {from + 1} wird neu berechnet.
          {changeNote(active.length + 1) && <strong> {changeNote(active.length + 1)}</strong>}
        </p>
      ),
      confirm: 'Hinzufügen',
    });
    if (!ok) return;
    const err = onAdd(n);
    setError(err);
    if (!err) setInput('');
  };

  return (
    <div className="players">
      <section className="card">
        <h2>Dabei ({active.length})</h2>
        {usedNote && <p className="court-note">{usedNote}</p>}
        <ul className="player-list">
          {active.map((p) => (
            <li key={p.id}>
              <span className="grow">
                <strong>{p.name}</strong>
                <span className="muted small">
                  {' '}
                  · {played[p.id] ?? 0} gespielt · {planned[p.id] ?? 0} geplant
                </span>
              </span>
              {canReplan && (
                <button className="btn btn-small btn-danger-outline" onClick={() => drop(p.id, p.name)}>
                  Fällt aus
                </button>
              )}
            </li>
          ))}
        </ul>
        {inactive.length > 0 && (
          <>
            <h3>Ausgefallen</h3>
            <ul className="player-list">
              {inactive.map((p) => (
                <li key={p.id}>
                  <span className="grow muted">
                    {p.name} · {planned[p.id] ?? 0} Matches
                  </span>
                  {canReplan && active.length < MAX_PLAYERS && (
                    <button className="btn btn-small" onClick={() => add(p.name)}>
                      Wieder dabei
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {canReplan && active.length < MAX_PLAYERS && (
          <form
            className="add-row mt"
            onSubmit={(e) => {
              e.preventDefault();
              void add(input);
            }}
          >
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Nachzügler" aria-label="Name Nachzügler" maxLength={24} />
            <button className="btn btn-primary" type="submit">
              Hinzufügen
            </button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
        {canReplan && (
          <p className="muted small">
            Änderungen gelten ab Runde {from + 1}. Bereits gespielte Runden bleiben unverändert. Maximal {MAX_PLAYERS} Spieler.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Darstellung</h2>
        <div className="segmented" role="radiogroup">
          {(['system', 'light', 'dark'] as Theme[]).map((v) => (
            <button key={v} role="radio" aria-checked={theme === v} className={theme === v ? 'active' : ''} onClick={() => setTheme(v)}>
              {v === 'system' ? 'Auto' : v === 'light' ? 'Hell' : 'Dunkel'}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Turnier</h2>
        <p className="muted small">
          {isClassic(t)
            ? `Klassisch · ${t.rounds.length} Runden · bis ${t.settings.pointSum} Punkte · Seed ${t.seed}`
            : `${t.plan.rounds} Runden à ${t.plan.roundMinutes} Min. · Punktsumme ${t.settings.pointSum} · Seed ${t.seed}`}
        </p>
        <div className="stack">
          <button
            className="btn"
            onClick={async () => {
              if (await ask({ title: 'Turnier jetzt beenden?', text: <p>Runden ohne Ergebnis entfallen. Du kannst danach zum Turnier zurückkehren.</p>, confirm: 'Beenden' }))
                onFinish();
            }}
          >
            Turnier beenden & Endstand
          </button>
          <button className="btn btn-danger-outline" onClick={onNew}>
            Neues Turnier
          </button>
        </div>
      </section>
    </div>
  );
}
