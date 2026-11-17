import type { Player, PlayerId, Round } from './types';

export interface StandingRow {
  rank: number;
  id: PlayerId;
  name: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number; // normiert, gesamt
  avgPoints: number; // Ø pro Match
  avgDiff: number; // Ø (eigene − gegnerische normierte Punkte)
}

const r1 = (x: number) => Math.round(x * 100) / 100;

/**
 * Live-Tabelle. Sortierung:
 *   1. Ø Punkte pro Match  2. Siege  3. Ø Punktdifferenz
 *   4. direkter Vergleich (normierte Punktdifferenz in Matches, in denen
 *      die punktgleichen Spieler Gegner waren)  5. alphabetisch
 * Spieler ohne Match stehen immer hinter Spielern mit Matches.
 * Gleichstand in 1–4 → geteilter Rang.
 */
export function computeStandings(players: Player[], rounds: Round[]): StandingRow[] {
  const rows = new Map<PlayerId, StandingRow>();
  for (const p of players) {
    rows.set(p.id, { rank: 0, id: p.id, name: p.name, matches: 0, wins: 0, draws: 0, losses: 0, points: 0, avgPoints: 0, avgDiff: 0 });
  }
  const diffSum = new Map<PlayerId, number>();
  // h2h.get(a).get(b) = Σ (a − b) normierte Punkte in Matches, in denen a gegen b spielte
  const h2h = new Map<PlayerId, Map<PlayerId, number>>();
  const addH2H = (a: PlayerId, b: PlayerId, d: number) => {
    if (!h2h.has(a)) h2h.set(a, new Map());
    const m = h2h.get(a)!;
    m.set(b, (m.get(b) ?? 0) + d);
  };

  for (const round of rounds) {
    for (const m of round.matches) {
      const res = m.result;
      if (!res) continue;
      const sides: [PlayerId[], number, number, number, number][] = [
        [m.teamA, res.normA, res.normB, res.rawA, res.rawB],
        [m.teamB, res.normB, res.normA, res.rawB, res.rawA],
      ];
      for (const [team, own, other, rawOwn, rawOther] of sides) {
        for (const id of team) {
          const row = rows.get(id);
          if (!row) continue;
          row.matches++;
          row.points += own;
          if (rawOwn > rawOther) row.wins++;
          else if (rawOwn < rawOther) row.losses++;
          else row.draws++;
          diffSum.set(id, (diffSum.get(id) ?? 0) + own - other);
        }
      }
      for (const x of m.teamA)
        for (const y of m.teamB) {
          addH2H(x, y, res.normA - res.normB);
          addH2H(y, x, res.normB - res.normA);
        }
    }
  }

  const list = [...rows.values()];
  for (const row of list) {
    row.points = Math.round(row.points * 10) / 10;
    row.avgPoints = row.matches ? r1(row.points / row.matches) : 0;
    row.avgDiff = row.matches ? r1((diffSum.get(row.id) ?? 0) / row.matches) : 0;
  }

  const primary = (a: StandingRow, b: StandingRow) =>
    Number(b.matches > 0) - Number(a.matches > 0) ||
    b.avgPoints - a.avgPoints ||
    b.wins - a.wins ||
    b.avgDiff - a.avgDiff;

  list.sort((a, b) => primary(a, b) || a.name.localeCompare(b.name, 'de'));

  // Gruppen mit Gleichstand: direkter Vergleich innerhalb der Gruppe
  const result: StandingRow[] = [];
  let i = 0;
  while (i < list.length) {
    let j = i + 1;
    while (j < list.length && primary(list[i], list[j]) === 0) j++;
    const group = list.slice(i, j);
    if (group.length > 1) {
      const ids = new Set(group.map((g) => g.id));
      const score = new Map<PlayerId, number>();
      for (const g of group) {
        let s = 0;
        for (const [opp, d] of h2h.get(g.id) ?? []) if (ids.has(opp)) s += d;
        score.set(g.id, Math.round(s * 10) / 10);
      }
      group.sort((a, b) => score.get(b.id)! - score.get(a.id)! || a.name.localeCompare(b.name, 'de'));
      // Ränge: gleicher Rang nur bei identischem direktem Vergleich
      let k = 0;
      while (k < group.length) {
        let l = k + 1;
        while (l < group.length && score.get(group[l].id) === score.get(group[k].id)) l++;
        for (let q = k; q < l; q++) group[q].rank = result.length + k + 1;
        k = l;
      }
    } else {
      group[0].rank = result.length + 1;
    }
    result.push(...group);
    i = j;
  }
  return result;
}
