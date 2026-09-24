import type { Sport } from "../types/index.ts";

/** Special overlay states shared across sports (volleyball uses the full set). */
export type SpecialMatchState =
  | "SET_POINT"
  | "MATCH_POINT"
  | "CHAMPIONSHIP_POINT"
  | "DEUCE"
  | null;

export interface DisplayScore {
  /** Primary score shown large (goals or current-set points). */
  home: number;
  away: number;
  /** Secondary score (unused in football; sets won in volleyball). */
  homeSecondary?: number;
  awaySecondary?: number;
  label?: string;
}

/**
 * Minimal strategy contract. Sport-specific engines implement the full surface;
 * MatchEngine will call into the concrete rules for the active sport.
 */
export interface SportRules<TState> {
  readonly sport: Sport;
  createInitialState(input: unknown): TState;
  getDisplayScore(state: TState): DisplayScore;
  getSpecialState(state: TState): SpecialMatchState;
  isPeriodFinished(state: TState): boolean;
}
