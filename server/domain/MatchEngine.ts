import type {
  AppState,
  ArenaView,
  ClientInfo,
  Effect,
  EffectPayload,
  EffectType,
  Match,
  MatchMode,
  MatchStatus,
  NetworkInfo,
  Settings,
  Sponsor,
  SponsorCarouselMode,
  SponsorDisplayState,
  Sport,
  Team,
  VolleyballMatchState,
} from "../../shared/types/index.ts";
import { resolveSport } from "../../shared/types/index.ts";
import {
  buildPriorityPlaylist,
  normalizeSponsorTierSeconds,
  pickPrioritySponsor,
  secondsForSponsorTier,
  sponsorsForSlot,
} from "../../shared/sponsors/playlist.ts";
import {
  scoresFromVolleyballState,
  volleyballRules,
  type VolleyballConfig,
  type VolleyballEffectHint,
  type VolleyballPointType,
} from "../../shared/sports/index.ts";
import type { ArenaDatabase } from "../db/database.ts";
import { buildNetworkInfo } from "../network/ips.ts";
import { eventBus } from "./EventBus.ts";
import { PeladaEngine } from "./PeladaEngine.ts";

type VolleyballUndoSnapshot = {
  sportState: VolleyballMatchState;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  lastPointEventId: string | null;
};

const EFFECT_HINT_MAP: Record<VolleyballEffectHint, EffectType> = {
  VOLLEY_POINT: "VOLLEY_POINT",
  VOLLEY_SET_POINT: "VOLLEY_SET_POINT",
  VOLLEY_DEUCE: "VOLLEY_DEUCE",
  VOLLEY_MATCH_POINT: "VOLLEY_MATCH_POINT",
  VOLLEY_SET_END: "VOLLEY_SET_END",
  VOLLEY_MATCH_END: "VOLLEY_MATCH_END",
};

export class MatchEngine {
  private activeEffect: EffectPayload | null = null;
  private effectTimer: ReturnType<typeof setTimeout> | null = null;
  private effectQueue: Array<{ type: EffectType; extras: Partial<EffectPayload> }> = [];
  private pendingAfterEffect: (() => void) | null = null;
  private devices = new Map<string, ClientInfo>();
  private activeControllerId: string | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private arenaView: ArenaView = "idle";
  private sponsorDisplay: SponsorDisplayState | null = null;
  private sponsorTimer: ReturnType<typeof setTimeout> | null = null;
  private timeoutSponsorId: string | null = null;
  private volleyballUndoStack: VolleyballUndoSnapshot[] = [];
  private lastVolleyballPointEventId: string | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  readonly pelada: PeladaEngine;

  constructor(private readonly db: ArenaDatabase) {
    this.pelada = new PeladaEngine(db, {
      hasActiveMatch: () => {
        const m = this.db.getActiveMatch();
        return Boolean(m && m.status !== "finished");
      },
      onSessionStarted: () => {
        this.stopSponsorCarousel();
        this.arenaView = "scoreboard";
        this.clearEffect(false);
      },
      onSessionEnded: () => {
        this.arenaView = "idle";
        this.ensureIdleSponsorCarousel();
      },
    });
    queueMicrotask(() => this.ensureIdleSponsorCarousel());
  }

  getNetwork(): NetworkInfo {
    const settings = this.db.getSettings();
    return buildNetworkInfo(settings.port);
  }

  getState(): AppState {
    const match = this.db.getActiveMatch();
    return {
      settings: this.db.getSettings(),
      teams: this.db.listTeams(),
      players: this.db.listPlayers(),
      sponsors: this.db.listSponsors(),
      match,
      events: match ? this.db.listEvents(match.id) : [],
      effects: this.db.listEffects(),
      devices: Array.from(this.devices.values()),
      activeControllerId: this.activeControllerId,
      peladaControllerId: this.pelada.getPeladaControllerId(),
      serverTime: Date.now(),
      network: this.getNetwork(),
      activeEffect: this.activeEffect,
      arenaView: this.arenaView,
      sponsorDisplay: this.sponsorDisplay,
      timeoutSponsorId: this.timeoutSponsorId,
      peladaSession: this.pelada.getSession(),
    };
  }

  getElapsedMs(match: Match): number {
    if (match.status === "playing" && match.startedAt != null) {
      return match.accumulatedMs + (Date.now() - match.startedAt);
    }
    return match.accumulatedMs;
  }

  registerClient(info: ClientInfo): void {
    this.devices.set(info.id, info);
    if (info.role === "controller" && !this.activeControllerId) {
      this.activeControllerId = info.id;
    }
    if (info.role === "pelada" && !this.pelada.getPeladaControllerId()) {
      this.pelada.setPeladaControllerId(info.id);
    }
    eventBus.emit("STATE_CHANGED", null);
  }

  unregisterClient(id: string): void {
    const existing = this.devices.get(id);
    this.devices.delete(id);
    if (this.activeControllerId === id) {
      const next = Array.from(this.devices.values()).find((d) => d.role === "controller");
      this.activeControllerId = next?.id ?? null;
    }
    if (this.pelada.getPeladaControllerId() === id) {
      const nextPelada = Array.from(this.devices.values()).find((d) => d.role === "pelada");
      this.pelada.setPeladaControllerId(nextPelada?.id ?? null);
    }
    if (existing) {
      eventBus.emit("STATE_CHANGED", null);
    }
  }

  canControl(clientId: string, role: string): boolean {
    if (role === "admin") return true;
    if (role === "pelada") return this.pelada.canControlPelada(clientId, role);
    if (role !== "controller") return false;
    // Se o controlador ativo sumiu, promove o atual
    if (this.activeControllerId) {
      const stillThere = this.devices.has(this.activeControllerId);
      if (!stillThere) this.activeControllerId = null;
    }
    if (!this.activeControllerId) {
      this.activeControllerId = clientId;
      return true;
    }
    return this.activeControllerId === clientId;
  }

  claimControl(clientId: string): void {
    this.activeControllerId = clientId;
    eventBus.emit("STATE_CHANGED", null);
  }

  /** Arena Control PIN (controller / admin settings). */
  verifyPin(pin: string): boolean {
    return pin === this.db.getSettings().pin;
  }

  /** Pelada booking PIN — only scheduled/active bookings grant access. */
  verifyPeladaPin(pin: string): boolean {
    return Boolean(this.db.findOpenPeladaByPin(pin));
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const current = this.db.getSettings();
    const next: Settings = {
      ...current,
      ...patch,
      sponsorTierSeconds: normalizeSponsorTierSeconds(
        patch.sponsorTierSeconds ?? current.sponsorTierSeconds
      ),
    };
    this.db.saveSettings(next);
    eventBus.emit("STATE_CHANGED", null);
    return next;
  }

  createMatch(input: {
    homeTeamId: string;
    awayTeamId: string;
    mode: MatchMode;
    duration: number;
    sport?: Sport;
    /** Volleyball-only; ignored for football. */
    volleyballConfig?: Partial<VolleyballConfig>;
  }): Match {
    if (this.pelada.getSession()) {
      throw new Error("Finalize a pelada ativa antes de criar uma partida Game Day");
    }

    const existing = this.db.getActiveMatch();
    if (existing && existing.status !== "finished") {
      this.db.updateMatch(existing.id, {
        status: "finished",
        endTime: Date.now(),
        startedAt: null,
      });
    }

    const settings = this.db.getSettings();
    const half = Math.floor(input.duration / 2);
    const sport = resolveSport(input.sport);
    const now = Date.now();
    // New matches are always Game Day (legacy pelada mode removed)
    const mode: MatchMode = "gameday";

    let sportState: Match["sportState"] = null;
    if (sport === "VOLLEYBALL") {
      const volleyball = volleyballRules.createInitialState({
        homeTeamId: input.homeTeamId,
        awayTeamId: input.awayTeamId,
        config: input.volleyballConfig,
        now,
      });
      volleyball.status = "SETUP";
      sportState = volleyball;
    }

    const scores =
      sportState && sport === "VOLLEYBALL"
        ? scoresFromVolleyballState(sportState)
        : { homeScore: 0, awayScore: 0 };

    const match = this.db.createMatch({
      sport,
      sportState,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      homeScore: scores.homeScore,
      awayScore: scores.awayScore,
      mode,
      duration: input.duration,
      firstHalfDuration: half || settings.firstHalfDuration,
      secondHalfDuration: input.duration - half || settings.secondHalfDuration,
      halfTimeDuration: settings.halfTimeDuration,
      currentPeriod: 1,
      accumulatedMs: 0,
      startedAt: null,
      status: "setup",
      mvpPlayerId: null,
      startTime: null,
      endTime: null,
    });

    this.clearEffect();
    this.stopSponsorCarousel();
    this.arenaView = "scoreboard";
    this.volleyballUndoStack = [];
    this.lastVolleyballPointEventId = null;
    this.clearTimeoutTimer();
    this.timeoutSponsorId = null;
    eventBus.emit("STATE_CHANGED", null);
    return match;
  }

  requireMatch(): Match {
    const match = this.db.getActiveMatch();
    if (!match) throw new Error("Nenhuma partida ativa");
    return match;
  }

  private requireFootballMatch(): Match {
    const match = this.requireMatch();
    if (match.sport === "VOLLEYBALL") {
      throw new Error("Ação de futebol não disponível em partida de vôlei");
    }
    return match;
  }

  startMatch(): void {
    const match = this.requireMatch();
    if (match.mode === "gameday" && match.status === "setup") {
      this.startCountdown();
      return;
    }
    this.beginPlaying(match);
  }

  private beginPlaying(match: Match): void {
    const now = Date.now();
    this.clearCountdown();
    this.arenaView = "scoreboard";

    let sportState = match.sportState;
    if (match.sport === "VOLLEYBALL" && sportState?.sport === "VOLLEYBALL") {
      sportState = {
        ...sportState,
        status: sportState.status === "SETUP" ? "PLAYING" : sportState.status,
        updatedAt: now,
      };
    }

    this.db.updateMatch(match.id, {
      status: "playing",
      startedAt: now,
      startTime: match.startTime ?? now,
      sportState,
    });
    this.db.addEvent({
      matchId: match.id,
      type: "MATCH_START",
      teamId: null,
      playerId: null,
      timestamp: now,
      matchTime: this.getElapsedMs(match),
      metadata: match.sport === "VOLLEYBALL" ? { sport: "VOLLEYBALL" } : null,
    });
    if (match.mode === "gameday") {
      const started =
        match.sport === "VOLLEYBALL"
          ? this.triggerEffect("VOLLEY_MATCH_START")
          : this.triggerEffect("MATCH_START");
      if (!started) this.triggerEffect("MATCH_START");
    }
    eventBus.emit("STATE_CHANGED", null);
  }

  private startCountdown(): void {
    const match = this.requireMatch();
    const settings = this.db.getSettings();
    this.db.updateMatch(match.id, { status: "countdown", startTime: Date.now() });
    this.triggerEffect("COUNTDOWN", { countdownValue: settings.countdownSeconds });

    let remaining = settings.countdownSeconds;
    this.clearCountdown();
    this.countdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        this.clearCountdown();
        const current = this.db.getActiveMatch();
        if (current && current.status === "countdown") {
          this.beginPlaying(current);
        }
        return;
      }
      this.triggerEffect("COUNTDOWN", { countdownValue: remaining });
    }, 1000);

    eventBus.emit("STATE_CHANGED", null);
  }

  private clearCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  pauseMatch(): void {
    const match = this.requireMatch();
    if (match.status !== "playing") return;
    const elapsed = this.getElapsedMs(match);
    this.db.updateMatch(match.id, {
      status: "paused",
      accumulatedMs: elapsed,
      startedAt: null,
    });
    eventBus.emit("STATE_CHANGED", null);
  }

  resumeMatch(): void {
    const match = this.requireMatch();
    if (match.status !== "paused" && match.status !== "halftime") return;
    this.db.updateMatch(match.id, {
      status: "playing",
      startedAt: Date.now(),
      currentPeriod: match.status === "halftime" ? 2 : match.currentPeriod,
    });
    eventBus.emit("STATE_CHANGED", null);
  }

  halfTime(): void {
    const match = this.requireFootballMatch();
    if (match.status !== "playing" && match.status !== "paused") {
      throw new Error("Intervalo só durante o 1º tempo");
    }
    if (match.currentPeriod !== 1) {
      throw new Error("Intervalo já passou");
    }
    const elapsed = this.getElapsedMs(match);
    this.db.updateMatch(match.id, {
      status: "halftime",
      accumulatedMs: elapsed,
      startedAt: null,
      currentPeriod: 1,
    });
    this.db.addEvent({
      matchId: match.id,
      type: "HALF_TIME",
      teamId: null,
      playerId: null,
      timestamp: Date.now(),
      matchTime: elapsed,
      metadata: null,
    });
    this.arenaView = "scoreboard";
    if (match.mode === "gameday") {
      const triggered = this.triggerEffect("HALF_TIME", {
        homeScore: match.homeScore,
        awayScore: match.awayScore,
      });
      if (triggered) {
        this.pendingAfterEffect = () => this.startSponsorCarousel("halftime");
      } else {
        this.startSponsorCarousel("halftime");
      }
    } else {
      this.startSponsorCarousel("halftime");
    }
    eventBus.emit("STATE_CHANGED", null);
  }

  secondHalf(): void {
    const match = this.requireFootballMatch();
    if (match.status !== "halftime") {
      throw new Error("Segundo tempo só após o intervalo");
    }
    this.stopSponsorCarousel();
    this.resumeMatch();
  }

  finishMatch(): void {
    const match = this.requireMatch();
    if (match.status === "finished") return;
    const elapsed = this.getElapsedMs(match);
    this.clearCountdown();
    this.clearTimeoutTimer();
    const homeScore = match.homeScore;
    const awayScore = match.awayScore;
    this.db.updateMatch(match.id, {
      status: "finished",
      accumulatedMs: elapsed,
      startedAt: null,
      endTime: Date.now(),
    });
    this.db.addEvent({
      matchId: match.id,
      type: "MATCH_END",
      teamId: null,
      playerId: null,
      timestamp: Date.now(),
      matchTime: elapsed,
      metadata: {
        homeScore,
        awayScore,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
      },
    });
    this.arenaView = "scoreboard";
    if (match.mode === "gameday") {
      this.triggerEffect("MATCH_END", {
        homeScore,
        awayScore,
        metadata: { homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
      });
    } else {
      this.clearEffect();
    }
    eventBus.emit("STATE_CHANGED", null);
  }

  resetTimer(): void {
    const match = this.requireFootballMatch();
    this.db.updateMatch(match.id, {
      accumulatedMs: 0,
      startedAt: match.status === "playing" ? Date.now() : null,
    });
    eventBus.emit("STATE_CHANGED", null);
  }

  addGoal(teamId: string, playerId?: string, ownGoal = false): void {
    const match = this.requireFootballMatch();
    if (match.status === "finished" || match.status === "setup" || match.status === "countdown") {
      throw new Error("Partida não está em andamento");
    }

    const isHome = teamId === match.homeTeamId;
    const isAway = teamId === match.awayTeamId;
    if (!isHome && !isAway) throw new Error("Time inválido");

    let homeScore = match.homeScore;
    let awayScore = match.awayScore;

    if (ownGoal) {
      if (isHome) awayScore += 1;
      else homeScore += 1;
    } else {
      if (isHome) homeScore += 1;
      else awayScore += 1;
    }

    const elapsed = this.getElapsedMs(match);
    this.db.updateMatch(match.id, { homeScore, awayScore });
    this.db.addEvent({
      matchId: match.id,
      type: ownGoal ? "OWN_GOAL" : "GOAL",
      teamId,
      playerId: playerId ?? null,
      timestamp: Date.now(),
      matchTime: elapsed,
      metadata: { homeScore, awayScore },
    });

    if (match.mode === "gameday") {
      this.triggerEffect("GOAL", { teamId, playerId, homeScore, awayScore });
    }

    eventBus.emit("STATE_CHANGED", null);
  }

  undoLastGoal(): void {
    const match = this.requireFootballMatch();
    const events = this.db.listEvents(match.id);
    const undoneIds = new Set(
      events
        .filter((e) => e.type === "UNDO_GOAL")
        .map((e) => String(e.metadata?.undoneEventId ?? ""))
        .filter(Boolean)
    );
    const lastGoal = [...events]
      .reverse()
      .find((e) => (e.type === "GOAL" || e.type === "OWN_GOAL") && !undoneIds.has(e.id));
    if (!lastGoal || !lastGoal.teamId) {
      throw new Error("Nenhum gol para desfazer");
    }

    let homeScore = match.homeScore;
    let awayScore = match.awayScore;
    const isHome = lastGoal.teamId === match.homeTeamId;

    if (lastGoal.type === "OWN_GOAL") {
      if (isHome) awayScore = Math.max(0, awayScore - 1);
      else homeScore = Math.max(0, homeScore - 1);
    } else {
      if (isHome) homeScore = Math.max(0, homeScore - 1);
      else awayScore = Math.max(0, awayScore - 1);
    }

    this.db.updateMatch(match.id, { homeScore, awayScore });
    this.db.addEvent({
      matchId: match.id,
      type: "UNDO_GOAL",
      teamId: lastGoal.teamId,
      playerId: lastGoal.playerId,
      timestamp: Date.now(),
      matchTime: this.getElapsedMs(match),
      metadata: {
        undoneEventId: lastGoal.id,
        previousType: lastGoal.type,
        homeScore,
        awayScore,
      },
    });

    this.clearEffect();
    eventBus.emit("STATE_CHANGED", null);
  }

  selectMvp(playerId: string): void {
    const match = this.requireMatch();
    const player = this.db.getPlayer(playerId);
    if (!player) throw new Error("Jogador não encontrado");

    this.db.updateMatch(match.id, { mvpPlayerId: playerId });
    this.db.addEvent({
      matchId: match.id,
      type: "MVP",
      teamId: player.teamId,
      playerId,
      timestamp: Date.now(),
      matchTime: this.getElapsedMs(match),
      metadata: null,
    });

    if (match.mode === "gameday") {
      // Intro → master 5s → MVP 10s → scoreboard (never leave carousel view empty)
      this.clearEffect(false);
      this.clearEffectQueue();
      this.stopSponsorCarousel();
      this.arenaView = "scoreboard";

      const mvpSponsor = this.pickMvpMasterSponsor();
      const sponsorMeta = mvpSponsor
        ? { sponsorId: mvpSponsor.id, sponsorName: mvpSponsor.name }
        : undefined;
      const mvpType: EffectType = match.sport === "VOLLEYBALL" ? "VOLLEY_MVP" : "MVP";

      this.enqueueEffect("MVP_TEASE", { teamId: player.teamId, playerId, metadata: sponsorMeta });
      if (mvpSponsor) {
        this.enqueueEffect("MVP_SPONSOR", {
          teamId: player.teamId,
          playerId,
          duration: 5000,
          metadata: sponsorMeta,
        });
      }
      this.enqueueEffect(mvpType, {
        teamId: player.teamId,
        playerId,
        duration: 10000,
        metadata: sponsorMeta,
      });
      // Fallback if VOLLEY_MVP missing
      if (mvpType === "VOLLEY_MVP" && !this.db.getEffectByType("VOLLEY_MVP")?.enabled) {
        this.effectQueue = this.effectQueue.map((item) =>
          item.type === "VOLLEY_MVP" ? { ...item, type: "MVP" as EffectType } : item
        );
      }
      this.playNextQueuedEffect();
    }
    eventBus.emit("STATE_CHANGED", null);
  }

  /** Prefer master sponsors tagged for MVP; fall back to any enabled master. */
  private pickMvpMasterSponsor() {
    const masters = this.db
      .listSponsors()
      .filter((s) => s.enabled && s.mediaUrl && s.tier === "master");
    if (!masters.length) return null;
    const mvpMasters = masters.filter((s) => s.slots.includes("mvp"));
    return pickPrioritySponsor(mvpMasters.length ? mvpMasters : masters);
  }

  showTeamIntro(): void {
    const match = this.db.getActiveMatch();
    if (!match) throw new Error("Crie uma partida antes de apresentar");
    if (match.status !== "setup") {
      throw new Error("Apresentação só antes do início da partida");
    }
    if (match.mode !== "gameday") {
      throw new Error("Apresentação disponível só no Game Day");
    }
    this.stopSponsorCarousel();
    this.arenaView = "scoreboard";
    this.triggerEffect("TEAM_INTRO");
    eventBus.emit("STATE_CHANGED", null);
  }

  showCountdown(): void {
    const match = this.db.getActiveMatch();
    if (!match) throw new Error("Crie uma partida antes do countdown");
    if (match.status !== "setup") {
      throw new Error("Countdown só antes do início da partida");
    }
    if (match.mode !== "gameday") {
      throw new Error("Countdown disponível só no Game Day");
    }
    this.stopSponsorCarousel();
    this.startCountdown();
  }

  showScoreboard(): void {
    this.clearEffect(false);
    this.clearEffectQueue();
    this.stopSponsorCarousel();
    this.arenaView = "scoreboard";
    eventBus.emit("STATE_CHANGED", null);
  }

  clearScreen(): void {
    this.clearEffect(false);
    this.clearEffectQueue();
    this.arenaView = "idle";
    this.ensureIdleSponsorCarousel();
    eventBus.emit("STATE_CHANGED", null);
  }

  showSponsors(): void {
    this.clearEffect(false);
    this.clearEffectQueue();
    this.startSponsorCarousel("manual");
  }

  triggerEffect(
    type: EffectType,
    extras: Partial<EffectPayload> = {}
  ): EffectPayload | null {
    const effect = this.db.getEffectByType(type);
    if (!effect || !effect.enabled) return null;

    const match = this.db.getActiveMatch();
    const team = extras.teamId ? this.db.getTeam(extras.teamId) : this.resolvePrimaryTeam(match, effect);
    const colors = this.resolveColors(effect, team);

    const payload: EffectPayload = {
      effectId: effect.id,
      type: effect.type,
      duration: extras.duration ?? effect.duration,
      sound: effect.sound,
      text: effect.text,
      primaryColor: colors.primary,
      secondaryColor: colors.secondary,
      teamId: extras.teamId ?? team?.id,
      playerId: extras.playerId,
      homeScore: extras.homeScore ?? match?.homeScore,
      awayScore: extras.awayScore ?? match?.awayScore,
      countdownValue: extras.countdownValue,
      metadata: extras.metadata,
      startedAt: Date.now(),
    };

    this.activeEffect = payload;
    // Effects always sit on scoreboard view so the arena never goes blank when they end
    // (carousel is started explicitly via pendingAfterEffect when needed).
    this.arenaView = "scoreboard";
    if (this.effectTimer) clearTimeout(this.effectTimer);
    const duration = payload.duration;
    this.effectTimer = setTimeout(() => {
      this.activeEffect = null;
      eventBus.emit("EFFECT_CANCEL", null);
      const pending = this.pendingAfterEffect;
      this.pendingAfterEffect = null;
      if (pending) {
        pending();
      } else if (this.effectQueue.length) {
        this.playNextQueuedEffect();
      } else {
        this.arenaView = "scoreboard";
        eventBus.emit("STATE_CHANGED", null);
      }
    }, duration);

    eventBus.emit("EFFECT_TRIGGER", payload);
    return payload;
  }

  clearEffect(emitCancel = true): void {
    if (this.effectTimer) clearTimeout(this.effectTimer);
    this.effectTimer = null;
    this.activeEffect = null;
    this.pendingAfterEffect = null;
    if (emitCancel) {
      eventBus.emit("EFFECT_CANCEL", null);
    }
  }

  private clearEffectQueue(): void {
    this.effectQueue = [];
  }

  private enqueueEffect(type: EffectType, extras: Partial<EffectPayload> = {}): void {
    this.effectQueue.push({ type, extras });
  }

  private playNextQueuedEffect(): void {
    const next = this.effectQueue.shift();
    if (!next) {
      eventBus.emit("STATE_CHANGED", null);
      return;
    }
    const triggered = this.triggerEffect(next.type, next.extras);
    if (!triggered) {
      this.playNextQueuedEffect();
    } else {
      eventBus.emit("STATE_CHANGED", null);
    }
  }

  /** Start weighted sponsor carousel for idle / halftime / manual. */
  startSponsorCarousel(mode: SponsorCarouselMode): void {
    const settings = this.db.getSettings();
    const candidates = this.candidatesForCarousel(mode);

    if (!candidates.length) {
      this.stopSponsorCarousel();
      if (mode === "halftime") {
        this.arenaView = "scoreboard";
      } else if (mode === "idle") {
        this.arenaView = "idle";
      }
      eventBus.emit("STATE_CHANGED", null);
      return;
    }

    const returnView: "scoreboard" | "idle" =
      mode === "idle"
        ? "idle"
        : this.arenaView === "sponsor_carousel"
          ? (this.sponsorDisplay?.returnView ?? "scoreboard")
          : this.arenaView === "idle"
            ? "idle"
            : "scoreboard";

    const playlist = buildPriorityPlaylist(candidates);
    const itemDurationMs = this.durationForCarouselItem(mode, candidates, playlist[0]);
    this.clearSponsorTimer();
    this.sponsorDisplay = {
      mode,
      playlist,
      index: 0,
      itemStartedAt: Date.now(),
      itemDurationMs,
      returnView,
      // Idle and halftime keep rotating until match/view changes
      loop: mode === "idle" || mode === "halftime",
    };
    this.arenaView = "sponsor_carousel";
    this.scheduleSponsorAdvance();
    eventBus.emit("STATE_CHANGED", null);
  }

  /**
   * Idle/manual: per-tier configured seconds.
   * Halftime (during match): shared duration for all tiers.
   */
  private durationForCarouselItem(
    mode: SponsorCarouselMode,
    candidates: Sponsor[],
    sponsorId: string | undefined
  ): number {
    const settings = this.db.getSettings();
    if (mode === "halftime") {
      return Math.max(3, settings.halftimeSponsorSeconds || 30) * 1000;
    }
    const sponsor = candidates.find((s) => s.id === sponsorId);
    const tier = sponsor?.tier ?? "amigo";
    return secondsForSponsorTier(settings.sponsorTierSeconds, tier) * 1000;
  }

  /** Sponsors eligible for a carousel mode (masters weighted later via playlist). */
  private candidatesForCarousel(mode: SponsorCarouselMode) {
    if (mode === "manual") {
      const manual = sponsorsForSlot(this.db.listSponsors(), "manual");
      return manual.length ? manual : sponsorsForSlot(this.db.listSponsors(), "idle");
    }
    if (mode === "halftime") {
      const halftime = sponsorsForSlot(this.db.listSponsors(), "halftime");
      return halftime.length ? halftime : sponsorsForSlot(this.db.listSponsors(), "idle");
    }
    return sponsorsForSlot(this.db.listSponsors(), "idle");
  }

  /** Public: refresh idle carousel after sponsor CRUD. */
  refreshIdleSponsors(): void {
    if (this.arenaView !== "idle" && !(this.arenaView === "sponsor_carousel" && this.sponsorDisplay?.mode === "idle")) {
      return;
    }
    // Restart idle carousel with fresh playlist
    if (this.sponsorDisplay?.mode === "idle") {
      this.startSponsorCarousel("idle");
      return;
    }
    this.ensureIdleSponsorCarousel();
  }

  private ensureIdleSponsorCarousel(): void {
    if (this.arenaView !== "idle" && this.arenaView !== "sponsor_carousel") return;
    // Already on idle carousel, or another carousel is running (halftime/manual)
    if (this.sponsorDisplay) return;
    const hasIdle = sponsorsForSlot(this.db.listSponsors(), "idle").length > 0;
    if (!hasIdle) {
      this.arenaView = "idle";
      this.sponsorDisplay = null;
      return;
    }
    this.startSponsorCarousel("idle");
  }

  private stopSponsorCarousel(): void {
    this.clearSponsorTimer();
    this.sponsorDisplay = null;
  }

  private clearSponsorTimer(): void {
    if (this.sponsorTimer) {
      clearTimeout(this.sponsorTimer);
      this.sponsorTimer = null;
    }
  }

  private scheduleSponsorAdvance(): void {
    this.clearSponsorTimer();
    const display = this.sponsorDisplay;
    if (!display) return;
    this.sponsorTimer = setTimeout(() => {
      this.sponsorTimer = null;
      this.advanceSponsorCarousel();
    }, display.itemDurationMs);
  }

  private advanceSponsorCarousel(): void {
    const display = this.sponsorDisplay;
    if (!display) return;

    const nextIndex = display.index + 1;
    if (nextIndex >= display.playlist.length) {
      if (display.loop) {
        const candidates = this.candidatesForCarousel(display.mode);
        if (!candidates.length) {
          this.stopSponsorCarousel();
          this.arenaView = display.mode === "halftime" ? "scoreboard" : "idle";
          eventBus.emit("STATE_CHANGED", null);
          return;
        }
        const playlist = buildPriorityPlaylist(candidates);
        this.sponsorDisplay = {
          ...display,
          playlist,
          index: 0,
          itemStartedAt: Date.now(),
          itemDurationMs: this.durationForCarouselItem(display.mode, candidates, playlist[0]),
        };
        this.scheduleSponsorAdvance();
        eventBus.emit("STATE_CHANGED", null);
        return;
      }

      // One-shot (manual) — restore previous view
      const returnView = display.returnView;
      this.stopSponsorCarousel();
      this.arenaView = returnView;
      if (returnView === "idle") {
        this.ensureIdleSponsorCarousel();
      }
      eventBus.emit("STATE_CHANGED", null);
      return;
    }

    const candidates = this.candidatesForCarousel(display.mode);
    this.sponsorDisplay = {
      ...display,
      index: nextIndex,
      itemStartedAt: Date.now(),
      itemDurationMs: this.durationForCarouselItem(
        display.mode,
        candidates,
        display.playlist[nextIndex]
      ),
    };
    this.scheduleSponsorAdvance();
    eventBus.emit("STATE_CHANGED", null);
  }

  private resolvePrimaryTeam(match: Match | null, effect: Effect): Team | null {
    if (!match) return null;
    if (effect.type === "GOAL" || effect.useTeamColors) {
      return this.db.getTeam(match.homeTeamId);
    }
    return null;
  }

  private resolveColors(effect: Effect, team: Team | null): { primary: string; secondary: string } {
    if (effect.useTeamColors && team) {
      return { primary: team.primaryColor, secondary: team.secondaryColor };
    }
    return {
      primary: effect.primaryColor ?? "#0a0e14",
      secondary: effect.secondaryColor ?? "#f5c518",
    };
  }

  updateEffect(id: string, patch: Partial<Effect>): Effect | null {
    const updated = this.db.updateEffect(id, patch);
    eventBus.emit("STATE_CHANGED", null);
    return updated;
  }

  // --- Volleyball ---

  private requireVolleyballState(): { match: Match; sportState: VolleyballMatchState } {
    const match = this.requireMatch();
    if (match.sport !== "VOLLEYBALL" || match.sportState?.sport !== "VOLLEYBALL") {
      throw new Error("Partida de vôlei não encontrada");
    }
    return { match, sportState: match.sportState };
  }

  private persistVolleyballState(
    match: Match,
    sportState: VolleyballMatchState,
    extra: Partial<Match> = {}
  ): Match {
    const scores = scoresFromVolleyballState(sportState);
    let status: MatchStatus = extra.status ?? match.status;

    if (extra.status == null) {
      if (sportState.status === "MATCH_FINISHED") status = "finished";
      else if (sportState.status === "TIMEOUT") status = "paused";
      else if (match.status !== "setup" && match.status !== "countdown" && match.status !== "finished") {
        status = "playing";
      }
    }

    const updated = this.db.updateMatch(match.id, {
      ...extra,
      sportState,
      homeScore: scores.homeScore,
      awayScore: scores.awayScore,
      status,
      endTime:
        sportState.status === "MATCH_FINISHED"
          ? (extra.endTime ?? Date.now())
          : (extra.endTime !== undefined ? extra.endTime : match.endTime),
    });
    if (!updated) throw new Error("Falha ao atualizar partida");
    return updated;
  }

  registerPoint(input: {
    teamId: string;
    playerId?: string;
    pointType?: VolleyballPointType;
  }): void {
    const { match, sportState } = this.requireVolleyballState();
    if (match.status === "finished" || match.status === "setup" || match.status === "countdown") {
      throw new Error("Partida não está em andamento");
    }
    if (sportState.status === "TIMEOUT") {
      throw new Error("Encerre o timeout antes de registrar pontos");
    }
    if (sportState.status === "SET_FINISHED") {
      throw new Error("Inicie o próximo set antes de registrar pontos");
    }

    const result = volleyballRules.registerPoint(sportState, {
      teamId: input.teamId,
      playerId: input.playerId,
      pointType: input.pointType,
    });

    this.volleyballUndoStack.push({
      sportState: result.before,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      status: match.status,
      lastPointEventId: this.lastVolleyballPointEventId,
    });

    const scores = scoresFromVolleyballState(result.state);
    const patch: Partial<Match> = {};
    if (result.outcome === "MATCH_END") {
      patch.status = "finished";
      patch.endTime = Date.now();
      patch.startedAt = null;
    }

    this.persistVolleyballState(match, result.state, patch);

    const event = this.db.addEvent({
      matchId: match.id,
      type:
        result.outcome === "MATCH_END"
          ? "MATCH_END"
          : result.outcome === "SET_END"
            ? "SET_END"
            : "VOLLEYBALL_POINT",
      teamId: input.teamId,
      playerId: input.playerId ?? null,
      timestamp: Date.now(),
      matchTime: this.getElapsedMs(match),
      metadata: {
        homeScore: scores.homeScore,
        awayScore: scores.awayScore,
        homeSetsWon: result.state.homeSetsWon,
        awaySetsWon: result.state.awaySetsWon,
        currentSet: result.state.currentSet,
        specialState: result.state.specialState,
        outcome: result.outcome,
        pointType: input.pointType ?? null,
        setWinnerId: result.setWinnerId ?? null,
        matchWinnerId: result.matchWinnerId ?? null,
      },
    });
    this.lastVolleyballPointEventId = event.id;

    if (result.state.specialState === "DEUCE" && result.outcome === "POINT") {
      this.db.addEvent({
        matchId: match.id,
        type: "DEUCE",
        teamId: null,
        playerId: null,
        timestamp: Date.now(),
        matchTime: this.getElapsedMs(match),
        metadata: { homeScore: scores.homeScore, awayScore: scores.awayScore },
      });
    }
    if (result.state.specialState === "SET_POINT" && result.outcome === "POINT") {
      this.db.addEvent({
        matchId: match.id,
        type: "SET_POINT",
        teamId: input.teamId,
        playerId: null,
        timestamp: Date.now(),
        matchTime: this.getElapsedMs(match),
        metadata: { homeScore: scores.homeScore, awayScore: scores.awayScore },
      });
    }
    if (result.state.specialState === "MATCH_POINT" && result.outcome === "POINT") {
      this.db.addEvent({
        matchId: match.id,
        type: "MATCH_POINT",
        teamId: input.teamId,
        playerId: null,
        timestamp: Date.now(),
        matchTime: this.getElapsedMs(match),
        metadata: { homeScore: scores.homeScore, awayScore: scores.awayScore },
      });
    }

    if (match.mode === "gameday") {
      let hints = [...result.effects];
      if (!result.state.config.pointSoundEnabled) {
        hints = hints.filter((h) => h !== "VOLLEY_POINT");
      }
      const strongest = hints[hints.length - 1];
      if (strongest) {
        const isMatchEnd = result.outcome === "MATCH_END";
        this.triggerEffect(EFFECT_HINT_MAP[strongest], {
          teamId: result.scoringTeamId,
          playerId: input.playerId,
          homeScore: isMatchEnd ? result.state.homeSetsWon : scores.homeScore,
          awayScore: isMatchEnd ? result.state.awaySetsWon : scores.awayScore,
          metadata: {
            homeSetsWon: result.state.homeSetsWon,
            awaySetsWon: result.state.awaySetsWon,
            homeSetScore: scores.homeScore,
            awaySetScore: scores.awayScore,
            currentSet: result.state.currentSet,
            specialState: result.state.specialState,
            outcome: result.outcome,
            finishedSets: result.state.sets
              .filter((s) => s.status === "FINISHED")
              .map((s) => ({ home: s.homeScore, away: s.awayScore, number: s.number })),
          },
        });
      }
    }

    this.arenaView = "scoreboard";
    eventBus.emit("STATE_CHANGED", null);
  }

  undoLastPoint(): void {
    const { match } = this.requireVolleyballState();
    const snapshot = this.volleyballUndoStack.pop();
    if (!snapshot) throw new Error("Nada para desfazer");

    this.db.updateMatch(match.id, {
      sportState: snapshot.sportState,
      homeScore: snapshot.homeScore,
      awayScore: snapshot.awayScore,
      status: snapshot.status === "finished" ? "playing" : snapshot.status,
      endTime: null,
      startedAt:
        snapshot.status === "playing" || snapshot.status === "paused"
          ? match.startedAt ?? Date.now()
          : match.startedAt,
    });

    this.db.addEvent({
      matchId: match.id,
      type: "UNDO_POINT",
      teamId: null,
      playerId: null,
      timestamp: Date.now(),
      matchTime: this.getElapsedMs(match),
      metadata: {
        undoneEventId: this.lastVolleyballPointEventId,
        homeScore: snapshot.homeScore,
        awayScore: snapshot.awayScore,
      },
    });
    this.lastVolleyballPointEventId = snapshot.lastPointEventId;
    this.clearEffect(false);
    this.arenaView = "scoreboard";
    eventBus.emit("STATE_CHANGED", null);
  }

  assignLastPointPlayer(playerId: string): void {
    const { match } = this.requireVolleyballState();
    const player = this.db.getPlayer(playerId);
    if (!player) throw new Error("Jogador inválido");
    if (!this.lastVolleyballPointEventId) throw new Error("Nenhum ponto recente para atribuir");

    const events = this.db.listEvents(match.id);
    const last = events.find((e) => e.id === this.lastVolleyballPointEventId);
    if (!last || (last.type !== "VOLLEYBALL_POINT" && last.type !== "SET_END" && last.type !== "MATCH_END")) {
      throw new Error("Último ponto não encontrado");
    }
    // SQLite has no updateEvent — append attribution metadata via new lightweight note is noisy.
    // Store by re-adding is wrong. Use raw SQL update for player_id.
    this.db.db
      .prepare("UPDATE match_events SET player_id = ? WHERE id = ?")
      .run(playerId, this.lastVolleyballPointEventId);
    eventBus.emit("STATE_CHANGED", null);
  }

  setServer(teamId: string, playerId?: string): void {
    const { match, sportState } = this.requireVolleyballState();
    const next = volleyballRules.setServer(sportState, teamId, playerId);
    this.persistVolleyballState(match, next);
    this.db.addEvent({
      matchId: match.id,
      type: "SERVER_CHANGED",
      teamId,
      playerId: playerId ?? null,
      timestamp: Date.now(),
      matchTime: this.getElapsedMs(match),
      metadata: null,
    });
    eventBus.emit("STATE_CHANGED", null);
  }

  startNextSet(): void {
    const { match, sportState } = this.requireVolleyballState();
    const next = volleyballRules.startNextSet(sportState);
    this.persistVolleyballState(match, next, { status: "playing", startedAt: Date.now() });
    this.db.addEvent({
      matchId: match.id,
      type: "SET_START",
      teamId: null,
      playerId: null,
      timestamp: Date.now(),
      matchTime: this.getElapsedMs(match),
      metadata: {
        currentSet: next.currentSet,
        homeSetsWon: next.homeSetsWon,
        awaySetsWon: next.awaySetsWon,
      },
    });
    if (match.mode === "gameday") {
      this.triggerEffect("VOLLEY_SET_START", {
        homeScore: 0,
        awayScore: 0,
        metadata: { currentSet: next.currentSet },
      });
    }
    this.arenaView = "scoreboard";
    eventBus.emit("STATE_CHANGED", null);
  }

  startTimeout(teamId: string): void {
    const { match, sportState } = this.requireVolleyballState();
    if (teamId !== match.homeTeamId && teamId !== match.awayTeamId) {
      throw new Error("Time inválido");
    }
    if (sportState.status === "SET_FINISHED" || sportState.status === "MATCH_FINISHED") {
      throw new Error("Timeout indisponível neste momento");
    }
    if (sportState.status === "TIMEOUT") {
      throw new Error("Timeout já ativo");
    }

    const now = Date.now();
    const timeoutSeconds = Math.max(1, sportState.config.timeoutSeconds || 30);
    const timeoutEndsAt = now + timeoutSeconds * 1000;

    const accumulatedMs =
      match.status === "playing" && match.startedAt != null
        ? match.accumulatedMs + (now - match.startedAt)
        : match.accumulatedMs;

    const next: VolleyballMatchState = {
      ...sportState,
      status: "TIMEOUT",
      timeoutTeamId: teamId,
      timeoutEndsAt,
      updatedAt: now,
    };

    this.db.updateMatch(match.id, {
      sportState: next,
      status: "paused",
      accumulatedMs,
      startedAt: null,
      homeScore: scoresFromVolleyballState(next).homeScore,
      awayScore: scoresFromVolleyballState(next).awayScore,
    });

    this.db.addEvent({
      matchId: match.id,
      type: "TIMEOUT_START",
      teamId,
      playerId: null,
      timestamp: now,
      matchTime: accumulatedMs,
      metadata: { timeoutSeconds, timeoutEndsAt },
    });

    this.clearTimeoutTimer();
    this.timeoutTimer = setTimeout(() => {
      this.timeoutTimer = null;
      try {
        const current = this.db.getActiveMatch();
        if (current?.sport === "VOLLEYBALL" && current.sportState?.status === "TIMEOUT") {
          this.endTimeout();
        }
      } catch (err) {
        console.warn("[MatchEngine] auto endTimeout:", err);
      }
    }, timeoutSeconds * 1000);

    const timeoutSponsor = pickPrioritySponsor(sponsorsForSlot(this.db.listSponsors(), "timeout"));
    this.timeoutSponsorId = timeoutSponsor?.id ?? null;

    if (match.mode === "gameday") {
      this.triggerEffect("VOLLEY_TIMEOUT", {
        teamId,
        homeScore: scoresFromVolleyballState(next).homeScore,
        awayScore: scoresFromVolleyballState(next).awayScore,
        metadata: {
          timeoutSeconds,
          timeoutEndsAt,
          sponsorId: this.timeoutSponsorId,
        },
      });
    }
    eventBus.emit("STATE_CHANGED", null);
  }

  endTimeout(): void {
    const { match, sportState } = this.requireVolleyballState();
    if (sportState.status !== "TIMEOUT") throw new Error("Nenhum timeout ativo");

    this.clearTimeoutTimer();
    this.timeoutSponsorId = null;

    const resumedStatus =
      sportState.specialState === "MATCH_POINT"
        ? ("MATCH_POINT" as const)
        : sportState.specialState === "SET_POINT"
          ? ("SET_POINT" as const)
          : ("PLAYING" as const);

    const next: VolleyballMatchState = {
      ...sportState,
      status: resumedStatus,
      timeoutTeamId: undefined,
      timeoutEndsAt: undefined,
      updatedAt: Date.now(),
    };

    this.db.updateMatch(match.id, {
      sportState: next,
      status: "playing",
      startedAt: Date.now(),
    });
    this.db.addEvent({
      matchId: match.id,
      type: "TIMEOUT_END",
      teamId: sportState.timeoutTeamId ?? null,
      playerId: null,
      timestamp: Date.now(),
      matchTime: this.getElapsedMs(match),
      metadata: null,
    });
    this.clearEffect(false);
    eventBus.emit("STATE_CHANGED", null);
  }

  setVolleyballOptions(patch: {
    pointSoundEnabled?: boolean;
    autoServer?: boolean;
    timeoutSeconds?: number;
  }): void {
    const { match, sportState } = this.requireVolleyballState();
    const next: VolleyballMatchState = {
      ...sportState,
      config: {
        ...sportState.config,
        ...(patch.pointSoundEnabled !== undefined
          ? { pointSoundEnabled: patch.pointSoundEnabled }
          : {}),
        ...(patch.autoServer !== undefined ? { autoServer: patch.autoServer } : {}),
        ...(patch.timeoutSeconds !== undefined
          ? { timeoutSeconds: Math.max(1, Math.floor(patch.timeoutSeconds)) }
          : {}),
      },
      updatedAt: Date.now(),
    };
    this.db.updateMatch(match.id, { sportState: next });
    eventBus.emit("STATE_CHANGED", null);
  }

  private clearTimeoutTimer(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }
}
