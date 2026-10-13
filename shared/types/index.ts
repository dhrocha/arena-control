import type { MatchSportState } from "../sports/volleyball/persist.ts";

export type { MatchSportState };
export type { VolleyballMatchState, VolleyballConfig, VolleyballSet } from "../sports/volleyball/types.ts";

export type ClientRole = "admin" | "controller" | "arena" | "pelada";

/** Sport of a match. Missing/legacy values are treated as FOOTBALL. */
export type Sport = "FOOTBALL" | "VOLLEYBALL";

/** Legacy "pelada" may still appear on finished historical matches. */
export type MatchMode = "pelada" | "gameday";

export type PeladaBookingStatus = "scheduled" | "active" | "finished" | "cancelled";

export type PeladaPhase = "lobby" | "playing" | "paused" | "between_games" | "expired";

export interface PeladaBooking {
  id: string;
  name: string;
  phone: string;
  /** Random access PIN for /pelada (generated at booking creation). */
  pin: string;
  scheduledAt: number;
  durationMinutes: number;
  sport: Sport;
  status: PeladaBookingStatus;
  sessionStartedAt: number | null;
  sessionEndsAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface PeladaAdState {
  sponsorId: string;
  endsAt: number;
}

/** Live pelada session (not persisted; cleared when session ends). */
export interface PeladaSession {
  bookingId: string;
  sport: Sport;
  sessionEndsAt: number;
  phase: PeladaPhase;
  gameDurationSec: number;
  team1Color: string;
  team2Color: string;
  team1Score: number;
  team2Score: number;
  /** Remaining ms when paused / between; ignored while playing (use gameStartedAt). */
  gameRemainingMs: number;
  /** Wall-clock start of current running segment; null when not playing. */
  gameStartedAt: number | null;
  /** Accumulated playing ms since last ad (for 60s ad cadence). */
  playedSinceAdMs: number;
  ad: PeladaAdState | null;
  /** Master sponsor shown during lobby / pause / between_games. */
  masterSponsorId: string | null;
}

/** Normalize unknown/legacy sport values to a valid Sport. */
export function resolveSport(value: unknown): Sport {
  return value === "VOLLEYBALL" ? "VOLLEYBALL" : "FOOTBALL";
}

/** Normalize effect sport tag; missing → ALL (shared / legacy). */
export function resolveEffectSport(value: unknown): Sport | "ALL" {
  if (value === "FOOTBALL" || value === "VOLLEYBALL" || value === "ALL") return value;
  return "ALL";
}

export type MatchStatus =
  | "setup"
  | "countdown"
  | "playing"
  | "paused"
  | "halftime"
  | "finished";

export type MatchEventType =
  | "GOAL"
  | "OWN_GOAL"
  | "UNDO_GOAL"
  | "YELLOW_CARD"
  | "RED_CARD"
  | "FOUL"
  | "PENALTY"
  | "MVP"
  | "SUBSTITUTION"
  | "MATCH_START"
  | "HALF_TIME"
  | "MATCH_END"
  | "CUSTOM"
  | "VOLLEYBALL_POINT"
  | "SET_POINT"
  | "DEUCE"
  | "SET_START"
  | "SET_END"
  | "MATCH_POINT"
  | "TIMEOUT_START"
  | "TIMEOUT_END"
  | "UNDO_POINT"
  | "SERVER_CHANGED";

export type EffectType =
  | "GOAL"
  | "MATCH_START"
  | "COUNTDOWN"
  | "HALF_TIME"
  | "MATCH_END"
  | "MVP"
  | "MVP_TEASE"
  | "MVP_SPONSOR"
  | "TEAM_INTRO"
  | "PLAYER_INTRO"
  | "PENALTY"
  | "CARD"
  | "CUSTOM"
  | "VOLLEY_POINT"
  | "VOLLEY_SET_POINT"
  | "VOLLEY_DEUCE"
  | "VOLLEY_SET_END"
  | "VOLLEY_MATCH_POINT"
  | "VOLLEY_TIMEOUT"
  | "VOLLEY_MATCH_END"
  | "VOLLEY_MVP"
  | "VOLLEY_MATCH_START"
  | "VOLLEY_SET_START";

export type SponsorTier = "master" | "oficial" | "parceiro" | "amigo";

export type SponsorSlot = "idle" | "timeout" | "halftime" | "mvp" | "manual";

export type SponsorMediaType = "image" | "video";

export interface Sponsor {
  id: string;
  name: string;
  mediaUrl: string | null;
  mediaType: SponsorMediaType;
  tier: SponsorTier;
  slots: SponsorSlot[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export type SponsorCarouselMode = "idle" | "halftime" | "manual";

export interface SponsorDisplayState {
  mode: SponsorCarouselMode;
  playlist: string[];
  index: number;
  itemStartedAt: number;
  itemDurationMs: number;
  returnView: "scoreboard" | "idle";
  /** When true, playlist loops forever (idle). */
  loop: boolean;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  logo: string | null;
  primaryColor: string;
  secondaryColor: string;
  createdAt: number;
  updatedAt: number;
}

export interface Player {
  id: string;
  teamId: string;
  name: string;
  nickname: string;
  shirtNumber: number;
  photo: string | null;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Match {
  id: string;
  sport: Sport;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  mode: MatchMode;
  duration: number;
  firstHalfDuration: number;
  secondHalfDuration: number;
  halfTimeDuration: number;
  currentPeriod: 1 | 2;
  accumulatedMs: number;
  startedAt: number | null;
  status: MatchStatus;
  mvpPlayerId: string | null;
  startTime: number | null;
  endTime: number | null;
  /**
   * Sport-specific JSON state.
   * Volleyball: sets, config, specialState, serve…
   * Football / legacy: null
   */
  sportState: MatchSportState | null;
  createdAt: number;
  updatedAt: number;
}

export interface MatchEvent {
  id: string;
  matchId: string;
  type: MatchEventType;
  teamId: string | null;
  playerId: string | null;
  timestamp: number;
  matchTime: number;
  metadata: Record<string, unknown> | null;
}

export interface Effect {
  id: string;
  name: string;
  type: EffectType;
  duration: number;
  animation: string;
  sound: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  text: string | null;
  useTeamColors: boolean;
  enabled: boolean;
  /** FOOTBALL / VOLLEYBALL / ALL (legacy defaults to ALL). */
  sport: Sport | "ALL";
}


export interface Settings {
  arenaName: string;
  arenaLogo: string | null;
  pin: string;
  volumeMaster: number;
  volumeEffects: number;
  defaultDuration: number;
  firstHalfDuration: number;
  secondHalfDuration: number;
  halfTimeDuration: number;
  theme: string;
  port: number;
  countdownSeconds: number;
  /**
   * Fallback seconds for idle / manual carousel when a tier has no override.
   * Prefer `sponsorTierSeconds` for per-tier durations.
   */
  idleSponsorSeconds: number;
  /**
   * Shared duration (seconds) during match contexts (intervalo, timeout…).
   * Priority still applies; time is the same for every tier.
   */
  halftimeSponsorSeconds: number;
  /** Idle / manual carousel duration (seconds) per sponsorship tier. */
  sponsorTierSeconds: Record<SponsorTier, number>;
  /**
   * Phone shown on pelada "Anuncie aqui" strip.
   * Injected from ARENA_ADVERTISE_PHONE env (not persisted in DB).
   */
  advertisePhone: string;
}

export interface ClientInfo {
  id: string;
  role: ClientRole;
  connectedAt: number;
  label: string;
}

export interface NetworkInfo {
  port: number;
  interfaces: Array<{ name: string; address: string; family: string }>;
  urls: {
    root: string;
    admin: string;
    control: string;
    arena: string;
    setup: string;
    pelada: string;
  };
}

/** O que a Arena deve mostrar quando não há efeito ativo */
export type ArenaView = "scoreboard" | "idle" | "sponsor_carousel";

export interface AppState {
  settings: Settings;
  teams: Team[];
  players: Player[];
  sponsors: Sponsor[];
  match: Match | null;
  events: MatchEvent[];
  effects: Effect[];
  devices: ClientInfo[];
  activeControllerId: string | null;
  /** Active controller for /pelada (separate from Game Day controller). */
  peladaControllerId: string | null;
  serverTime: number;
  network: NetworkInfo;
  activeEffect: EffectPayload | null;
  arenaView: ArenaView;
  sponsorDisplay: SponsorDisplayState | null;
  /** Sponsor chosen for the active volleyball timeout split. */
  timeoutSponsorId: string | null;
  /** Live pelada session, or null when none. */
  peladaSession: PeladaSession | null;
}

export interface EffectPayload {
  effectId: string;
  type: EffectType;
  duration: number;
  sound: string | null;
  text: string | null;
  primaryColor: string;
  secondaryColor: string;
  teamId?: string;
  playerId?: string;
  homeScore?: number;
  awayScore?: number;
  countdownValue?: number;
  metadata?: Record<string, unknown>;
  startedAt: number;
}
