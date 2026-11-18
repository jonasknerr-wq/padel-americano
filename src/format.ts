const one = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const upTo1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

/** 15 → „15,0“ */
export const fmt1 = (n: number) => one.format(n);
/** 12.5 → „12,5“, 12 → „12“ */
export const fmtMin = (n: number) => upTo1.format(n);

export const fmtSigned = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±') + one.format(Math.abs(n));

export function fmtClock(sec: number): string {
  const s = Math.ceil(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** „Anna, Ben und Carl“ */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
}

/** „90 Min“ → „1:30 h“ */
export function fmtHours(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`;
}

const platz = (n: number) => (n === 1 ? '1 Platz' : `${n} Plätze`);

/**
 * Hinweis, wenn weniger Plätze genutzt werden als gewählt, z. B.
 * „6 Spieler: es wird nur 1 Platz genutzt.“ – sonst null.
 */
export function courtsNote(players: number, courts: number, used: number): string | null {
  if (players < 4 || used >= courts) return null;
  const verb = used === 1 ? 'wird' : 'werden';
  return `${players} Spieler: es ${verb} nur ${platz(used)} genutzt (4 Spieler pro Platz).`;
}

/** „Ab Runde 5 werden 3 Plätze genutzt statt 2.“ – nur wenn sich die Platzzahl ändert. */
export function courtsChange(before: number, after: number, fromRound: number): string | null {
  if (before === after) return null;
  return `Ab Runde ${fromRound + 1} ${after === 1 ? 'wird' : 'werden'} ${platz(after)} genutzt statt ${before}.`;
}
