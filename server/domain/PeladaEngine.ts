import type { EffectPayload, PeladaSession } from "../../shared/types/index.ts";
import { pickPrioritySponsor, sponsorsForSlot } from "../../shared/sponsors/playlist.ts";
import type { ArenaDatabase } from "../db/database.ts";
import { eventBus } from "./EventBus.ts";

const AD_INTERVAL_MS = 60_000;
const AD_DURATION_MS = 10_000;
const DEFAULT_GAME_DURATION_SEC = 5 * 60;
const DEFAULT_TEAM1_COLOR = "#1e88e5";
const DEFAULT_TEAM2_COLOR = "#e53935";
const TICK_MS = 250;

export class PeladaEngine {
  private session: PeladaSession | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private peladaControllerId: string | null = null;
  /** Accumulated playing ms in current game (updated on pause / finish). */
  private playedMsTotal = 0;
  private lastAdIndex = 0;

  constructor(
    private readonly db: ArenaDatabase,
    private readonly hooks: {
      hasActiveMatch: () => boolean;
      onSessionEnded: () => void;
      onSessionStarted: () => void;
    }
  ) {}

  getSession(): PeladaSession | null {
    return this.session ? this.snapshotSession() : null;
  }

  getPeladaControllerId(): string | null {
    return this.peladaControllerId;
  }

  setPeladaControllerId(id: string | null): void {
    this.peladaControllerId = id;
  }

  canControlPelada(clientId: string, role: string): boolean {
    if (role === "admin") return true;
    if (role !== "pelada") return false;
    if (!this.peladaControllerId) {
      this.peladaControllerId = clientId;
      return true;
    }
    return this.peladaControllerId === clientId;
  }

  claimPeladaControl(clientId: string): void {
    this.peladaControllerId = clientId;
    eventBus.emit("STATE_CHANGED", null);
  }

  startSession(bookingId: string): PeladaSession {
    if (this.session && this.session.phase !== "expired") {
      throw new Error("Já existe uma pelada ativa");
    }
    if (this.hooks.hasActiveMatch()) {
      throw new Error("Finalize a partida Game Day antes de iniciar uma pelada");
    }

    const booking = this.db.getPeladaBooking(bookingId);
    if (!booking) throw new Error("Pelada não encontrada");
    if (booking.status !== "scheduled") {
      throw new Error("Só é possível iniciar peladas agendadas");
    }

    const active = this.db.getActivePeladaBooking();
    if (active && active.id !== bookingId) {
      throw new Error("Já existe outra pelada ativa");
    }

    const now = Date.now();
    const sessionEndsAt = now + booking.durationMinutes * 60_000;
    this.db.updatePeladaBooking(bookingId, {
      status: "active",
      sessionStartedAt: now,
      sessionEndsAt,
    });

    const master = this.pickMasterSponsor();
    this.playedMsTotal = 0;
    this.lastAdIndex = 0;
    this.session = {
      bookingId,
      sport: booking.sport,
      sessionEndsAt,
      phase: "lobby",
      gameDurationSec: DEFAULT_GAME_DURATION_SEC,
      team1Color: DEFAULT_TEAM1_COLOR,
      team2Color: DEFAULT_TEAM2_COLOR,
      team1Score: 0,
      team2Score: 0,
      gameRemainingMs: DEFAULT_GAME_DURATION_SEC * 1000,
      gameStartedAt: null,
      playedSinceAdMs: 0,
      ad: null,
      masterSponsorId: master?.id ?? null,
    };

    this.ensureTick();
    this.hooks.onSessionStarted();
    eventBus.emit("STATE_CHANGED", null);
    return this.snapshotSession()!;
  }

  stopSession(markFinished = true): void {
    if (!this.session) return;
    const bookingId = this.session.bookingId;
    if (markFinished) {
      this.db.updatePeladaBooking(bookingId, {
        status: "finished",
        sessionEndsAt: Date.now(),
      });
    }
    this.clearTick();
    this.session = null;
    this.playedMsTotal = 0;
    this.lastAdIndex = 0;
    this.hooks.onSessionEnded();
    eventBus.emit("STATE_CHANGED", null);
  }

  configure(input: { gameDurationSec: number; team1Color: string; team2Color: string }): void {
    const session = this.requireLiveSession();
    if (session.phase === "playing") {
      throw new Error("Pause ou finalize o jogo antes de reconfigurar");
    }
    const gameDurationSec = Math.max(30, Math.min(60 * 60, Math.floor(input.gameDurationSec)));
    session.gameDurationSec = gameDurationSec;
    session.team1Color = input.team1Color || DEFAULT_TEAM1_COLOR;
    session.team2Color = input.team2Color || DEFAULT_TEAM2_COLOR;
    if (session.phase === "lobby" || session.phase === "between_games") {
      session.gameRemainingMs = gameDurationSec * 1000;
    }
    this.refreshMasterSponsor();
    eventBus.emit("STATE_CHANGED", null);
  }

  startGame(): void {
    const session = this.requireLiveSession();
    this.assertSessionNotExpired();
    if (session.phase === "playing") return;

    if (session.phase === "lobby" || session.phase === "between_games") {
      session.team1Score = 0;
      session.team2Score = 0;
      session.gameRemainingMs = session.gameDurationSec * 1000;
      session.ad = null;
      this.playedMsTotal = 0;
      this.lastAdIndex = 0;
    }

    session.phase = "playing";
    session.gameStartedAt = Date.now();
    session.masterSponsorId = null;
    this.ensureTick();
    eventBus.emit("STATE_CHANGED", null);
  }

  pauseGame(): void {
    const session = this.requireLiveSession();
    if (session.phase !== "playing") return;
    this.freezePlayingClock(session);
    session.phase = "paused";
    session.gameStartedAt = null;
    this.refreshMasterSponsor();
    eventBus.emit("STATE_CHANGED", null);
  }

  resumeGame(): void {
    const session = this.requireLiveSession();
    this.assertSessionNotExpired();
    if (session.phase !== "paused") {
      throw new Error("Só é possível retomar com a pelada pausada");
    }
    session.phase = "playing";
    session.gameStartedAt = Date.now();
    session.masterSponsorId = null;
    this.ensureTick();
    eventBus.emit("STATE_CHANGED", null);
  }

  finishGame(playBuzzer = false): void {
    const session = this.requireLiveSession();
    if (session.phase === "lobby" || session.phase === "between_games") return;

    if (session.phase === "playing") {
      this.freezePlayingClock(session);
    }

    session.phase = "between_games";
    session.gameStartedAt = null;
    session.ad = null;
    session.team1Score = 0;
    session.team2Score = 0;
    session.gameRemainingMs = session.gameDurationSec * 1000;
    session.playedSinceAdMs = 0;
    this.playedMsTotal = 0;
    this.lastAdIndex = 0;
    this.refreshMasterSponsor();

    if (playBuzzer) {
      this.emitBuzzer();
    }
    eventBus.emit("STATE_CHANGED", null);
  }

  adjustScore(team: 1 | 2, delta: 1 | -1): void {
    const session = this.requireLiveSession();
    if (session.phase !== "playing" && session.phase !== "paused") {
      throw new Error("Placar só durante o jogo");
    }
    if (team === 1) {
      session.team1Score = Math.max(0, session.team1Score + delta);
    } else {
      session.team2Score = Math.max(0, session.team2Score + delta);
    }
    eventBus.emit("STATE_CHANGED", null);
  }

  getGameRemainingMs(now = Date.now()): number {
    if (!this.session) return 0;
    if (this.session.phase === "playing" && this.session.gameStartedAt != null) {
      return Math.max(0, this.session.gameRemainingMs - (now - this.session.gameStartedAt));
    }
    return Math.max(0, this.session.gameRemainingMs);
  }

  private getPlayedMs(now = Date.now()): number {
    if (!this.session) return 0;
    if (this.session.phase === "playing" && this.session.gameStartedAt != null) {
      return this.playedMsTotal + (now - this.session.gameStartedAt);
    }
    return this.playedMsTotal;
  }

  private snapshotSession(): PeladaSession | null {
    if (!this.session) return null;
    const played = this.getPlayedMs();
    return {
      ...this.session,
      // gameRemainingMs stays frozen at gameStartedAt; clients subtract elapsed
      playedSinceAdMs: played % AD_INTERVAL_MS,
    };
  }

  private requireLiveSession(): PeladaSession {
    if (!this.session || this.session.phase === "expired") {
      throw new Error("Nenhuma pelada ativa");
    }
    return this.session;
  }

  private assertSessionNotExpired(): void {
    if (!this.session) return;
    if (Date.now() >= this.session.sessionEndsAt) {
      this.expireSession();
      throw new Error("Tempo da pelada esgotado");
    }
  }

  private freezePlayingClock(session: PeladaSession): void {
    if (session.phase !== "playing" || session.gameStartedAt == null) return;
    const now = Date.now();
    const elapsed = now - session.gameStartedAt;
    session.gameRemainingMs = Math.max(0, session.gameRemainingMs - elapsed);
    this.playedMsTotal += elapsed;
    session.gameStartedAt = null;
  }

  private ensureTick(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  private clearTick(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private tick(): void {
    if (!this.session) {
      this.clearTick();
      return;
    }

    const now = Date.now();

    if (now >= this.session.sessionEndsAt) {
      this.expireSession();
      return;
    }

    if (this.session.ad && now >= this.session.ad.endsAt) {
      this.session.ad = null;
      eventBus.emit("STATE_CHANGED", null);
    }

    if (this.session.phase === "playing" && this.session.gameStartedAt != null) {
      const remaining = this.getGameRemainingMs(now);
      const played = this.getPlayedMs(now);
      const adIndex = Math.floor(played / AD_INTERVAL_MS);

      if (adIndex > this.lastAdIndex && !this.session.ad) {
        this.lastAdIndex = adIndex;
        const sponsor = this.pickAdSponsor();
        if (sponsor) {
          this.session.ad = { sponsorId: sponsor.id, endsAt: now + AD_DURATION_MS };
          eventBus.emit("STATE_CHANGED", null);
        }
      }

      if (remaining <= 0) {
        this.finishGame(true);
      }
    }
  }

  private expireSession(): void {
    if (!this.session) return;
    const bookingId = this.session.bookingId;
    this.db.updatePeladaBooking(bookingId, {
      status: "finished",
      sessionEndsAt: Date.now(),
    });
    this.clearTick();
    this.session = null;
    this.playedMsTotal = 0;
    this.lastAdIndex = 0;
    this.hooks.onSessionEnded();
    eventBus.emit("STATE_CHANGED", null);
  }

  private refreshMasterSponsor(): void {
    if (!this.session) return;
    const master = this.pickMasterSponsor();
    this.session.masterSponsorId = master?.id ?? null;
  }

  private pickMasterSponsor() {
    const all = this.db.listSponsors().filter((s) => s.enabled && s.mediaUrl);
    const masters = all.filter((s) => s.tier === "master");
    return pickPrioritySponsor(masters.length ? masters : all);
  }

  private pickAdSponsor() {
    const idle = sponsorsForSlot(this.db.listSponsors(), "idle");
    const manual = sponsorsForSlot(this.db.listSponsors(), "manual");
    const pool = idle.length ? idle : manual;
    return pickPrioritySponsor(pool);
  }

  private emitBuzzer(): void {
    const payload: EffectPayload = {
      effectId: "pelada-buzzer",
      type: "CUSTOM",
      duration: 2500,
      sound: "/audio/match-end.mp3",
      text: null,
      primaryColor: "#0a0e14",
      secondaryColor: "#f5c518",
      startedAt: Date.now(),
      metadata: { peladaBuzzer: true },
    };
    eventBus.emit("EFFECT_TRIGGER", payload);
  }
}
