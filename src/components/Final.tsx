import { fmt1 } from '../format';
import type { StandingRow } from '../logic/standings';
import { Layout } from './Layout';
import { StandingsLegend, StandingsTable } from './Standings';

interface Props {
  rows: StandingRow[];
  /** klassischer Americano: echte Punkte statt normierter */
  classic?: boolean;
  inactive: Set<string>;
  onBack: () => void;
  onNew: () => void;
}

export function Final({ rows, inactive, classic = false, onBack, onNew }: Props) {
  const ranked = rows.filter((r) => r.matches > 0);
  const podium = [1, 2, 3].map((place) => ranked.filter((r) => r.rank === place));
  // Bei geteiltem Platz rutschen die folgenden Plätze nach (1, 1, 3 …)
  const order = [1, 0, 2]; // Platz 2 links, 1 Mitte, 3 rechts

  return (
    <Layout
      className="final"
      header={
        <div className="app-header">
          <h1>Endstand</h1>
        </div>
      }
      footer={
        <div className="footer-actions">
          <button className="btn" onClick={onBack}>
            Zurück
          </button>
          <button className="btn btn-primary" onClick={onNew}>
            Neues Turnier
          </button>
        </div>
      }
    >
      <section className="podium" aria-label="Siegerpodest">
        {order.map((i) => (
          <div key={i} className={`podium-col place-${i + 1}`}>
            <div className="podium-names">
              {podium[i].length ? (
                podium[i].map((r) => (
                  <div key={r.id}>
                    <div className="podium-name">{r.name}</div>
                    <div className="podium-score">Ø {fmt1(r.avgPoints)}</div>
                  </div>
                ))
              ) : (
                <div className="muted">–</div>
              )}
            </div>
            <div className="podium-block">{i + 1}</div>
          </div>
        ))}
      </section>
      <section className="card">
        <StandingsTable rows={rows} inactive={inactive} classic={classic} />
        <StandingsLegend classic={classic} />
      </section>
    </Layout>
  );
}
