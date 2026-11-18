/**
 * Gibt die Runden-Tabelle und Qualitätskennzahlen aller Kombinationen aus.
 * Aufruf: npm run report            (alle Kombinationen)
 *         PLAYERS=12 npm run report (nur 12 Spieler)
 */
import { chooseRounds, COURT_OPTIONS, DURATION_OPTIONS, MAX_PLAYERS, MIN_PLAYERS } from '../src/logic/rounds';
import { generateSchedule, scheduleStats } from '../src/logic/schedule';

const only = process.env.PLAYERS ? Number(process.env.PLAYERS) : null;
const t0 = Date.now();
let slowest = 0;
console.log('| Spieler | Plätze (aktiv) | Dauer | Runden × Min | Matches/Spieler | Aussetzer/Runde | max. gleicher Partner | Ø versch. Partner | Doppel-Aussetzer | max. gleicher Gegner | Hinweis | ms |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
  if (only && n !== only) continue;
  for (const courts of COURT_OPTIONS) {
    // Gleiche aktive Platzzahl wie die Zeile davor → überspringen (identisches Ergebnis)
    if (courts > 1 && Math.floor(n / 4) < courts) continue;
    for (const total of DURATION_OPTIONS) {
      const plan = chooseRounds(n, courts, { totalMinutes: total, warmupMinutes: 5, changeMinutes: 2 });
      const players = Array.from({ length: n }, (_, i) => `P${i + 1}`);
      const start = performance.now();
      const rounds = generateSchedule({ players, rounds: plan.rounds, courts, seed: 12345 });
      const ms = performance.now() - start;
      slowest = Math.max(slowest, ms);
      const st = scheduleStats(rounds, players);
      const mp = plan.fair ? `${plan.minMatches}` : `${plan.playersWithMax}×${plan.maxMatches}, ${plan.playersWithMin}×${plan.minMatches}`;
      const avgDistinct = (Object.values(st.distinctPartners).reduce((a, b) => a + b, 0) / n).toFixed(1);
      const note = [plan.fair ? '' : 'NICHT FAIR', plan.inRange ? '' : 'Länge außerhalb 8–20'].filter(Boolean).join(', ');
      console.log(
        `| ${n} | ${courts} (${plan.activeCourts}) | ${total} | ${plan.rounds} × ${plan.roundMinutes} | ${mp} | ${plan.sittingPerRound} | ${st.maxPartnerCount} | ${avgDistinct}/${n - 1} | ${st.consecutiveSits} | ${st.maxOpponentCount} | ${note} | ${ms.toFixed(0)} |`,
      );
    }
  }
}
console.log(`\ngesamt ${Date.now() - t0} ms, langsamste Kombination ${slowest.toFixed(0)} ms`);
