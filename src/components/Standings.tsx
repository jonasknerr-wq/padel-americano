import { fmt1, fmtSigned } from '../format';
import type { StandingRow } from '../logic/standings';

/** classic: klassischer Americano – „Punkte“ sind echte Teampunkte (ganzzahlig), keine Normierung. */
export function StandingsTable({ rows, inactive, classic = false }: { rows: StandingRow[]; inactive: Set<string>; classic?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="standings">
        <thead>
          <tr>
            <th className="num">#</th>
            <th className="left">Name</th>
            <th className="num" title="Matches">
              M
            </th>
            <th className="num" title="Siege / Unentschieden / Niederlagen">
              S/U/N
            </th>
            <th className="num" title={classic ? 'Gesamtpunkte' : 'Gesamtpunkte (normiert)'}>
              {classic ? 'Punkte' : 'Pkt'}
            </th>
            <th className="num strong" title="Ø Punkte pro Match">
              Ø
            </th>
            <th className="num" title="Ø Punktdifferenz pro Match">
              Ø Diff
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={inactive.has(r.id) ? 'inactive' : ''}>
              <td className="num rank">{r.rank}.</td>
              <td className="left name">
                {r.name}
                {inactive.has(r.id) && <span className="tag">ausgefallen</span>}
              </td>
              <td className="num">{r.matches}</td>
              <td className="num nowrap">
                {r.wins}/{r.draws}/{r.losses}
              </td>
              <td className="num">{classic ? Math.round(r.points) : fmt1(r.points)}</td>
              <td className="num strong">{fmt1(r.avgPoints)}</td>
              <td className="num">{r.matches ? fmtSigned(r.avgDiff) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StandingsLegend({ classic = false }: { classic?: boolean }) {
  if (classic) {
    return (
      <p className="muted small">
        M = Matches · S/U/N = Siege/Unentschieden/Niederlagen · Punkte = alle Punkte deiner Teams · Ø = Punkte pro Match (zählt für die
        Platzierung; haben alle gleich viele Matches, entspricht das der Reihenfolge nach Punkten) · Ø Diff = Punktdifferenz pro Match. Bei
        Gleichstand: Siege, Ø Diff, direkter Vergleich, Alphabet.
      </p>
    );
  }
  return (
    <p className="muted small">
      M = Matches · S/U/N = Siege/Unentschieden/Niederlagen · Pkt = normierte Punkte · Ø = Punkte pro Match (zählt für die Platzierung) · Ø Diff =
      Punktdifferenz pro Match. Bei Gleichstand: Siege, Ø Diff, direkter Vergleich, Alphabet.
    </p>
  );
}
