import { describe, expect, it } from "vitest";
import { VolleyballRules, setsToWin } from "./rules.ts";
import type { VolleyballConfig, VolleyballMatchState } from "./types.ts";

const rules = new VolleyballRules();

const HOME = "home";
const AWAY = "away";

function config(partial?: Partial<VolleyballConfig>): Partial<VolleyballConfig> {
  return partial ?? {};
}

function fresh(partial?: Partial<VolleyballConfig>): VolleyballMatchState {
  return rules.createInitialState({
    homeTeamId: HOME,
    awayTeamId: AWAY,
    config: config(partial),
    now: 1_000,
  });
}

function setScores(
  state: VolleyballMatchState,
  home: number,
  away: number
): VolleyballMatchState {
  const next = structuredClone(state);
  const set = next.sets.find((s) => s.number === next.currentSet)!;
  set.homeScore = home;
  set.awayScore = away;
  return next;
}

function withSetsWon(
  state: VolleyballMatchState,
  homeSets: number,
  awaySets: number,
  currentSet: number
): VolleyballMatchState {
  const next = structuredClone(state);
  next.homeSetsWon = homeSets;
  next.awaySetsWon = awaySets;
  next.currentSet = currentSet;
  for (const set of next.sets) {
    if (set.number < currentSet) {
      set.status = "FINISHED";
      set.homeScore = 25;
      set.awayScore = 20;
      set.winnerId = homeSets > awaySets ? HOME : AWAY;
    } else if (set.number === currentSet) {
      set.status = "PLAYING";
      set.homeScore = 0;
      set.awayScore = 0;
      set.winnerId = undefined;
    } else {
      set.status = "PENDING";
    }
  }
  // Fix finished set winners to match homeSets/awaySets counts
  let h = 0;
  let a = 0;
  for (const set of next.sets) {
    if (set.status !== "FINISHED") continue;
    if (h < homeSets) {
      set.winnerId = HOME;
      h += 1;
    } else if (a < awaySets) {
      set.winnerId = AWAY;
      a += 1;
    }
  }
  return next;
}

function point(state: VolleyballMatchState, teamId: string) {
  return rules.registerPoint(state, { teamId, now: state.updatedAt + 1 });
}

describe("setsToWin", () => {
  it("melhor de 5 → 3 sets", () => {
    expect(setsToWin({ format: "BEST_OF_5" })).toBe(3);
  });
  it("melhor de 3 → 2 sets", () => {
    expect(setsToWin({ format: "BEST_OF_3" })).toBe(2);
  });
});

describe("set normal", () => {
  it("24 × 20 +1 → 25 × 20 → SET END", () => {
    let state = fresh();
    state = setScores(state, 24, 20);
    const result = point(state, HOME);
    expect(result.state.sets[0].homeScore).toBe(25);
    expect(result.state.sets[0].awayScore).toBe(20);
    expect(result.outcome).toBe("SET_END");
    expect(result.setWinnerId).toBe(HOME);
    expect(result.state.homeSetsWon).toBe(1);
    expect(result.state.status).toBe("SET_FINISHED");
    expect(result.effects).toContain("VOLLEY_SET_END");
  });

  it("25 × 24 não finaliza (diferença < 2)", () => {
    let state = fresh();
    state = setScores(state, 24, 24);
    const to25 = point(state, HOME);
    expect(to25.outcome).toBe("POINT");
    expect(to25.state.sets[0].homeScore).toBe(25);
    expect(to25.state.sets[0].awayScore).toBe(24);
    expect(to25.state.status).not.toBe("SET_FINISHED");
  });
});

describe("deuce", () => {
  it("24 × 24 → DEUCE", () => {
    let state = fresh();
    state = setScores(state, 23, 24);
    const result = point(state, HOME);
    expect(result.state.sets[0].homeScore).toBe(24);
    expect(result.state.sets[0].awayScore).toBe(24);
    expect(result.state.specialState).toBe("DEUCE");
    expect(result.effects).toContain("VOLLEY_DEUCE");
  });
});

describe("vitória após deuce", () => {
  it("24×24 → 25×24 continua; 25×24 → 26×24 SET END", () => {
    let state = setScores(fresh(), 24, 24);
    state.specialState = "DEUCE";

    const mid = point(state, HOME);
    expect(mid.outcome).toBe("POINT");
    expect(mid.state.sets[0]).toMatchObject({ homeScore: 25, awayScore: 24 });
    expect(mid.state.specialState).toBe("SET_POINT");

    const end = point(mid.state, HOME);
    expect(end.outcome).toBe("SET_END");
    expect(end.state.sets[0]).toMatchObject({ homeScore: 26, awayScore: 24 });
    expect(end.setWinnerId).toBe(HOME);
  });
});

describe("quinto set (decisivo)", () => {
  it("14 × 12 → continua; 15 × 12 → encerra set (e partida em 2–2)", () => {
    let state = withSetsWon(fresh(), 2, 2, 5);
    expect(rules.isDecidingSet(state)).toBe(true);
    expect(rules.pointLimitForCurrentSet(state)).toBe(15);

    state = setScores(state, 13, 12);
    const at14 = point(state, HOME);
    expect(at14.outcome).toBe("POINT");
    expect(at14.state.sets.find((s) => s.number === 5)).toMatchObject({
      homeScore: 14,
      awayScore: 12,
    });

    const closed = point(at14.state, HOME);
    // Set decisivo em 2–2: fim de set = fim de partida
    expect(closed.outcome).toBe("MATCH_END");
    expect(closed.effects).toContain("VOLLEY_SET_END");
    expect(closed.state.sets.find((s) => s.number === 5)).toMatchObject({
      homeScore: 15,
      awayScore: 12,
      status: "FINISHED",
    });
  });

  it("quinto set com deuce: 14×14 continua; 15×14 continua; 16×14 SET END", () => {
    let state = setScores(withSetsWon(fresh(), 2, 2, 5), 13, 14);
    const deuce = point(state, HOME);
    expect(deuce.state.specialState).toBe("DEUCE");
    expect(deuce.outcome).toBe("POINT");

    const at15 = point(deuce.state, HOME);
    expect(at15.outcome).toBe("POINT");
    expect(at15.state.sets.find((s) => s.number === 5)).toMatchObject({
      homeScore: 15,
      awayScore: 14,
    });

    const end = point(at15.state, HOME);
    expect(end.outcome).toBe("MATCH_END");
    expect(end.state.sets.find((s) => s.number === 5)).toMatchObject({
      homeScore: 16,
      awayScore: 14,
    });
  });
});

describe("melhor de 5 / 3", () => {
  it("3 sets vencidos → MATCH END (best of 5)", () => {
    let state = withSetsWon(fresh({ format: "BEST_OF_5" }), 2, 1, 4);
    state = setScores(state, 24, 20);
    const result = point(state, HOME);
    expect(result.outcome).toBe("MATCH_END");
    expect(result.matchWinnerId).toBe(HOME);
    expect(result.state.homeSetsWon).toBe(3);
    expect(result.state.status).toBe("MATCH_FINISHED");
    expect(result.effects).toContain("VOLLEY_MATCH_END");
  });

  it("2 sets vencidos → MATCH END (best of 3)", () => {
    let state = withSetsWon(fresh({ format: "BEST_OF_3" }), 1, 0, 2);
    state = setScores(state, 24, 18);
    const result = point(state, HOME);
    expect(result.outcome).toBe("MATCH_END");
    expect(result.state.homeSetsWon).toBe(2);
    expect(result.matchWinnerId).toBe(HOME);
  });
});

describe("set point e match point", () => {
  it("24 × 20 → SET_POINT para o home", () => {
    let state = setScores(fresh(), 23, 20);
    const result = point(state, HOME);
    expect(result.state.specialState).toBe("SET_POINT");
    expect(result.state.status).toBe("SET_POINT");
    expect(result.effects).toContain("VOLLEY_SET_POINT");
  });

  it("14 × 10 no quinto set → MATCH_POINT", () => {
    let state = withSetsWon(fresh(), 2, 2, 5);
    state = setScores(state, 13, 10);
    const result = point(state, HOME);
    expect(result.state.specialState).toBe("MATCH_POINT");
    expect(result.effects).toContain("VOLLEY_MATCH_POINT");
  });
});

describe("bloquear pontos após set", () => {
  it("recusa novo ponto em SET_FINISHED", () => {
    let state = setScores(fresh(), 24, 20);
    const ended = point(state, HOME);
    expect(ended.state.status).toBe("SET_FINISHED");
    expect(() => point(ended.state, HOME)).toThrow();
  });
});

describe("startNextSet", () => {
  it("após SET_FINISHED inicia set seguinte em 0–0", () => {
    let state = setScores(fresh(), 24, 20);
    const ended = point(state, HOME);
    const next = rules.startNextSet(ended.state, 2_000);
    expect(next.currentSet).toBe(2);
    expect(next.status).toBe("PLAYING");
    expect(next.sets[1]).toMatchObject({
      homeScore: 0,
      awayScore: 0,
      status: "PLAYING",
    });
    expect(next.homeSetsWon).toBe(1);
  });
});

describe("desfazer (restore snapshot)", () => {
  it("desfazer ponto simples", () => {
    const before = setScores(fresh(), 10, 8);
    const result = point(before, HOME);
    expect(result.state.sets[0].homeScore).toBe(11);
    const restored = rules.restoreState(result.before);
    expect(restored.sets[0].homeScore).toBe(10);
    expect(restored.sets[0].awayScore).toBe(8);
  });

  it("desfazer ponto que encerrou set", () => {
    const before = setScores(fresh(), 24, 20);
    const result = point(before, HOME);
    expect(result.outcome).toBe("SET_END");
    const restored = rules.restoreState(result.before);
    expect(restored.status).toBe("PLAYING");
    expect(restored.homeSetsWon).toBe(0);
    expect(restored.sets[0].status).toBe("PLAYING");
    expect(restored.sets[0].homeScore).toBe(24);
  });

  it("desfazer ponto que encerrou partida", () => {
    const before = setScores(
      withSetsWon(fresh({ format: "BEST_OF_5" }), 2, 1, 4),
      24,
      20
    );
    const result = point(before, HOME);
    expect(result.outcome).toBe("MATCH_END");
    const restored = rules.restoreState(result.before);
    expect(restored.status).toBe("PLAYING");
    expect(restored.homeSetsWon).toBe(2);
    expect(restored.awaySetsWon).toBe(1);
    expect(restored.sets.find((s) => s.number === 4)?.status).toBe("PLAYING");
  });
});

describe("configuração customizada", () => {
  it("usa normalSetPoints / minDifference da config", () => {
    let state = fresh({ normalSetPoints: 15, minDifference: 2 });
    state = setScores(state, 14, 10);
    const result = point(state, HOME);
    expect(result.outcome).toBe("SET_END");
  });
});

describe("saque automático", () => {
  it("ao pontuar, o saque passa para o time que marcou", () => {
    let state = fresh();
    state.serverTeamId = HOME;
    const result = point(state, AWAY);
    expect(result.state.serverTeamId).toBe(AWAY);
    const again = point(result.state, HOME);
    expect(again.state.serverTeamId).toBe(HOME);
  });
});
