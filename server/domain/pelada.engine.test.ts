import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArenaDatabase } from "../db/database.ts";
import { MatchEngine } from "./MatchEngine.ts";

describe("PeladaEngine", () => {
  let db: ArenaDatabase;
  let engine: MatchEngine;
  let tmpDir: string;

  afterEach(() => {
    vi.useRealTimers();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setup(): void {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-pelada-"));
    db = new ArenaDatabase(path.join(tmpDir, "test.db"));
    engine = new MatchEngine(db);
  }

  it("agenda, inicia sessão, joga e marca placar", () => {
    setup();
    const booking = db.createPeladaBooking({
      name: "João",
      phone: "11999999999",
      scheduledAt: Date.now(),
      durationMinutes: 60,
      sport: "FOOTBALL",
    });
    expect(booking.pin).toMatch(/^\d{4,}$/);
    expect(engine.verifyPeladaPin(booking.pin)).toBe(true);
    expect(engine.verifyPeladaPin("0000")).toBe(false);

    engine.pelada.startSession(booking.id);
    let session = engine.pelada.getSession();
    expect(session?.phase).toBe("lobby");
    expect(db.getPeladaBooking(booking.id)?.status).toBe("active");

    engine.pelada.configure({
      gameDurationSec: 120,
      team1Color: "#111111",
      team2Color: "#eeeeee",
    });
    engine.pelada.startGame();
    session = engine.pelada.getSession();
    expect(session?.phase).toBe("playing");
    expect(session?.gameDurationSec).toBe(120);

    engine.pelada.adjustScore(1, 1);
    engine.pelada.adjustScore(2, 1);
    engine.pelada.adjustScore(2, 1);
    session = engine.pelada.getSession();
    expect(session?.team1Score).toBe(1);
    expect(session?.team2Score).toBe(2);

    engine.pelada.pauseGame();
    expect(engine.pelada.getSession()?.phase).toBe("paused");

    engine.pelada.resumeGame();
    engine.pelada.finishGame(false);
    expect(engine.pelada.getSession()?.phase).toBe("between_games");
    expect(engine.pelada.getSession()?.team1Score).toBe(0);
  });

  it("bloqueia Game Day com pelada ativa e vice-versa", () => {
    setup();
    const home = db.createTeam({
      name: "A",
      shortName: "A",
      logo: null,
      primaryColor: "#000",
      secondaryColor: "#fff",
    });
    const away = db.createTeam({
      name: "B",
      shortName: "B",
      logo: null,
      primaryColor: "#111",
      secondaryColor: "#eee",
    });
    const booking = db.createPeladaBooking({
      name: "Maria",
      phone: "11888888888",
      scheduledAt: Date.now(),
      durationMinutes: 30,
      sport: "VOLLEYBALL",
    });
    engine.pelada.startSession(booking.id);

    expect(() =>
      engine.createMatch({
        homeTeamId: home.id,
        awayTeamId: away.id,
        mode: "gameday",
        duration: 40,
      })
    ).toThrow(/pelada/i);

    engine.pelada.stopSession(true);
    engine.createMatch({
      homeTeamId: home.id,
      awayTeamId: away.id,
      mode: "gameday",
      duration: 40,
    });

    const booking2 = db.createPeladaBooking({
      name: "Pedro",
      phone: "11777777777",
      scheduledAt: Date.now(),
      durationMinutes: 30,
      sport: "FOOTBALL",
    });
    expect(() => engine.pelada.startSession(booking2.id)).toThrow(/Game Day/i);
  });

  it("expira sessão ao terminar o tempo geral", () => {
    vi.useFakeTimers();
    setup();
    const booking = db.createPeladaBooking({
      name: "Ana",
      phone: "11666666666",
      scheduledAt: Date.now(),
      durationMinutes: 1,
      sport: "FOOTBALL",
    });
    engine.pelada.startSession(booking.id);
    expect(engine.pelada.getSession()).not.toBeNull();

    vi.advanceTimersByTime(61_000);
    expect(engine.pelada.getSession()).toBeNull();
    expect(db.getPeladaBooking(booking.id)?.status).toBe("finished");
  });
});
