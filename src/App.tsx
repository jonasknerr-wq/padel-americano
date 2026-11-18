import { useEffect, useMemo, useState } from 'react';
import { ConfirmProvider, useConfirm } from './components/Dialog';
import { Final } from './components/Final';
import { Game } from './components/Game';
import { Layout } from './components/Layout';
import { Matches } from './components/Matches';
import { Players } from './components/Players';
import { ResultSheet } from './components/ResultSheet';
import { Setup } from './components/Setup';
import { StandingsLegend, StandingsTable } from './components/Standings';
import { signal, useWakeLock } from './device';
import { newSeed } from './logic/rng';
import { computeStandings } from './logic/standings';
import { tick } from './logic/timer';
import {
  addPlayer,
  clearResult,
  dropPlayer,
  finishTournament,
  reopenTournament,
  setResult,
  timerConfig,
  undo,
  type Tournament,
} from './logic/tournament';
import { useAppState, type AppState } from './store';

type Tab = 'game' | 'table' | 'matches' | 'players';

export default function App() {
  const [state, update] = useAppState();

  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.theme);
  }, [state.theme]);

  return (
    <ConfirmProvider>
      <Shell state={state} update={update} />
    </ConfirmProvider>
  );
}

function Shell({ state, update }: { state: AppState; update: (fn: (s: AppState) => AppState) => void }) {
  const ask = useConfirm();
  const t = state.tournament;

  const newTournament = async () => {
    const ok = await ask({
      title: 'Neues Turnier?',
      text: <p>Der aktuelle Stand mit allen Ergebnissen wird gelöscht. Die Spielernamen bleiben für das Setup erhalten.</p>,
      confirm: 'Löschen und neu starten',
      danger: true,
    });
    if (!ok || !t) return;
    const names = t.players.filter((p) => t.activeIds.includes(p.id)).map((p) => p.name);
    update((s) => ({ ...s, tournament: null, draft: { ...s.draft, names, seed: newSeed() } }));
  };

  if (!t) {
    return (
      <Setup
        draft={state.draft}
        onChange={(draft) => update((s) => ({ ...s, draft }))}
        onStart={(tournament) => update((s) => ({ ...s, tournament }))}
      />
    );
  }

  const setT = (fn: (t: Tournament) => Tournament) => update((s) => (s.tournament ? { ...s, tournament: fn(s.tournament) } : s));

  if (t.finished) {
    const rows = computeStandings(t.players, t.rounds);
    return (
      <Final
        rows={rows}
        inactive={new Set(t.players.filter((p) => !t.activeIds.includes(p.id)).map((p) => p.id))}
        onBack={() => setT(reopenTournament)}
        onNew={newTournament}
      />
    );
  }

  return <Running t={t} setT={setT} theme={state.theme} update={update} onNew={newTournament} />;
}

function Running({
  t,
  setT,
  theme,
  update,
  onNew,
}: {
  t: Tournament;
  setT: (fn: (t: Tournament) => Tournament) => void;
  theme: AppState['theme'];
  update: (fn: (s: AppState) => AppState) => void;
  onNew: () => void;
}) {
  const [tab, setTab] = useState<Tab>('game');
  const [editing, setEditing] = useState<{ round: number; court: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const cfg = useMemo(() => timerConfig(t), [t.settings, t.plan, t.rounds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useWakeLock(t.timer.running);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Timer-Übergänge (auch nachgeholt nach Display-Sperre)
  useEffect(() => {
    const { state, events } = tick(t.timer, cfg, now);
    if (state !== t.timer) setT((x) => ({ ...x, timer: tick(x.timer, cfg, now).state }));
    if (events.length) {
      signal(events);
      if (events.includes('roundEnd')) setTab('game');
    }
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => computeStandings(t.players, t.rounds), [t.players, t.rounds]);
  const inactive = useMemo(() => new Set(t.players.filter((p) => !t.activeIds.includes(p.id)).map((p) => p.id)), [t.players, t.activeIds]);
  const lastUndo = t.undo[t.undo.length - 1];

  const headerTitle =
    t.timer.phase === 'done'
      ? 'Alle Runden gespielt'
      : t.timer.phase === 'warmup'
        ? 'Einspielen'
        : `Runde ${t.timer.round + 1}/${t.rounds.length}`;

  const tabbar = (
    <nav className="tabbar">
      {(
        [
          ['game', 'Spiel', '⏱'],
          ['table', 'Tabelle', '🏆'],
          ['matches', 'Matches', '📋'],
          ['players', 'Spieler', '👥'],
        ] as [Tab, string, string][]
      ).map(([id, label, icon]) => (
        <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
          <span className="tab-icon" aria-hidden>
            {icon}
          </span>
          {label}
        </button>
      ))}
    </nav>
  );

  return (
    <Layout
      className="running"
      scrollKey={tab}
      header={
        <>
          <div className="app-header">
            <h1>{headerTitle}</h1>
            <button
              className="btn btn-small undo-btn"
              disabled={!lastUndo}
              title={lastUndo ? `Rückgängig: ${lastUndo.label}` : 'Nichts rückgängig zu machen'}
              onClick={() => setT(undo)}
            >
              ↶ Rückgängig
            </button>
          </div>
          {lastUndo && <div className="undo-hint">Zuletzt: {lastUndo.label}</div>}
        </>
      }
      footer={tabbar}
    >
        {tab === 'game' && (
          <Game
            t={t}
            cfg={cfg}
            now={now}
            setTimer={setT}
            openResult={(round, court) => setEditing({ round, court })}
            onFinish={() => setT(finishTournament)}
          />
        )}
        {tab === 'table' && (
          <section className="card">
            <h2>Live-Tabelle</h2>
            <StandingsTable rows={rows} inactive={inactive} />
            <StandingsLegend />
          </section>
        )}
        {tab === 'matches' && <Matches t={t} openResult={(round, court) => setEditing({ round, court })} />}
        {tab === 'players' && (
          <Players
            t={t}
            theme={theme}
            setTheme={(th) => update((s) => ({ ...s, theme: th }))}
            onDrop={(id) => setT((x) => dropPlayer(x, id))}
            onDropAndFinish={(id) => setT((x) => finishTournament({ ...x, activeIds: x.activeIds.filter((a) => a !== id) }))}
            onAdd={(name) => {
              try {
                const next = addPlayer(t, name); // synchron prüfen, damit Fehler hier landen
                setT(() => next);
                return null;
              } catch (e) {
                return (e as Error).message;
              }
            }}
            onFinish={() => setT(finishTournament)}
            onNew={onNew}
          />
        )}

      {editing && t.rounds[editing.round] && (
        <ResultSheet
          t={t}
          round={editing.round}
          court={editing.court}
          onClose={() => setEditing(null)}
          onSave={(a, b) => {
            setT((x) => setResult(x, editing.round, editing.court, a, b));
            setEditing(null);
          }}
          onClear={() => {
            setT((x) => clearResult(x, editing.round, editing.court));
            setEditing(null);
          }}
        />
      )}
    </Layout>
  );
}
