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
