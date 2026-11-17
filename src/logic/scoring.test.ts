import { describe, expect, it } from 'vitest';
import { normalize } from './scoring';

describe('normalize', () => {
  it('10:6 → 15:9', () => {
    expect(normalize(10, 6, 24)).toEqual({ normA: 15, normB: 9 });
  });
  it('20:12 → 15:9', () => {
    expect(normalize(20, 12, 24)).toEqual({ normA: 15, normB: 9 });
  });
  it('0:0 → 12:12', () => {
    expect(normalize(0, 0, 24)).toEqual({ normA: 12, normB: 12 });
  });
  it('7:0 → 24:0', () => {
    expect(normalize(7, 0, 24)).toEqual({ normA: 24, normB: 0 });
  });
  it('rundet auf eine Nachkommastelle (7:4 → 15.3:8.7)', () => {
    expect(normalize(7, 4, 24)).toEqual({ normA: 15.3, normB: 8.7 });
  });
  it('Summe ist nach dem Runden immer exakt S', () => {
    for (const s of [16, 21, 24, 32]) {
      for (let a = 0; a <= 40; a++) {
        for (let b = 0; b <= 40; b++) {
          const { normA, normB } = normalize(a, b, s);
          expect(Math.round((normA + normB) * 10)).toBe(s * 10);
          expect(Math.round(normA * 10)).toBe(normA * 10);
          expect(Math.round(normB * 10)).toBeCloseTo(normB * 10, 6);
        }
      }
    }
  });
});
