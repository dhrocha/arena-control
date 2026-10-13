import type { DisplayScore, SpecialMatchState, SportRules } from "../types.ts";
import {
  DEFAULT_VOLLEYBALL_CONFIG,
  type RegisterPointInput,
  type RegisterPointResult,
  type VolleyballConfig,
  type VolleyballEffectHint,
  type VolleyballFormat,
  type VolleyballMatchState,
  type VolleyballSet,
} from "./types.ts";

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

/** Sets required to win the match from format (central rule — avoid scattered ifs). */
export function setsToWin(config: Pick<VolleyballConfig, "format">): number {
  return config.format === "BEST_OF_3" ? 2 : 3;
}

/** Total sets in the series (best-of). */
export function totalSetsInSeries(config: Pick<VolleyballConfig, "format">): number {
  return config.format === "BEST_OF_3" ? 3 : 5;
}

export function formatFromBestOf(bestOf: 3 | 5): VolleyballFormat {
  return bestOf === 3 ? "BEST_OF_3" : "BEST_OF_5";
}

export function mergeVolleyballConfig(
  partial?: Partial<VolleyballConfig>
): VolleyballConfig {
  return { ...DEFAULT_VOLLEYBALL_CONFIG, ...partial };
}

/**
 * Pure volleyball rules engine.
 * MatchEngine must call this — clients never decide set/match end.
 */
export class VolleyballRules implements SportRules<VolleyballMatchState> {
  readonly sport = "VOLLEYBALL" as const;

  createInitialState(input: {
    homeTeamId: string;
    awayTeamId: string;
    config?: Partial<VolleyballConfig>;
    serverTeamId?: string;
    now?: number;
  }): VolleyballMatchState {
    const now = input.now ?? Date.now();
    const config = mergeVolleyballConfig(input.config);
    const maxSets = totalSetsInSeries(config);
    const sets: VolleyballSet[] = Array.from({ length: maxSets }, (_, i) => ({
      number: i + 1,
      homeScore: 0,
      awayScore: 0,
      status: i === 0 ? "PLAYING" : "PENDING",
      startedAt: i === 0 ? now : undefined,
    }));

    return {
      sport: "VOLLEYBALL",
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      config,
      sets,
      currentSet: 1,
      homeSetsWon: 0,
      awaySetsWon: 0,
      serverTeamId: input.serverTeamId,
      specialState: null,
      status: "PLAYING",
      createdAt: now,
      updatedAt: now,
    };
  }

  getDisplayScore(state: VolleyballMatchState): DisplayScore {
    const set = this.currentSet(state);
    return {
      home: set?.homeScore ?? 0,
      away: set?.awayScore ?? 0,
      homeSecondary: state.homeSetsWon,
      awaySecondary: state.awaySetsWon,
      label: this.isDecidingSet(state) ? "SET DECISIVO" : `SET ${state.currentSet}`,
    };
  }

  getSpecialState(state: VolleyballMatchState): SpecialMatchState {
    return state.specialState;
  }

  isPeriodFinished(state: VolleyballMatchState): boolean {
    return state.status === "SET_FINISHED" || state.status === "MATCH_FINISHED";
  }

  currentSet(state: VolleyballMatchState): VolleyballSet | undefined {
    return state.sets.find((s) => s.number === state.currentSet);
  }

  /** True when the active set uses deciding-set point limit (e.g. 2–2 → set 5). */
  isDecidingSet(state: VolleyballMatchState): boolean {
    const needed = setsToWin(state.config);
    return (
      state.homeSetsWon === needed - 1 &&
      state.awaySetsWon === needed - 1
    );
  }

  pointLimitForCurrentSet(state: VolleyballMatchState): number {
    return this.isDecidingSet(state)
      ? state.config.decidingSetPoints
      : state.config.normalSetPoints;
  }

  canAcceptPoint(state: VolleyballMatchState): boolean {
    return (
      state.status === "PLAYING" ||
      state.status === "SET_POINT" ||
      state.status === "MATCH_POINT"
    );
  }

  /**
   * Atomic point registration.
   * Order: score → set end? → match end? → else special states (deuce / match point / set point).
   */
  registerPoint(state: VolleyballMatchState, input: RegisterPointInput): RegisterPointResult {
    if (!this.canAcceptPoint(state)) {
      throw new Error("Pontos não podem ser registrados neste estado");
    }
    if (input.teamId !== state.homeTeamId && input.teamId !== state.awayTeamId) {
      throw new Error("Time inválido para esta partida");
    }

    const before = deepClone(state);
    const now = input.now ?? Date.now();
    const next = deepClone(state);
    const set = next.sets.find((s) => s.number === next.currentSet);
    if (!set || set.status !== "PLAYING") {
      throw new Error("Nenhum set em andamento");
    }

    const isHome = input.teamId === next.homeTeamId;
    if (isHome) set.homeScore += 1;
    else set.awayScore += 1;

    next.updatedAt = now;

    // Rally scoring: scoring team always earns the next serve
    next.serverTeamId = input.teamId;

    const limit = this.pointLimitForCurrentSet(next);
    const minDiff = next.config.minDifference;
    const setOver = this.isSetWon(set.homeScore, set.awayScore, limit, minDiff);

    if (setOver) {
      return this.finishSet(before, next, set, now);
    }

    const special = this.detectSpecialState(next, set, limit, minDiff);
    next.specialState = special;
    next.status =
      special === "MATCH_POINT"
        ? "MATCH_POINT"
        : special === "SET_POINT"
          ? "SET_POINT"
          : "PLAYING";

    const effects: VolleyballEffectHint[] = ["VOLLEY_POINT"];
    if (special === "DEUCE") effects.push("VOLLEY_DEUCE");
    if (special === "SET_POINT") effects.push("VOLLEY_SET_POINT");
    if (special === "MATCH_POINT" || special === "CHAMPIONSHIP_POINT") {
      effects.push("VOLLEY_MATCH_POINT");
    }

    return {
      before,
      state: next,
      outcome: "POINT",
      effects,
      scoringTeamId: input.teamId,
    };
  }

  /** Restore a previous snapshot (transactional undo). */
  restoreState(snapshot: VolleyballMatchState): VolleyballMatchState {
    return deepClone(snapshot);
  }

  /**
   * Operator starts the next set after SET_FINISHED.
   * Does not auto-start — explicit action required.
   */
  startNextSet(state: VolleyballMatchState, now = Date.now()): VolleyballMatchState {
    if (state.status !== "SET_FINISHED") {
      throw new Error("Próximo set só pode iniciar após o fim do set");
    }
    if (state.homeSetsWon >= setsToWin(state.config) || state.awaySetsWon >= setsToWin(state.config)) {
      throw new Error("Partida já encerrada");
    }

    const next = deepClone(state);
    const nextNumber = next.currentSet + 1;
    const set = next.sets.find((s) => s.number === nextNumber);
    if (!set) {
      throw new Error("Não há próximo set");
    }

    set.status = "PLAYING";
    set.homeScore = 0;
    set.awayScore = 0;
    set.winnerId = undefined;
    set.startedAt = now;
    set.finishedAt = undefined;

    next.currentSet = nextNumber;
    next.specialState = null;
    next.status = "PLAYING";
    next.updatedAt = now;
    return next;
  }

  setServer(
    state: VolleyballMatchState,
    teamId: string,
    playerId?: string,
    now = Date.now()
  ): VolleyballMatchState {
    if (teamId !== state.homeTeamId && teamId !== state.awayTeamId) {
      throw new Error("Time inválido para saque");
    }
    const next = deepClone(state);
    next.serverTeamId = teamId;
    next.serverPlayerId = playerId;
    next.updatedAt = now;
    return next;
  }

  // --- internals ---

  private isSetWon(
    homeScore: number,
    awayScore: number,
    limit: number,
    minDifference: number
  ): boolean {
    if (homeScore >= limit && homeScore - awayScore >= minDifference) return true;
    if (awayScore >= limit && awayScore - homeScore >= minDifference) return true;
    return false;
  }

  private finishSet(
    before: VolleyballMatchState,
    next: VolleyballMatchState,
    set: VolleyballSet,
    now: number
  ): RegisterPointResult {
    const homeWins = set.homeScore > set.awayScore;
    const winnerId = homeWins ? next.homeTeamId : next.awayTeamId;

    set.status = "FINISHED";
    set.winnerId = winnerId;
    set.finishedAt = now;

    if (homeWins) next.homeSetsWon += 1;
    else next.awaySetsWon += 1;

    next.specialState = null;

    const needed = setsToWin(next.config);
    const matchOver =
      next.homeSetsWon >= needed || next.awaySetsWon >= needed;

    if (matchOver) {
      next.status = "MATCH_FINISHED";
      return {
        before,
        state: next,
        outcome: "MATCH_END",
        effects: ["VOLLEY_POINT", "VOLLEY_SET_END", "VOLLEY_MATCH_END"],
        scoringTeamId: winnerId,
        setWinnerId: winnerId,
        matchWinnerId: winnerId,
      };
    }

    next.status = "SET_FINISHED";
    next.updatedAt = now;

    return {
      before,
      state: next,
      outcome: "SET_END",
      effects: ["VOLLEY_POINT", "VOLLEY_SET_END"],
      scoringTeamId: winnerId,
      setWinnerId: winnerId,
    };
  }

  /**
   * Detect special state for an unfinished set.
   * Priority: DEUCE > MATCH_POINT > SET_POINT.
   */
  private detectSpecialState(
    state: VolleyballMatchState,
    set: VolleyballSet,
    limit: number,
    minDiff: number
  ): SpecialMatchState {
    const { homeScore, awayScore } = set;

    // Deuce: tied and at/above limit-1 (e.g. 24–24 or 14–14)
    if (homeScore === awayScore && homeScore >= limit - 1) {
      return "DEUCE";
    }

    const homeSetPoint = this.isOnePointFromSetWin(homeScore, awayScore, limit, minDiff);
    const awaySetPoint = this.isOnePointFromSetWin(awayScore, homeScore, limit, minDiff);

    if (!homeSetPoint && !awaySetPoint) return null;

    const needed = setsToWin(state.config);
    const homeMatchPoint =
      homeSetPoint && state.homeSetsWon === needed - 1;
    const awayMatchPoint =
      awaySetPoint && state.awaySetsWon === needed - 1;

    if (homeMatchPoint || awayMatchPoint) {
      // Hook for future championship context
      return "MATCH_POINT";
    }

    return "SET_POINT";
  }

  /** True if `score` can close the set with one more point. */
  private isOnePointFromSetWin(
    score: number,
    opponent: number,
    limit: number,
    minDiff: number
  ): boolean {
    const next = score + 1;
    return next >= limit && next - opponent >= minDiff;
  }
}

/** Singleton for registry / MatchEngine wiring. */
export const volleyballRules = new VolleyballRules();
