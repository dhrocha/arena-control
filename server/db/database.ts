import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuid } from "uuid";
import type {
  Effect,
  Match,
  MatchEvent,
  MatchSportState,
  Player,
  Settings,
  PeladaBooking,
  PeladaBookingStatus,
  Sponsor,
  SponsorMediaType,
  Sport,
  Team,
} from "../../shared/types/index.ts";
import { resolveEffectSport, resolveSport } from "../../shared/types/index.ts";
import { getAdvertisePhone } from "../config/env.ts";
import { generatePeladaPin } from "../../shared/pelada/pin.ts";
import {
  normalizeSponsorSlots,
  normalizeSponsorTier,
  normalizeSponsorTierSeconds,
} from "../../shared/sponsors/playlist.ts";
import { parseSportState, serializeSportState } from "../../shared/sports/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
export const DATA_DIR = path.join(ROOT, "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const DB_PATH = path.join(DATA_DIR, "arena.db");

function ensureDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DEFAULT_EFFECTS: Omit<Effect, "id">[] = [
  { name: "Gol", type: "GOAL", duration: 6000, animation: "goal", sound: "/audio/goal.mp3", primaryColor: null, secondaryColor: null, text: "GOOOOOOL!", useTeamColors: true, enabled: true, sport: "FOOTBALL" },
  { name: "Início", type: "MATCH_START", duration: 4000, animation: "match-start", sound: "/audio/match-start.mp3", primaryColor: "#0a0e14", secondaryColor: "#e8f0ff", text: "MATCH START", useTeamColors: false, enabled: true, sport: "FOOTBALL" },
  { name: "Countdown", type: "COUNTDOWN", duration: 11000, animation: "countdown", sound: "/audio/countdown.mp3", primaryColor: "#0a0e14", secondaryColor: "#f5c518", text: null, useTeamColors: false, enabled: true, sport: "ALL" },
  { name: "Intervalo", type: "HALF_TIME", duration: 5000, animation: "half-time", sound: "/audio/halftime.mp3", primaryColor: "#0a0e14", secondaryColor: "#f5c518", text: "HALF TIME", useTeamColors: false, enabled: true, sport: "FOOTBALL" },
  { name: "Fim", type: "MATCH_END", duration: 8000, animation: "match-end", sound: "/audio/match-end.mp3", primaryColor: "#0a0e14", secondaryColor: "#f5c518", text: "FINAL", useTeamColors: false, enabled: true, sport: "FOOTBALL" },
  { name: "MVP", type: "MVP", duration: 10000, animation: "mvp", sound: "/audio/mvp.mp3", primaryColor: null, secondaryColor: null, text: "CRAQUE DA PARTIDA", useTeamColors: true, enabled: true, sport: "ALL" },
  { name: "Craque Tease", type: "MVP_TEASE", duration: 3500, animation: "mvp-tease", sound: "/audio/mvp.mp3", primaryColor: "#0a0e14", secondaryColor: "#f5c518", text: "O CRAQUE DA PARTIDA", useTeamColors: false, enabled: true, sport: "ALL" },
  { name: "Craque Patrocínio", type: "MVP_SPONSOR", duration: 5000, animation: "mvp-sponsor", sound: null, primaryColor: "#0a0e14", secondaryColor: "#ffffff", text: "APRESENTADO POR", useTeamColors: false, enabled: true, sport: "ALL" },
  { name: "Apresentação", type: "TEAM_INTRO", duration: 8000, animation: "team-intro", sound: "/audio/match-start.mp3", primaryColor: null, secondaryColor: null, text: "VS", useTeamColors: true, enabled: true, sport: "ALL" },
  { name: "Pênalti", type: "PENALTY", duration: 4000, animation: "penalty", sound: "/audio/penalty.mp3", primaryColor: "#0a0e14", secondaryColor: "#ff3b30", text: "PÊNALTI", useTeamColors: false, enabled: true, sport: "FOOTBALL" },
  { name: "Cartão", type: "CARD", duration: 3500, animation: "card", sound: "/audio/card.mp3", primaryColor: "#0a0e14", secondaryColor: "#f5c518", text: "CARTÃO", useTeamColors: false, enabled: true, sport: "FOOTBALL" },
  // Volleyball
  { name: "Ponto", type: "VOLLEY_POINT", duration: 500, animation: "volley-point", sound: "/audio/volleyball-point.mp3", primaryColor: null, secondaryColor: null, text: null, useTeamColors: true, enabled: true, sport: "VOLLEYBALL" },
  { name: "Set Point", type: "VOLLEY_SET_POINT", duration: 2200, animation: "volley-set-point", sound: "/audio/volleyball-set-point.mp3", primaryColor: "#0a0e14", secondaryColor: "#f5c518", text: "SET POINT", useTeamColors: true, enabled: true, sport: "VOLLEYBALL" },
  { name: "Deuce", type: "VOLLEY_DEUCE", duration: 1800, animation: "volley-deuce", sound: "/audio/volleyball-deuce.mp3", primaryColor: "#0a0e14", secondaryColor: "#ffffff", text: "DEUCE", useTeamColors: false, enabled: true, sport: "VOLLEYBALL" },
  { name: "Fim de Set", type: "VOLLEY_SET_END", duration: 5000, animation: "volley-set-end", sound: "/audio/volleyball-set-win.mp3", primaryColor: null, secondaryColor: null, text: "SET WON", useTeamColors: true, enabled: true, sport: "VOLLEYBALL" },
  { name: "Match Point", type: "VOLLEY_MATCH_POINT", duration: 2800, animation: "volley-match-point", sound: "/audio/volleyball-match-point.mp3", primaryColor: "#0a0e14", secondaryColor: "#ff3b30", text: "MATCH POINT", useTeamColors: true, enabled: true, sport: "VOLLEYBALL" },
  { name: "Timeout", type: "VOLLEY_TIMEOUT", duration: 2500, animation: "volley-timeout", sound: "/audio/volleyball-timeout.mp3", primaryColor: "#0a0e14", secondaryColor: "#f5c518", text: "TIMEOUT", useTeamColors: true, enabled: true, sport: "VOLLEYBALL" },
  { name: "Fim da Partida", type: "VOLLEY_MATCH_END", duration: 8000, animation: "volley-match-end", sound: "/audio/volleyball-match-win.mp3", primaryColor: null, secondaryColor: null, text: "MATCH WON", useTeamColors: true, enabled: true, sport: "VOLLEYBALL" },
  { name: "MVP Vôlei", type: "VOLLEY_MVP", duration: 10000, animation: "volley-mvp", sound: "/audio/volleyball-mvp.mp3", primaryColor: null, secondaryColor: null, text: "CRAQUE DA PARTIDA", useTeamColors: true, enabled: true, sport: "VOLLEYBALL" },
  { name: "Início Vôlei", type: "VOLLEY_MATCH_START", duration: 4000, animation: "volley-match-start", sound: "/audio/volleyball-match-start.mp3", primaryColor: "#0a0e14", secondaryColor: "#e8f0ff", text: "GAME DAY", useTeamColors: false, enabled: true, sport: "VOLLEYBALL" },
  { name: "Início de Set", type: "VOLLEY_SET_START", duration: 3000, animation: "volley-set-start", sound: "/audio/volleyball-set-start.mp3", primaryColor: "#0a0e14", secondaryColor: "#f5c518", text: "SET START", useTeamColors: false, enabled: true, sport: "VOLLEYBALL" },
];

const DEFAULT_SETTINGS: Settings = {
  arenaName: "Arena Control",
  arenaLogo: null,
  pin: "1234",
  volumeMaster: 0.8,
  volumeEffects: 1,
  defaultDuration: 40,
  firstHalfDuration: 20,
  secondHalfDuration: 20,
  halfTimeDuration: 5,
  theme: "dark",
  port: 3000,
  countdownSeconds: 10,
  idleSponsorSeconds: 180,
  halftimeSponsorSeconds: 30,
  sponsorTierSeconds: {
    master: 60,
    oficial: 45,
    parceiro: 30,
    amigo: 20,
  },
  advertisePhone: "(11) 99999-9999",
};

export class ArenaDatabase {
  readonly db: Database.Database;

  constructor(dbPath = DB_PATH) {
    ensureDirs();
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
    this.seed();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        short_name TEXT NOT NULL,
        logo TEXT,
        primary_color TEXT NOT NULL,
        secondary_color TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        name TEXT NOT NULL,
        nickname TEXT NOT NULL,
        shirt_number INTEGER NOT NULL,
        photo TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        home_team_id TEXT NOT NULL,
        away_team_id TEXT NOT NULL,
        home_score INTEGER NOT NULL DEFAULT 0,
        away_score INTEGER NOT NULL DEFAULT 0,
        mode TEXT NOT NULL,
        duration INTEGER NOT NULL,
        first_half_duration INTEGER NOT NULL,
        second_half_duration INTEGER NOT NULL,
        half_time_duration INTEGER NOT NULL,
        current_period INTEGER NOT NULL DEFAULT 1,
        accumulated_ms INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER,
        status TEXT NOT NULL,
        mvp_player_id TEXT,
        start_time INTEGER,
        end_time INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        sport TEXT NOT NULL DEFAULT 'FOOTBALL',
        sport_state TEXT
      );

      CREATE TABLE IF NOT EXISTS match_events (
        id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL,
        type TEXT NOT NULL,
        team_id TEXT,
        player_id TEXT,
        timestamp INTEGER NOT NULL,
        match_time INTEGER NOT NULL,
        metadata TEXT,
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS effects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        duration INTEGER NOT NULL,
        animation TEXT NOT NULL,
        sound TEXT,
        primary_color TEXT,
        secondary_color TEXT,
        text TEXT,
        use_team_colors INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        sport TEXT NOT NULL DEFAULT 'ALL'
      );

      CREATE TABLE IF NOT EXISTS sponsors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        media_url TEXT,
        media_type TEXT NOT NULL DEFAULT 'image',
        tier TEXT NOT NULL DEFAULT 'standard',
        slots TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pelada_bookings (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        pin TEXT NOT NULL DEFAULT '',
        scheduled_at INTEGER NOT NULL,
        duration_minutes INTEGER NOT NULL,
        sport TEXT NOT NULL,
        status TEXT NOT NULL,
        session_started_at INTEGER,
        session_ends_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    this.ensureColumn("matches", "sport", "TEXT NOT NULL DEFAULT 'FOOTBALL'");
    this.ensureColumn("matches", "sport_state", "TEXT");
    this.ensureColumn("effects", "sport", "TEXT NOT NULL DEFAULT 'ALL'");
    this.ensureColumn("pelada_bookings", "pin", "TEXT");
    this.backfillPeladaPins();
  }

  /** Ensure every booking has a unique random PIN (legacy rows). */
  private backfillPeladaPins(): void {
    const rows = this.db
      .prepare(
        `SELECT id FROM pelada_bookings
         WHERE pin IS NULL OR pin = '' OR TRIM(pin) = ''`
      )
      .all() as Array<{ id: string }>;
    if (!rows.length) return;
    const update = this.db.prepare(
      "UPDATE pelada_bookings SET pin = ?, updated_at = ? WHERE id = ?"
    );
    const tx = this.db.transaction(() => {
      for (const row of rows) {
        update.run(this.allocatePeladaPin(), Date.now(), row.id);
      }
    });
    tx();
  }

  /** Random PIN not used by another scheduled/active booking. */
  allocatePeladaPin(exceptId?: string): string {
    for (let attempt = 0; attempt < 40; attempt++) {
      const pin = generatePeladaPin();
      const clash = this.db
        .prepare(
          `SELECT id FROM pelada_bookings
           WHERE pin = ? AND status IN ('scheduled', 'active')
             AND (? IS NULL OR id != ?)
           LIMIT 1`
        )
        .get(pin, exceptId ?? null, exceptId ?? null) as { id: string } | undefined;
      if (!clash) return pin;
    }
    // Extremely unlikely fallback
    return `${generatePeladaPin()}${Math.floor(Math.random() * 10)}`;
  }

  findOpenPeladaByPin(pin: string): PeladaBooking | null {
    const normalized = String(pin ?? "").trim();
    if (!normalized) return null;
    const row = this.db
      .prepare(
        `SELECT * FROM pelada_bookings
         WHERE pin = ? AND status IN ('scheduled', 'active')
         ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, scheduled_at ASC
         LIMIT 1`
      )
      .get(normalized) as Record<string, unknown> | undefined;
    return row ? mapPeladaBooking(row) : null;
  }

  /** Additive, safe migration for existing DBs created before a column existed. */
  private ensureColumn(table: string, column: string, definition: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  private seed(): void {
    const settingsCount = this.db.prepare("SELECT COUNT(*) as c FROM settings").get() as { c: number };
    if (settingsCount.c === 0) {
      this.saveSettings(DEFAULT_SETTINGS);
    }

    const effectsCount = this.db.prepare("SELECT COUNT(*) as c FROM effects").get() as { c: number };
    if (effectsCount.c === 0) {
      this.insertEffects(DEFAULT_EFFECTS);
    } else {
      this.ensureMissingEffects();
    }
  }

  private insertEffects(effects: Omit<Effect, "id">[]): void {
    const insert = this.db.prepare(`
      INSERT INTO effects (id, name, type, duration, animation, sound, primary_color, secondary_color, text, use_team_colors, enabled, sport)
      VALUES (@id, @name, @type, @duration, @animation, @sound, @primaryColor, @secondaryColor, @text, @useTeamColors, @enabled, @sport)
    `);
    for (const effect of effects) {
      insert.run({
        id: uuid(),
        name: effect.name,
        type: effect.type,
        duration: effect.duration,
        animation: effect.animation,
        sound: effect.sound,
        primaryColor: effect.primaryColor,
        secondaryColor: effect.secondaryColor,
        text: effect.text,
        useTeamColors: effect.useTeamColors ? 1 : 0,
        enabled: effect.enabled ? 1 : 0,
        sport: effect.sport,
      });
    }
  }

  /** Additive seed for new effect types (e.g. volleyball) without wiping user edits. */
  private ensureMissingEffects(): void {
    const existing = new Set(
      (this.db.prepare("SELECT type FROM effects").all() as Array<{ type: string }>).map((r) => r.type)
    );
    const missing = DEFAULT_EFFECTS.filter((e) => !existing.has(e.type));
    if (missing.length) this.insertEffects(missing);
  }

  getSettings(): Settings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
    const map = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value) as unknown]));
    const merged = { ...DEFAULT_SETTINGS, ...(map as Partial<Settings>) };
    merged.sponsorTierSeconds = normalizeSponsorTierSeconds(
      (map as Partial<Settings>).sponsorTierSeconds ?? DEFAULT_SETTINGS.sponsorTierSeconds
    );
    // Always inject from env — never persist advertisePhone from clients
    merged.advertisePhone = getAdvertisePhone();
    return merged;
  }

  saveSettings(settings: Settings): void {
    const upsert = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );
    const tx = this.db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        if (key === "advertisePhone") continue;
        upsert.run(key, JSON.stringify(value));
      }
    });
    tx();
  }

  listPeladaBookings(): PeladaBooking[] {
    const rows = this.db
      .prepare("SELECT * FROM pelada_bookings ORDER BY scheduled_at DESC")
      .all() as Array<Record<string, unknown>>;
    return rows.map(mapPeladaBooking);
  }

  getPeladaBooking(id: string): PeladaBooking | null {
    const row = this.db.prepare("SELECT * FROM pelada_bookings WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapPeladaBooking(row) : null;
  }

  getActivePeladaBooking(): PeladaBooking | null {
    const row = this.db
      .prepare("SELECT * FROM pelada_bookings WHERE status = 'active' ORDER BY session_started_at DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;
    return row ? mapPeladaBooking(row) : null;
  }

  createPeladaBooking(input: {
    name: string;
    phone: string;
    scheduledAt: number;
    durationMinutes: number;
    sport: Sport;
  }): PeladaBooking {
    const now = Date.now();
    const booking: PeladaBooking = {
      id: uuid(),
      name: input.name,
      phone: input.phone,
      pin: this.allocatePeladaPin(),
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      sport: resolveSport(input.sport),
      status: "scheduled",
      sessionStartedAt: null,
      sessionEndsAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO pelada_bookings
         (id, name, phone, pin, scheduled_at, duration_minutes, sport, status,
          session_started_at, session_ends_at, created_at, updated_at)
         VALUES (@id, @name, @phone, @pin, @scheduledAt, @durationMinutes, @sport, @status,
          @sessionStartedAt, @sessionEndsAt, @createdAt, @updatedAt)`
      )
      .run(booking);
    return booking;
  }

  updatePeladaBooking(
    id: string,
    patch: Partial<
      Pick<
        PeladaBooking,
        | "name"
        | "phone"
        | "scheduledAt"
        | "durationMinutes"
        | "sport"
        | "status"
        | "sessionStartedAt"
        | "sessionEndsAt"
      >
    >
  ): PeladaBooking | null {
    const existing = this.getPeladaBooking(id);
    if (!existing) return null;
    const updated: PeladaBooking = {
      ...existing,
      ...patch,
      sport: patch.sport != null ? resolveSport(patch.sport) : existing.sport,
      id,
      updatedAt: Date.now(),
    };
    this.db
      .prepare(
        `UPDATE pelada_bookings SET
          name=@name, phone=@phone, scheduled_at=@scheduledAt, duration_minutes=@durationMinutes,
          sport=@sport, status=@status, session_started_at=@sessionStartedAt,
          session_ends_at=@sessionEndsAt, updated_at=@updatedAt
         WHERE id=@id`
      )
      .run(updated);
    return updated;
  }

  deletePeladaBooking(id: string): boolean {
    const result = this.db.prepare("DELETE FROM pelada_bookings WHERE id = ?").run(id);
    return result.changes > 0;
  }

  listTeams(): Team[] {
    const rows = this.db
      .prepare("SELECT * FROM teams ORDER BY name COLLATE NOCASE")
      .all() as Array<Record<string, unknown>>;
    return rows.map(mapTeam);
  }

  getTeam(id: string): Team | null {
    const row = this.db.prepare("SELECT * FROM teams WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapTeam(row) : null;
  }

  createTeam(input: Omit<Team, "id" | "createdAt" | "updatedAt">): Team {
    const now = Date.now();
    const team: Team = { ...input, id: uuid(), createdAt: now, updatedAt: now };
    this.db
      .prepare(
        `INSERT INTO teams (id, name, short_name, logo, primary_color, secondary_color, created_at, updated_at)
         VALUES (@id, @name, @shortName, @logo, @primaryColor, @secondaryColor, @createdAt, @updatedAt)`
      )
      .run(team);
    return team;
  }

  updateTeam(id: string, patch: Partial<Omit<Team, "id" | "createdAt">>): Team | null {
    const existing = this.getTeam(id);
    if (!existing) return null;
    const updated: Team = { ...existing, ...patch, id, updatedAt: Date.now() };
    this.db
      .prepare(
        `UPDATE teams SET name=@name, short_name=@shortName, logo=@logo, primary_color=@primaryColor,
         secondary_color=@secondaryColor, updated_at=@updatedAt WHERE id=@id`
      )
      .run(updated);
    return updated;
  }

  deleteTeam(id: string): boolean {
    const result = this.db.prepare("DELETE FROM teams WHERE id = ?").run(id);
    return result.changes > 0;
  }

  listPlayers(teamId?: string): Player[] {
    const rows = teamId
      ? (this.db
          .prepare("SELECT * FROM players WHERE team_id = ? ORDER BY shirt_number")
          .all(teamId) as Array<Record<string, unknown>>)
      : (this.db
          .prepare("SELECT * FROM players ORDER BY shirt_number")
          .all() as Array<Record<string, unknown>>);
    return rows.map(mapPlayer);
  }

  getPlayer(id: string): Player | null {
    const row = this.db.prepare("SELECT * FROM players WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapPlayer(row) : null;
  }

  createPlayer(input: Omit<Player, "id" | "createdAt" | "updatedAt">): Player {
    const now = Date.now();
    const player: Player = { ...input, id: uuid(), createdAt: now, updatedAt: now };
    this.db
      .prepare(
        `INSERT INTO players (id, team_id, name, nickname, shirt_number, photo, active, created_at, updated_at)
         VALUES (@id, @teamId, @name, @nickname, @shirtNumber, @photo, @active, @createdAt, @updatedAt)`
      )
      .run({ ...player, active: player.active ? 1 : 0 });
    return player;
  }

  updatePlayer(id: string, patch: Partial<Omit<Player, "id" | "createdAt">>): Player | null {
    const existing = this.getPlayer(id);
    if (!existing) return null;
    const updated: Player = { ...existing, ...patch, id, updatedAt: Date.now() };
    this.db
      .prepare(
        `UPDATE players SET team_id=@teamId, name=@name, nickname=@nickname, shirt_number=@shirtNumber,
         photo=@photo, active=@active, updated_at=@updatedAt WHERE id=@id`
      )
      .run({ ...updated, active: updated.active ? 1 : 0 });
    return updated;
  }

  deletePlayer(id: string): boolean {
    const result = this.db.prepare("DELETE FROM players WHERE id = ?").run(id);
    return result.changes > 0;
  }

  listSponsors(): Sponsor[] {
    const rows = this.db
      .prepare("SELECT * FROM sponsors ORDER BY name COLLATE NOCASE")
      .all() as Array<Record<string, unknown>>;
    return rows.map(mapSponsor);
  }

  getSponsor(id: string): Sponsor | null {
    const row = this.db.prepare("SELECT * FROM sponsors WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapSponsor(row) : null;
  }

  createSponsor(
    input: Omit<Sponsor, "id" | "createdAt" | "updatedAt">
  ): Sponsor {
    const now = Date.now();
    const sponsor: Sponsor = {
      ...input,
      tier: normalizeSponsorTier(input.tier),
      slots: normalizeSponsorSlots(input.slots),
      id: uuid(),
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO sponsors (id, name, media_url, media_type, tier, slots, enabled, created_at, updated_at)
         VALUES (@id, @name, @mediaUrl, @mediaType, @tier, @slots, @enabled, @createdAt, @updatedAt)`
      )
      .run({
        ...sponsor,
        slots: JSON.stringify(sponsor.slots),
        enabled: sponsor.enabled ? 1 : 0,
      });
    return sponsor;
  }

  updateSponsor(id: string, patch: Partial<Omit<Sponsor, "id" | "createdAt">>): Sponsor | null {
    const existing = this.getSponsor(id);
    if (!existing) return null;
    const updated: Sponsor = {
      ...existing,
      ...patch,
      tier: normalizeSponsorTier(patch.tier ?? existing.tier),
      slots: normalizeSponsorSlots(patch.slots ?? existing.slots),
      id,
      updatedAt: Date.now(),
    };
    this.db
      .prepare(
        `UPDATE sponsors SET name=@name, media_url=@mediaUrl, media_type=@mediaType, tier=@tier,
         slots=@slots, enabled=@enabled, updated_at=@updatedAt WHERE id=@id`
      )
      .run({
        ...updated,
        slots: JSON.stringify(updated.slots),
        enabled: updated.enabled ? 1 : 0,
      });
    return updated;
  }

  deleteSponsor(id: string): boolean {
    const result = this.db.prepare("DELETE FROM sponsors WHERE id = ?").run(id);
    return result.changes > 0;
  }

  listMatches(): Match[] {
    const rows = this.db
      .prepare("SELECT * FROM matches ORDER BY created_at DESC")
      .all() as Array<Record<string, unknown>>;
    return rows.map(mapMatch);
  }

  getMatch(id: string): Match | null {
    const row = this.db.prepare("SELECT * FROM matches WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapMatch(row) : null;
  }

  getActiveMatch(): Match | null {
    const row = this.db
      .prepare(
        `SELECT * FROM matches
         WHERE status != 'finished'
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get() as Record<string, unknown> | undefined;
    return row ? mapMatch(row) : null;
  }

  createMatch(input: Omit<Match, "id" | "createdAt" | "updatedAt">): Match {
    const now = Date.now();
    const match: Match = {
      ...input,
      sport: resolveSport(input.sport),
      sportState: input.sportState ?? null,
      id: uuid(),
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO matches (
          id, sport, sport_state, home_team_id, away_team_id, home_score, away_score, mode, duration,
          first_half_duration, second_half_duration, half_time_duration, current_period,
          accumulated_ms, started_at, status, mvp_player_id, start_time, end_time, created_at, updated_at
        ) VALUES (
          @id, @sport, @sportState, @homeTeamId, @awayTeamId, @homeScore, @awayScore, @mode, @duration,
          @firstHalfDuration, @secondHalfDuration, @halfTimeDuration, @currentPeriod,
          @accumulatedMs, @startedAt, @status, @mvpPlayerId, @startTime, @endTime, @createdAt, @updatedAt
        )`
      )
      .run({
        ...match,
        sportState: serializeSportState(match.sportState),
      });
    return match;
  }

  updateMatch(id: string, patch: Partial<Omit<Match, "id" | "createdAt">>): Match | null {
    const existing = this.getMatch(id);
    if (!existing) return null;
    const updated: Match = {
      ...existing,
      ...patch,
      sport: resolveSport(patch.sport ?? existing.sport),
      sportState:
        patch.sportState !== undefined ? patch.sportState : existing.sportState,
      id,
      updatedAt: Date.now(),
    };
    this.db
      .prepare(
        `UPDATE matches SET
          sport=@sport,
          sport_state=@sportState,
          home_team_id=@homeTeamId, away_team_id=@awayTeamId, home_score=@homeScore, away_score=@awayScore,
          mode=@mode, duration=@duration, first_half_duration=@firstHalfDuration,
          second_half_duration=@secondHalfDuration, half_time_duration=@halfTimeDuration,
          current_period=@currentPeriod, accumulated_ms=@accumulatedMs, started_at=@startedAt,
          status=@status, mvp_player_id=@mvpPlayerId, start_time=@startTime, end_time=@endTime,
          updated_at=@updatedAt
         WHERE id=@id`
      )
      .run({
        ...updated,
        sportState: serializeSportState(updated.sportState),
      });
    return updated;
  }

  listEvents(matchId: string): MatchEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM match_events WHERE match_id = ? ORDER BY timestamp ASC")
      .all(matchId) as Array<Record<string, unknown>>;
    return rows.map(mapEvent);
  }

  addEvent(input: Omit<MatchEvent, "id">): MatchEvent {
    const event: MatchEvent = { ...input, id: uuid() };
    this.db
      .prepare(
        `INSERT INTO match_events (id, match_id, type, team_id, player_id, timestamp, match_time, metadata)
         VALUES (@id, @matchId, @type, @teamId, @playerId, @timestamp, @matchTime, @metadata)`
      )
      .run({
        ...event,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      });
    return event;
  }

  listEffects(): Effect[] {
    const rows = this.db.prepare("SELECT * FROM effects ORDER BY name").all() as Array<Record<string, unknown>>;
    return rows.map(mapEffect);
  }

  getEffectByType(type: string): Effect | null {
    const row = this.db.prepare("SELECT * FROM effects WHERE type = ? LIMIT 1").get(type) as
      | Record<string, unknown>
      | undefined;
    return row ? mapEffect(row) : null;
  }

  updateEffect(id: string, patch: Partial<Omit<Effect, "id">>): Effect | null {
    const existing = this.listEffects().find((e) => e.id === id);
    if (!existing) return null;
    const updated: Effect = {
      ...existing,
      ...patch,
      sport: resolveEffectSport(patch.sport ?? existing.sport),
      id,
    };
    this.db
      .prepare(
        `UPDATE effects SET name=@name, type=@type, duration=@duration, animation=@animation, sound=@sound,
         primary_color=@primaryColor, secondary_color=@secondaryColor, text=@text,
         use_team_colors=@useTeamColors, enabled=@enabled, sport=@sport WHERE id=@id`
      )
      .run({
        ...updated,
        useTeamColors: updated.useTeamColors ? 1 : 0,
        enabled: updated.enabled ? 1 : 0,
      });
    return updated;
  }

  exportBackup(): Record<string, unknown> {
    return {
      version: 5,
      exportedAt: Date.now(),
      settings: this.getSettings(),
      teams: this.listTeams(),
      players: this.listPlayers(),
      sponsors: this.listSponsors(),
      matches: this.listMatches(),
      events: this.listMatches().flatMap((m) => this.listEvents(m.id)),
      effects: this.listEffects(),
    };
  }

  importBackup(data: {
    settings?: Settings;
    teams?: Team[];
    players?: Player[];
    sponsors?: Sponsor[];
    /** Legacy backups may omit `sport` / `sportState`. */
    matches?: Array<
      Omit<Match, "sport" | "sportState"> & {
        sport?: Sport;
        sportState?: MatchSportState | null;
      }
    >;
    events?: MatchEvent[];
    effects?: Effect[];
  }): void {
    const tx = this.db.transaction(() => {
      this.db.exec(
        "DELETE FROM match_events; DELETE FROM matches; DELETE FROM players; DELETE FROM teams; DELETE FROM sponsors; DELETE FROM effects; DELETE FROM settings;"
      );
      if (data.settings) this.saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      else this.saveSettings(DEFAULT_SETTINGS);

      for (const team of data.teams ?? []) {
        this.db
          .prepare(
            `INSERT INTO teams (id, name, short_name, logo, primary_color, secondary_color, created_at, updated_at)
             VALUES (@id, @name, @shortName, @logo, @primaryColor, @secondaryColor, @createdAt, @updatedAt)`
          )
          .run(team);
      }
      for (const player of data.players ?? []) {
        this.db
          .prepare(
            `INSERT INTO players (id, team_id, name, nickname, shirt_number, photo, active, created_at, updated_at)
             VALUES (@id, @teamId, @name, @nickname, @shirtNumber, @photo, @active, @createdAt, @updatedAt)`
          )
          .run({ ...player, active: player.active ? 1 : 0 });
      }
      for (const sponsor of data.sponsors ?? []) {
        this.db
          .prepare(
            `INSERT INTO sponsors (id, name, media_url, media_type, tier, slots, enabled, created_at, updated_at)
             VALUES (@id, @name, @mediaUrl, @mediaType, @tier, @slots, @enabled, @createdAt, @updatedAt)`
          )
          .run({
            ...sponsor,
            slots: JSON.stringify(normalizeSponsorSlots(sponsor.slots)),
            enabled: sponsor.enabled ? 1 : 0,
          });
      }
      for (const raw of data.matches ?? []) {
        const sport = resolveSport(raw.sport);
        const sportState = parseSportState(raw.sportState ?? null, sport);
        this.db
          .prepare(
            `INSERT INTO matches (
              id, sport, sport_state, home_team_id, away_team_id, home_score, away_score, mode, duration,
              first_half_duration, second_half_duration, half_time_duration, current_period,
              accumulated_ms, started_at, status, mvp_player_id, start_time, end_time, created_at, updated_at
            ) VALUES (
              @id, @sport, @sportState, @homeTeamId, @awayTeamId, @homeScore, @awayScore, @mode, @duration,
              @firstHalfDuration, @secondHalfDuration, @halfTimeDuration, @currentPeriod,
              @accumulatedMs, @startedAt, @status, @mvpPlayerId, @startTime, @endTime, @createdAt, @updatedAt
            )`
          )
          .run({
            ...raw,
            sport,
            sportState: serializeSportState(sportState),
          });
      }
      for (const event of data.events ?? []) {
        this.db
          .prepare(
            `INSERT INTO match_events (id, match_id, type, team_id, player_id, timestamp, match_time, metadata)
             VALUES (@id, @matchId, @type, @teamId, @playerId, @timestamp, @matchTime, @metadata)`
          )
          .run({ ...event, metadata: event.metadata ? JSON.stringify(event.metadata) : null });
      }
      for (const effect of data.effects ?? []) {
        this.db
          .prepare(
            `INSERT INTO effects (id, name, type, duration, animation, sound, primary_color, secondary_color, text, use_team_colors, enabled, sport)
             VALUES (@id, @name, @type, @duration, @animation, @sound, @primaryColor, @secondaryColor, @text, @useTeamColors, @enabled, @sport)`
          )
          .run({
            ...effect,
            sport: resolveEffectSport(effect.sport),
            useTeamColors: effect.useTeamColors ? 1 : 0,
            enabled: effect.enabled ? 1 : 0,
          });
      }
      if (!data.effects?.length) {
        this.seed();
      } else {
        this.ensureMissingEffects();
      }
    });
    tx();
  }

  close(): void {
    this.db.close();
  }
}

function mapTeam(row: Record<string, unknown>): Team {
  return {
    id: String(row.id),
    name: String(row.name),
    shortName: String(row.short_name),
    logo: (row.logo as string | null) ?? null,
    primaryColor: String(row.primary_color),
    secondaryColor: String(row.secondary_color),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapPlayer(row: Record<string, unknown>): Player {
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    name: String(row.name),
    nickname: String(row.nickname),
    shirtNumber: Number(row.shirt_number),
    photo: (row.photo as string | null) ?? null,
    active: Boolean(row.active),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapSponsor(row: Record<string, unknown>): Sponsor {
  let slotsRaw: unknown = [];
  try {
    slotsRaw = row.slots ? JSON.parse(String(row.slots)) : [];
  } catch {
    slotsRaw = [];
  }
  const mediaType: SponsorMediaType = row.media_type === "video" ? "video" : "image";
  return {
    id: String(row.id),
    name: String(row.name),
    mediaUrl: (row.media_url as string | null) ?? null,
    mediaType,
    tier: normalizeSponsorTier(row.tier),
    slots: normalizeSponsorSlots(slotsRaw),
    enabled: Boolean(row.enabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapMatch(row: Record<string, unknown>): Match {
  const sport = resolveSport(row.sport);
  return {
    id: String(row.id),
    sport,
    homeTeamId: String(row.home_team_id),
    awayTeamId: String(row.away_team_id),
    homeScore: Number(row.home_score),
    awayScore: Number(row.away_score),
    mode: row.mode as Match["mode"],
    duration: Number(row.duration),
    firstHalfDuration: Number(row.first_half_duration),
    secondHalfDuration: Number(row.second_half_duration),
    halfTimeDuration: Number(row.half_time_duration),
    currentPeriod: Number(row.current_period) as 1 | 2,
    accumulatedMs: Number(row.accumulated_ms),
    startedAt: row.started_at == null ? null : Number(row.started_at),
    status: row.status as Match["status"],
    mvpPlayerId: (row.mvp_player_id as string | null) ?? null,
    startTime: row.start_time == null ? null : Number(row.start_time),
    endTime: row.end_time == null ? null : Number(row.end_time),
    sportState: parseSportState(row.sport_state, sport),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapEvent(row: Record<string, unknown>): MatchEvent {
  return {
    id: String(row.id),
    matchId: String(row.match_id),
    type: row.type as MatchEvent["type"],
    teamId: (row.team_id as string | null) ?? null,
    playerId: (row.player_id as string | null) ?? null,
    timestamp: Number(row.timestamp),
    matchTime: Number(row.match_time),
    metadata: row.metadata ? (JSON.parse(String(row.metadata)) as Record<string, unknown>) : null,
  };
}

function mapEffect(row: Record<string, unknown>): Effect {
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as Effect["type"],
    duration: Number(row.duration),
    animation: String(row.animation),
    sound: (row.sound as string | null) ?? null,
    primaryColor: (row.primary_color as string | null) ?? null,
    secondaryColor: (row.secondary_color as string | null) ?? null,
    text: (row.text as string | null) ?? null,
    useTeamColors: Boolean(row.use_team_colors),
    enabled: Boolean(row.enabled),
    sport: resolveEffectSport(row.sport),
  };
}

function mapPeladaBooking(row: Record<string, unknown>): PeladaBooking {
  const status = String(row.status) as PeladaBookingStatus;
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone),
    pin: String(row.pin ?? ""),
    scheduledAt: Number(row.scheduled_at),
    durationMinutes: Number(row.duration_minutes),
    sport: resolveSport(row.sport),
    status:
      status === "active" || status === "finished" || status === "cancelled" ? status : "scheduled",
    sessionStartedAt: row.session_started_at == null ? null : Number(row.session_started_at),
    sessionEndsAt: row.session_ends_at == null ? null : Number(row.session_ends_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}
