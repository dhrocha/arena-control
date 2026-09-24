import { describe, expect, it } from "vitest";
import {
  parseSportState,
  scoresFromVolleyballState,
  serializeSportState,
} from "./persist.ts";
import { volleyballRules } from "./rules.ts";

describe("sport state persistence helpers", () => {
  it("serializa e restaura estado de vôlei", () => {
    const state = volleyballRules.createInitialState({
      homeTeamId: "h",
      awayTeamId: "a",
      config: { format: "BEST_OF_3", normalSetPoints: 15 },
      now: 100,
    });
    state.status = "SETUP";

    const json = serializeSportState(state);
    expect(typeof json).toBe("string");

    const restored = parseSportState(json, "VOLLEYBALL");
    expect(restored?.sport).toBe("VOLLEYBALL");
    expect(restored?.config.format).toBe("BEST_OF_3");
    expect(restored?.config.normalSetPoints).toBe(15);
    expect(restored?.sets).toHaveLength(3);
    expect(restored?.status).toBe("SETUP");
  });

  it("football ignora sport_state", () => {
    const state = volleyballRules.createInitialState({
      homeTeamId: "h",
      awayTeamId: "a",
      now: 1,
    });
    const json = serializeSportState(state);
    expect(parseSportState(json, "FOOTBALL")).toBeNull();
  });

  it("legado sem sport_state → null", () => {
    expect(parseSportState(null, "VOLLEYBALL")).toBeNull();
    expect(parseSportState(undefined, "VOLLEYBALL")).toBeNull();
    expect(parseSportState("", "VOLLEYBALL")).toBeNull();
  });

  it("JSON inválido → null", () => {
    expect(parseSportState("{not-json", "VOLLEYBALL")).toBeNull();
  });

  it("scoresFromVolleyballState espelha o set atual", () => {
    const state = volleyballRules.createInitialState({
      homeTeamId: "h",
      awayTeamId: "a",
      now: 1,
    });
    state.sets[0].homeScore = 18;
    state.sets[0].awayScore = 17;
    expect(scoresFromVolleyballState(state)).toEqual({ homeScore: 18, awayScore: 17 });
  });

  it("merge defaults em config parcial antiga", () => {
    const partial = JSON.stringify({
      sport: "VOLLEYBALL",
      homeTeamId: "h",
      awayTeamId: "a",
      config: { format: "BEST_OF_5", normalSetPoints: 25 },
      sets: [{ number: 1, homeScore: 0, awayScore: 0, status: "PLAYING" }],
      currentSet: 1,
      homeSetsWon: 0,
      awaySetsWon: 0,
      specialState: null,
      status: "SETUP",
      createdAt: 1,
      updatedAt: 1,
    });
    const restored = parseSportState(partial, "VOLLEYBALL");
    expect(restored?.config.minDifference).toBe(2);
    expect(restored?.config.decidingSetPoints).toBe(15);
    expect(restored?.config.timeoutSeconds).toBe(30);
  });
});
