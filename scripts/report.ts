/** Gibt die Runden-Tabelle und Qualitätskennzahlen aller Kombinationen aus. */
import { chooseRounds } from '../src/logic/rounds';
import { generateSchedule, scheduleStats } from '../src/logic/schedule';

const t0 = Date.now();
console.log('| Spieler | Plätze (aktiv) | Dauer | Runden | Rundenlänge | Puffer | Matches/Spieler | Aussetzer/Runde | max. gleicher Partner | Ø versch. Partner | Doppel-Aussetzer | max. gleicher Gegner | Hinweis |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (let n = 4; n <= 8; n++) {
  for (const courts of [1, 2]) {
    for (const total of [60, 90, 120]) {
      const plan = chooseRounds(n, courts, { totalMinutes: total, warmupMinutes: 5, changeMinutes: 2 });
      const players = Array.from({ length: n }, (_, i) => `P${i + 1}`);
      const start = Date.now();
      const cw = process.env.CONSEC ? Number(process.env.CONSEC) : undefined;
      const rounds = generateSchedule({ players, rounds: plan.rounds, courts, seed: 12345, weights: cw ? { consecutive: cw } : undefined });
      const ms = Date.now() - start;
      const st = scheduleStats(rounds, players);
      const mp = plan.fair ? `${plan.minMatches}` : `${plan.playersWithMax}×${plan.maxMatches}, ${plan.playersWithMin}×${plan.minMatches}`;
      const avgDistinct = (Object.values(st.distinctPartners).reduce((a, b) => a + b, 0) / n).toFixed(1);
      const note = plan.fair ? '' : 'NICHT FAIR';
      console.log(`| ${n} | ${courts} (${plan.activeCourts}) | ${total} | ${plan.rounds} | ${plan.roundMinutes} | ${plan.bufferMinutes} | ${mp} | ${plan.sittingPerRound} | ${st.maxPartnerCount} | ${avgDistinct}/${n - 1} | ${st.consecutiveSits} | ${st.maxOpponentCount} | ${note} ${ms}ms |`);
    }
  }
}
console.log(`total ${Date.now() - t0}ms`);

// Experiment: 8 Spieler, 1 Platz – Doppel-Aussetzer strikt vs. weich
for (const w of [1e4, 300, 30]) {
  const players = Array.from({ length: 8 }, (_, i) => `P${i + 1}`);
  const rounds = generateSchedule({ players, rounds: 8, courts: 1, seed: 7, weights: { consecutive: w } });
  const st = scheduleStats(rounds, players);
  console.log(`\n8/1/90 consecutive weight ${w}: doppel=${st.consecutiveSits}, distinctPartners=${JSON.stringify(st.distinctPartners)}, maxPartner=${st.maxPartnerCount}, maxOpp=${st.maxOpponentCount}`);
  rounds.forEach((r, i) => console.log(`  R${i + 1}: ${r.matches.map((m) => `${m.teamA.join('+')} vs ${m.teamB.join('+')}`).join(' | ')}  aus: ${r.sitting.join(',')}`));
}
