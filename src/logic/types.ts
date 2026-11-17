export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
}

/** Rohergebnis (gezählte Ballwechsel) plus auf S normiertes Ergebnis. */
export interface MatchResult {
  rawA: number;
  rawB: number;
  normA: number;
  normB: number;
}

export interface Match {
  court: number; // 0-basiert (Platz 1 = 0)
  teamA: [PlayerId, PlayerId];
  teamB: [PlayerId, PlayerId];
  result?: MatchResult;
}

export interface Round {
  matches: Match[];
  sitting: PlayerId[];
}
