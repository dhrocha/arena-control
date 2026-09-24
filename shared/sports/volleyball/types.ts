import type { SpecialMatchState } from "../types.ts";

export type VolleyballFormat = "BEST_OF_3" | "BEST_OF_5";

export type VolleyballSetStatus = "PENDING" | "PLAYING" | "FINISHED";

export type VolleyballMatchStatus =
  | "SETUP"
  | "TEAM_INTRO"
  | "COUNTDOWN"
  | "PLAYING"
  | "TIMEOUT"
  | "SET_POINT"
  | "MATCH_POINT"
  | "SET_FINISHED"
  | "MATCH_FINISHED";

export type VolleyballPointType =
  | "ATTACK"
  | "BLOCK"
  | "ACE"
  | "OPPONENT_ERROR"
  | "OTHER";

export interface VolleyballSet {
  number: number;
  homeScore: number;
  awayScore: number;
  winnerId?: string;
  status: VolleyballSetStatus;
  startedAt?: number;
  finishedAt?: number;
}

export interface VolleyballConfig {
  /** Match format — prefer this over raw set counts in UI/engine. */
  format: VolleyballFormat;
  normalSetPoints: number;
  decidingSetPoints: number;
  minDifference: number;
  /** Optional side-out automation (MVP: manual serve always works). */
  autoServer: boolean;
  timeoutSeconds: number;
  pointSoundEnabled: boolean;
}

export interface VolleyballMatchState {
  sport: "VOLLEYBALL";
  homeTeamId: string;
  awayTeamId: string;
  config: VolleyballConfig;
  sets: VolleyballSet[];
  /** 1-based index of the active set. */
  currentSet: number;
  homeSetsWon: number;
  awaySetsWon: number;
  serverTeamId?: string;
  serverPlayerId?: string;
  specialState: SpecialMatchState;
  status: VolleyballMatchStatus;
  timeoutTeamId?: string;
  /** Epoch ms when active timeout expires (server-authoritative). */
  timeoutEndsAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type VolleyballPointOutcome = "POINT" | "SET_END" | "MATCH_END";

export type VolleyballEffectHint =
  | "VOLLEY_POINT"
  | "VOLLEY_SET_POINT"
  | "VOLLEY_DEUCE"
  | "VOLLEY_MATCH_POINT"
  | "VOLLEY_SET_END"
  | "VOLLEY_MATCH_END";

export interface RegisterPointInput {
  teamId: string;
  playerId?: string;
  pointType?: VolleyballPointType;
  /** Defaults to Date.now() — injectable for tests. */
  now?: number;
}

export interface RegisterPointResult {
  /** Snapshot before the point (for transactional undo). */
  before: VolleyballMatchState;
  state: VolleyballMatchState;
  outcome: VolleyballPointOutcome;
  /** Effects to trigger, in priority order (last = strongest). */
  effects: VolleyballEffectHint[];
  scoringTeamId: string;
  setWinnerId?: string;
  matchWinnerId?: string;
}

export const DEFAULT_VOLLEYBALL_CONFIG: VolleyballConfig = {
  format: "BEST_OF_5",
  normalSetPoints: 25,
  decidingSetPoints: 15,
  minDifference: 2,
  autoServer: false,
  timeoutSeconds: 30,
  pointSoundEnabled: true,
};
