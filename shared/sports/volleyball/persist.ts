import type { Sport } from "../../types/index.ts";
import type { VolleyballMatchState } from "./types.ts";
import { mergeVolleyballConfig } from "./rules.ts";

/** JSON blob stored on Match.sportState (null for football / legacy). */
export type MatchSportState = VolleyballMatchState;

export function isVolleyballSportState(value: unknown): value is VolleyballMatchState {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { sport?: unknown }).sport === "VOLLEYBALL" &&
    Array.isArray((value as { sets?: unknown }).sets) &&
    typeof (value as { config?: unknown }).config === "object"
  );
}

/**
 * Parse DB/backup payload. Missing or invalid volleyball state → null.
 * Football always returns null (ignore stale JSON if sport flipped).
 */
export function parseSportState(raw: unknown, sport: Sport): MatchSportState | null {
  if (sport !== "VOLLEYBALL") return null;
  if (raw == null || raw === "") return null;

  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!isVolleyballSportState(value)) return null;

  // Re-merge config so older blobs pick up new defaults safely
  return {
    ...value,
    config: mergeVolleyballConfig(value.config),
    specialState: value.specialState ?? null,
  };
}

export function serializeSportState(state: MatchSportState | null | undefined): string | null {
  if (!state) return null;
  return JSON.stringify(state);
}

/** Mirror current-set points onto Match.homeScore / awayScore columns. */
export function scoresFromVolleyballState(state: VolleyballMatchState): {
  homeScore: number;
  awayScore: number;
} {
  const set = state.sets.find((s) => s.number === state.currentSet);
  return {
    homeScore: set?.homeScore ?? 0,
    awayScore: set?.awayScore ?? 0,
  };
}
