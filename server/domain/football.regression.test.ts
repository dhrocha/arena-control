import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArenaDatabase } from "../db/database.ts";
import { MatchEngine } from "./MatchEngine.ts";

describe("regressão futebol", () => {
  let db: ArenaDatabase;
  let engine: MatchEngine;
  let homeId: string;
  let awayId: string;
  let tmpDir: string;

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setup(): void {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-fb-"));
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
  }

  it("cria partida FOOTBALL por padrão sem sportState", () => {
    setup();
    const match = engine.createMatch({
      homeTeamId: homeId,
      awayTeamId: awayId,
      mode: "pelada",
      duration: 40,
    });
    expect(match.sport).toBe("FOOTBALL");
    expect(match.sportState).toBeNull();
    expect(match.status).toBe("setup");
    expect(match.homeScore).toBe(0);
  });

  it("inicia, marca gol, desfaz e finaliza", () => {
    setup();
    engine.createMatch({
      homeTeamId: homeId,
      awayTeamId: awayId,
      mode: "pelada",
      duration: 40,
    });
    engine.startMatch();
    let match = db.getActiveMatch()!;
    expect(match.status).toBe("playing");

    engine.addGoal(homeId);
    match = db.getActiveMatch()!;
    expect(match.homeScore).toBe(1);
    expect(match.awayScore).toBe(0);

    const events = db.listEvents(match.id);
    expect(events.some((e) => e.type === "GOAL")).toBe(true);

    engine.undoLastGoal();
    match = db.getActiveMatch()!;
    expect(match.homeScore).toBe(0);

    engine.addGoal(awayId);
    engine.finishMatch();
    match = db.getMatch(match.id)!;
    expect(match.status).toBe("finished");
    expect(match.awayScore).toBe(1);
    expect(db.getActiveMatch()).toBeNull();
  });

  it("pausa, retoma, intervalo e segundo tempo", () => {
    setup();
    engine.createMatch({
      homeTeamId: homeId,
      awayTeamId: awayId,
      mode: "pelada",
      duration: 40,
    });
    engine.startMatch();
    engine.pauseMatch();
    expect(db.getActiveMatch()?.status).toBe("paused");

    engine.resumeMatch();
    expect(db.getActiveMatch()?.status).toBe("playing");

    engine.halfTime();
    expect(db.getActiveMatch()?.status).toBe("halftime");
    expect(db.getActiveMatch()?.currentPeriod).toBe(1);

    engine.secondHalf();
    const match = db.getActiveMatch()!;
    expect(match.status).toBe("playing");
    expect(match.currentPeriod).toBe(2);
  });

  it("game day inicia em countdown e MVP", () => {
    setup();
    const player = db.createPlayer({
      teamId: homeId,
      name: "Joao",
      nickname: "Joao",
      shirtNumber: 10,
      photo: null,
      active: true,
    });
    engine.createMatch({
      homeTeamId: homeId,
      awayTeamId: awayId,
      mode: "gameday",
      duration: 40,
    });
    engine.startMatch();
    expect(db.getActiveMatch()?.status).toBe("countdown");

    // força início jogável
    engine["beginPlaying"](db.getActiveMatch()!);
    expect(db.getActiveMatch()?.status).toBe("playing");

    engine.selectMvp(player.id);
    expect(db.getActiveMatch()?.mvpPlayerId).toBe(player.id);
    engine.finishMatch();
    expect(db.getMatch(db.listMatches()[0].id)?.mvpPlayerId).toBe(player.id);
  });

  it("rejeita ações de futebol em partida de vôlei", () => {
    setup();
    engine.createMatch({
      homeTeamId: homeId,
      awayTeamId: awayId,
      mode: "pelada",
      duration: 40,
      sport: "VOLLEYBALL",
    });
    engine.startMatch();
    expect(() => engine.addGoal(homeId)).toThrow(/vôlei/i);
    expect(() => engine.halfTime()).toThrow(/vôlei/i);
  });

  it("backup/restore preserva partida de futebol antiga sem sport", () => {
    setup();
    const match = engine.createMatch({
      homeTeamId: homeId,
      awayTeamId: awayId,
      mode: "pelada",
      duration: 40,
    });
    engine.startMatch();
    engine.addGoal(homeId);
    engine.finishMatch();

    const backup = db.exportBackup() as {
      version: number;
      matches: Array<Record<string, unknown>>;
      teams: unknown[];
      players: unknown[];
      events: unknown[];
      effects: unknown[];
      settings: unknown;
    };
    expect(backup.version).toBe(5);
    expect(backup.matches[0].sport).toBe("FOOTBALL");

    // simula backup legado sem sport
    const legacy = {
      ...backup,
      matches: backup.matches.map(({ sport: _s, sportState: _ss, ...rest }) => rest),
    };
    db.importBackup(legacy as never);
    const imported = db.getMatch(match.id);
    expect(imported?.sport).toBe("FOOTBALL");
    expect(imported?.sportState).toBeNull();
    expect(imported?.homeScore).toBe(1);
  });
});
