import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArenaDatabase } from "../db/database.ts";
import { MatchEngine } from "./MatchEngine.ts";

describe("timeout vôlei", () => {
  let db: ArenaDatabase;
  let engine: MatchEngine;
  let homeId: string;
  let awayId: string;
  let tmpDir: string;

  afterEach(() => {
    vi.useRealTimers();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("inicia timeout com contador e encerra automaticamente", () => {
    vi.useFakeTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-to-"));
    db = new ArenaDatabase(path.join(tmpDir, "test.db"));
    engine = new MatchEngine(db);
    homeId = db.createTeam({
      name: "Wolves",
      shortName: "WOL",
      logo: null,
      primaryColor: "#111",
      secondaryColor: "#eee",
    }).id;
    awayId = db.createTeam({
      name: "Titans",
      shortName: "TIT",
      logo: null,
      primaryColor: "#222",
      secondaryColor: "#ddd",
    }).id;

    engine.createMatch({
      homeTeamId: homeId,
      awayTeamId: awayId,
      mode: "gameday",
      duration: 40,
      sport: "VOLLEYBALL",
      volleyballConfig: { timeoutSeconds: 5 },
    });
    engine.startMatch();
    engine["beginPlaying"](db.getActiveMatch()!);
    engine.startTimeout(homeId);

    let match = db.getActiveMatch()!;
    expect(match.sportState?.status).toBe("TIMEOUT");
    expect(match.sportState?.timeoutTeamId).toBe(homeId);
    expect(match.sportState?.timeoutEndsAt).toBeTypeOf("number");
    expect(match.status).toBe("paused");

    vi.advanceTimersByTime(5000);
    match = db.getActiveMatch()!;
    expect(match.sportState?.status).toBe("PLAYING");
    expect(match.sportState?.timeoutEndsAt).toBeUndefined();
    expect(match.status).toBe("playing");
  });

  it("encerra timeout manualmente antes do fim", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-to2-"));
    db = new ArenaDatabase(path.join(tmpDir, "test.db"));
    engine = new MatchEngine(db);
    homeId = db.createTeam({
      name: "Wolves",
      shortName: "WOL",
      logo: null,
      primaryColor: "#111",
      secondaryColor: "#eee",
    }).id;
    awayId = db.createTeam({
      name: "Titans",
      shortName: "TIT",
      logo: null,
      primaryColor: "#222",
      secondaryColor: "#ddd",
    }).id;

    engine.createMatch({
      homeTeamId: homeId,
      awayTeamId: awayId,
      mode: "gameday",
      duration: 40,
      sport: "VOLLEYBALL",
      volleyballConfig: { timeoutSeconds: 60 },
    });
    engine.startMatch();
    engine["beginPlaying"](db.getActiveMatch()!);
    engine.startTimeout(awayId);
    engine.endTimeout();
    const match = db.getActiveMatch()!;
    expect(match.sportState?.status).toBe("PLAYING");
    expect(match.sportState?.timeoutTeamId).toBeUndefined();
  });
});
