import { useState } from 'react';
import { fmt1 } from '../format';
import { normalize } from '../logic/scoring';
import { playerName, type Tournament } from '../logic/tournament';
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
  const [a, setA] = useState(match.result?.rawA ?? 0);
  const [b, setB] = useState(match.result?.rawB ?? 0);
  const n = normalize(a, b, t.settings.pointSum);
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
      <ScoreRow team={`${name(match.teamA[0])} & ${name(match.teamA[1])}`} value={a} onChange={setA} tone="a" />
      <ScoreRow team={`${name(match.teamB[0])} & ${name(match.teamB[1])}`} value={b} onChange={setB} tone="b" />
      <p className="norm-preview">
        Normiert auf {t.settings.pointSum}: <strong>{fmt1(n.normA)}</strong> : <strong>{fmt1(n.normB)}</strong>
      </p>
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

function ScoreRow({ team, value, onChange, tone }: { team: string; value: number; onChange: (v: number) => void; tone: 'a' | 'b' }) {
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
          max={999}
          value={value}
          aria-label={`Punkte ${team}`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange(Number.isNaN(v) ? 0 : Math.max(0, Math.min(999, v)));
          }}
        />
        <button className="score-btn plus" aria-label={`${team}: Punkt dazu`} onClick={() => onChange(Math.min(999, value + 1))}>
          +
        </button>
      </div>
    </div>
  );
}
