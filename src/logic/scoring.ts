import type { MatchResult } from './types';

/**
 * Normiert ein Rohergebnis auf die Punktsumme S, gerundet auf eine
 * Nachkommastelle. Gerechnet wird in Zehnteln, Team B bekommt den Rest –
 * dadurch ist die Summe immer exakt S.
 */
export function normalize(rawA: number, rawB: number, total: number): { normA: number; normB: number } {
  const tenths = Math.round(total * 10);
  if (rawA + rawB <= 0) {
    const half = Math.floor(tenths / 2);
    return { normA: half / 10, normB: (tenths - half) / 10 };
  }
  const aTenths = Math.round((tenths * rawA) / (rawA + rawB));
  return { normA: aTenths / 10, normB: (tenths - aTenths) / 10 };
}

export function makeResult(rawA: number, rawB: number, total: number): MatchResult {
  const a = Math.max(0, Math.round(rawA));
  const b = Math.max(0, Math.round(rawB));
  return { rawA: a, rawB: b, ...normalize(a, b, total) };
}
