import { useState } from 'react';
import { fmt1 } from '../format';
import { classicScore } from '../logic/classic';
import { normalize } from '../logic/scoring';
import { isClassic, playerName, type Tournament } from '../logic/tournament';
import { Sheet } from './Dialog';

interface Props {
  t: Tournament;
  round: number;
  court: number;
  onSave: (a: number, b: number) => void;
  onClear: () => void;
  onClose: () => void;
}

export function ResultSheet({ t, round, court, onSave, onClear, onClose }: Props) {
  const match = t.rounds[round].matches.find((m) => m.court === court)!;
  const classic = isClassic(t);
  const S = t.settings.pointSum;
  // Klassisch: Start bei einem gültigen Ergebnis (Hälfte/Hälfte), beide Werte gekoppelt
  const initial = match.result ?? (classic ? { rawA: classicScore(Math.ceil(S / 2), S).a, rawB: classicScore(Math.ceil(S / 2), S).b } : { rawA: 0, rawB: 0 });
  const [a, setAraw] = useState(initial.rawA);
  const [b, setBraw] = useState(initial.rawB);
  const setA = (v: number) => {
    if (!classic) return setAraw(v);
    const s = classicScore(v, S);
    setAraw(s.a);
    setBraw(s.b);
  };
  const setB = (v: number) => {
    if (!classic) return setBraw(v);
    const s = classicScore(v, S);
    setBraw(s.a);
    setAraw(s.b);
  };
  const n = normalize(a, b, S);
  const name = (id: string) => playerName(t, id);

  return (
    <Sheet onClose={onClose} label="Ergebnis eintragen">
      <div className="sheet-head">
        <span>
          Runde {round + 1}
          {t.rounds[round].matches.length > 1 && ` · Platz ${court + 1}`}
        </span>
        <button className="icon-btn" aria-label="Schließen" onClick={onClose}>
          ✕
        </button>
      </div>
      <ScoreRow team={`${name(match.teamA[0])} & ${name(match.teamA[1])}`} value={a} max={classic ? S : 999} onChange={setA} tone="a" />
      <ScoreRow team={`${name(match.teamB[0])} & ${name(match.teamB[1])}`} value={b} max={classic ? S : 999} onChange={setB} tone="b" />
      {classic ? (
        <p className="norm-preview">
          Gespielt bis {S}: Änderst du eine Seite, passt sich die andere an (Summe immer <strong>{S}</strong>).
        </p>
      ) : (
        <p className="norm-preview">
          Normiert auf {S}: <strong>{fmt1(n.normA)}</strong> : <strong>{fmt1(n.normB)}</strong>
        </p>
      )}
      <div className="sheet-actions">
        {match.result && (
          <button className="btn btn-danger-outline" onClick={onClear}>
            Löschen
          </button>
        )}
        <button className="btn btn-primary btn-xl grow" onClick={() => onSave(a, b)}>
          Speichern
        </button>
      </div>
    </Sheet>
  );
}

function ScoreRow({
  team,
  value,
  max,
  onChange,
  tone,
}: {
  team: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
  tone: 'a' | 'b';
}) {
  return (
    <div className={`score-row tone-${tone}`}>
      <div className="score-team">{team}</div>
      <div className="score-ctrl">
        <button className="score-btn" aria-label={`${team}: Punkt abziehen`} onClick={() => onChange(Math.max(0, value - 1))}>
          −
        </button>
        <input
          className="score-input"
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min={0}
          max={max}
          value={value}
          aria-label={`Punkte ${team}`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange(Number.isNaN(v) ? 0 : Math.max(0, Math.min(max, v)));
          }}
        />
        <button className="score-btn plus" aria-label={`${team}: Punkt dazu`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          +
        </button>
      </div>
    </div>
  );
}
