import { fmt1 } from '../format';
import { isClassic, playerName, type Tournament } from '../logic/tournament';

export function Matches({ t, openResult }: { t: Tournament; openResult: (round: number, court: number) => void }) {
  const name = (id: string) => playerName(t, id);
  const classic = isClassic(t);
  const editableUpTo = t.timer.phase === 'done' || t.finished ? t.rounds.length - 1 : t.timer.round;

  return (
    <div className="matches">
      {t.rounds.map((r, ri) => {
        const replan = t.replans.filter((p) => p.fromRound === ri);
        const status =
          ri < t.timer.round || t.timer.phase === 'done'
            ? 'gespielt'
            : ri === t.timer.round
              ? t.timer.phase === 'round'
                ? 'läuft'
                : 'als Nächstes'
              : 'geplant';
        return (
          <section key={ri} className={`card match-round ${ri > editableUpTo ? 'future' : ''}`}>
            {replan.map((p, k) => (
              <p key={k} className="replan-note">
                ↻ Neu geplant: {p.reason}
              </p>
            ))}
            <h2>
              Runde {ri + 1} <span className={`badge badge-${status.replace(/\s/g, '-')}`}>{status}</span>
            </h2>
            {r.matches.map((m) => {
              const editable = ri <= editableUpTo;
              return (
                <button
                  key={m.court}
                  className="match-row"
                  disabled={!editable}
                  onClick={() => openResult(ri, m.court)}
                  aria-label={`Runde ${ri + 1} Platz ${m.court + 1} ${m.result ? 'Ergebnis ändern' : 'Ergebnis eintragen'}`}
                >
                  {r.matches.length > 1 && <span className="court-pill">P{m.court + 1}</span>}
                  <span className="match-teams">
                    <span className={m.result && m.result.rawA > m.result.rawB ? 'winner' : ''}>
                      {name(m.teamA[0])} & {name(m.teamA[1])}
                    </span>
                    <span className={m.result && m.result.rawB > m.result.rawA ? 'winner' : ''}>
                      {name(m.teamB[0])} & {name(m.teamB[1])}
                    </span>
                  </span>
                  <span className="match-score">
                    {m.result ? (
                      <>
                        <span className="raw">
                          {m.result.rawA} : {m.result.rawB}
                        </span>
                        {!classic && (
                          <span className="norm">
                            {fmt1(m.result.normA)} : {fmt1(m.result.normB)}
                          </span>
                        )}
                      </>
                    ) : editable ? (
                      <span className="enter">Eintragen ›</span>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </span>
                </button>
              );
            })}
            {r.sitting.length > 0 && <p className="sitting small">Pause: {r.sitting.map(name).join(', ')}</p>}
          </section>
        );
      })}
      <p className="muted small center">
        {classic
          ? `Klassischer Americano: jedes Match bis ${t.settings.pointSum} Punkte.`
          : `Oben: Rohergebnis (Ballwechsel) · darunter: normiert auf ${t.settings.pointSum}`}
      </p>
    </div>
  );
}
