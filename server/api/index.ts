import express, { type Express, type Request, type Response } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuid } from "uuid";
import type { ArenaDatabase } from "../db/database.ts";
import { UPLOADS_DIR } from "../db/database.ts";
import type { MatchEngine } from "../domain/MatchEngine.ts";
import { eventBus } from "../domain/EventBus.ts";
import type {
  Settings,
  Team,
  Player,
  Effect,
  Sponsor,
  SponsorMediaType,
  Sport,
  PeladaBooking,
} from "../../shared/types/index.ts";
import { resolveSport } from "../../shared/types/index.ts";
import {
  normalizeSponsorSlots,
  normalizeSponsorTier,
  tierVacancyError,
} from "../../shared/sponsors/playlist.ts";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".bin";
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const mediaUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

function detectMediaType(filename: string, mimetype?: string): SponsorMediaType {
  const lower = `${filename} ${mimetype ?? ""}`.toLowerCase();
  if (/\.(mp4|webm|mov|m4v)(\?|$)/.test(lower) || lower.includes("video/")) return "video";
  return "image";
}

export function createApiRouter(db: ArenaDatabase, engine: MatchEngine): Express {
  const api = express();
  api.use(express.json({ limit: "10mb" }));

  api.get("/health", (_req, res) => {
    res.json({ ok: true, time: Date.now() });
  });

  api.get("/network", (_req, res) => {
    res.json(engine.getNetwork());
  });

  api.get("/state", (_req, res) => {
    res.json(engine.getState());
  });

  api.get("/settings", (_req, res) => {
    res.json(db.getSettings());
  });

  api.put("/settings", (req, res) => {
    const updated = engine.updateSettings(req.body as Partial<Settings>);
    res.json(updated);
  });

  api.get("/teams", (_req, res) => {
    res.json(db.listTeams());
  });

  api.post("/teams", (req, res) => {
    const body = req.body as Partial<Team>;
    if (!body.name || !body.shortName || !body.primaryColor || !body.secondaryColor) {
      res.status(400).json({ error: "Campos obrigatórios ausentes" });
      return;
    }
    const team = db.createTeam({
      name: body.name,
      shortName: body.shortName,
      logo: body.logo ?? null,
      primaryColor: body.primaryColor,
      secondaryColor: body.secondaryColor,
    });
    eventBus.emit("STATE_CHANGED", null);
    res.status(201).json(team);
  });

  api.put("/teams/:id", (req, res) => {
    const team = db.updateTeam(req.params.id, req.body as Partial<Team>);
    if (!team) {
      res.status(404).json({ error: "Time não encontrado" });
      return;
    }
    eventBus.emit("STATE_CHANGED", null);
    res.json(team);
  });

  api.delete("/teams/:id", (req, res) => {
    const ok = db.deleteTeam(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Time não encontrado" });
      return;
    }
    eventBus.emit("STATE_CHANGED", null);
    res.json({ ok: true });
  });

  api.post("/teams/:id/logo", upload.single("logo"), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Arquivo ausente" });
      return;
    }
    const logo = `/uploads/${req.file.filename}`;
    const team = db.updateTeam(req.params.id, { logo });
    if (!team) {
      res.status(404).json({ error: "Time não encontrado" });
      return;
    }
    eventBus.emit("STATE_CHANGED", null);
    res.json(team);
  });

  api.get("/players", (req, res) => {
    const teamId = typeof req.query.teamId === "string" ? req.query.teamId : undefined;
    res.json(db.listPlayers(teamId));
  });

  api.post("/players", (req, res) => {
    const body = req.body as Partial<Player>;
    if (!body.teamId || !body.name || body.shirtNumber == null) {
      res.status(400).json({ error: "Campos obrigatórios ausentes" });
      return;
    }
    const player = db.createPlayer({
      teamId: body.teamId,
      name: body.name,
      nickname: body.nickname ?? body.name,
      shirtNumber: Number(body.shirtNumber),
      photo: body.photo ?? null,
      active: body.active ?? true,
    });
    eventBus.emit("STATE_CHANGED", null);
    res.status(201).json(player);
  });

  api.put("/players/:id", (req, res) => {
    const player = db.updatePlayer(req.params.id, req.body as Partial<Player>);
    if (!player) {
      res.status(404).json({ error: "Jogador não encontrado" });
      return;
    }
    eventBus.emit("STATE_CHANGED", null);
    res.json(player);
  });

  api.delete("/players/:id", (req, res) => {
    const ok = db.deletePlayer(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Jogador não encontrado" });
      return;
    }
    eventBus.emit("STATE_CHANGED", null);
    res.json({ ok: true });
  });

  api.post("/players/:id/photo", upload.single("photo"), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Arquivo ausente" });
      return;
    }
    const photo = `/uploads/${req.file.filename}`;
    const player = db.updatePlayer(req.params.id, { photo });
    if (!player) {
      res.status(404).json({ error: "Jogador não encontrado" });
      return;
    }
    eventBus.emit("STATE_CHANGED", null);
    res.json(player);
  });

  api.get("/sponsors", (_req, res) => {
    res.json(db.listSponsors());
  });

  api.post("/sponsors", (req, res) => {
    const body = req.body as Partial<Sponsor>;
    if (!body.name) {
      res.status(400).json({ error: "Nome obrigatório" });
      return;
    }
    const tier = normalizeSponsorTier(body.tier);
    const enabled = body.enabled ?? true;
    if (enabled) {
      const vacancy = tierVacancyError(db.listSponsors(), tier);
      if (vacancy) {
        res.status(400).json({ error: vacancy });
        return;
      }
    }
    const sponsor = db.createSponsor({
      name: body.name,
      mediaUrl: body.mediaUrl ?? null,
      mediaType: body.mediaType === "video" ? "video" : "image",
      tier,
      slots: normalizeSponsorSlots(body.slots),
      enabled,
    });
    eventBus.emit("STATE_CHANGED", null);
    engine.refreshIdleSponsors();
    res.status(201).json(sponsor);
  });

  api.put("/sponsors/:id", (req, res) => {
    const body = req.body as Partial<Sponsor>;
    const existing = db.getSponsor(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Patrocinador não encontrado" });
      return;
    }
    const patch: Partial<Sponsor> = { ...body };
    if (body.slots !== undefined) patch.slots = normalizeSponsorSlots(body.slots);
    if (body.tier !== undefined) patch.tier = normalizeSponsorTier(body.tier);
    if (body.mediaType !== undefined) {
      patch.mediaType = body.mediaType === "video" ? "video" : "image";
    }
    const nextTier = normalizeSponsorTier(patch.tier ?? existing.tier);
    const nextEnabled = patch.enabled ?? existing.enabled;
    if (nextEnabled) {
      const vacancy = tierVacancyError(db.listSponsors(), nextTier, existing.id);
      if (vacancy) {
        res.status(400).json({ error: vacancy });
        return;
      }
    }
    const sponsor = db.updateSponsor(req.params.id, patch);
    if (!sponsor) {
      res.status(404).json({ error: "Patrocinador não encontrado" });
      return;
    }
    eventBus.emit("STATE_CHANGED", null);
    engine.refreshIdleSponsors();
    res.json(sponsor);
  });

  api.delete("/sponsors/:id", (req, res) => {
    const ok = db.deleteSponsor(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Patrocinador não encontrado" });
      return;
    }
    eventBus.emit("STATE_CHANGED", null);
    engine.refreshIdleSponsors();
    res.json({ ok: true });
  });

  api.post("/sponsors/:id/media", mediaUpload.single("media"), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Arquivo ausente" });
      return;
    }
    const mediaUrl = `/uploads/${req.file.filename}`;
    const mediaType = detectMediaType(req.file.filename, req.file.mimetype);
    const sponsor = db.updateSponsor(req.params.id, { mediaUrl, mediaType });
    if (!sponsor) {
      res.status(404).json({ error: "Patrocinador não encontrado" });
      return;
    }
    eventBus.emit("STATE_CHANGED", null);
    engine.refreshIdleSponsors();
    res.json(sponsor);
  });

  api.get("/peladas", (_req, res) => {
    res.json(db.listPeladaBookings());
  });

  api.get("/peladas/:id", (req, res) => {
    const booking = db.getPeladaBooking(req.params.id);
    if (!booking) {
      res.status(404).json({ error: "Pelada não encontrada" });
      return;
    }
    res.json(booking);
  });

  api.post("/peladas", (req, res) => {
    const body = req.body as Partial<PeladaBooking> & { sport?: Sport };
    if (!body.name || !body.phone || body.scheduledAt == null || body.durationMinutes == null) {
      res.status(400).json({ error: "Campos obrigatórios ausentes" });
      return;
    }
    const durationMinutes = Number(body.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      res.status(400).json({ error: "Duração inválida" });
      return;
    }
    const booking = db.createPeladaBooking({
      name: String(body.name).trim(),
      phone: String(body.phone).trim(),
      scheduledAt: Number(body.scheduledAt),
      durationMinutes,
      sport: resolveSport(body.sport),
    });
    res.status(201).json(booking);
  });

  api.put("/peladas/:id", (req, res) => {
    const existing = db.getPeladaBooking(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Pelada não encontrada" });
      return;
    }
    if (existing.status === "active") {
      res.status(400).json({ error: "Não é possível editar uma pelada ativa" });
      return;
    }
    const body = req.body as Partial<PeladaBooking>;
    const booking = db.updatePeladaBooking(req.params.id, {
      name: body.name != null ? String(body.name).trim() : undefined,
      phone: body.phone != null ? String(body.phone).trim() : undefined,
      scheduledAt: body.scheduledAt != null ? Number(body.scheduledAt) : undefined,
      durationMinutes: body.durationMinutes != null ? Number(body.durationMinutes) : undefined,
      sport: body.sport != null ? resolveSport(body.sport) : undefined,
      status: body.status === "cancelled" ? "cancelled" : undefined,
    });
    res.json(booking);
  });

  api.delete("/peladas/:id", (req, res) => {
    const existing = db.getPeladaBooking(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Pelada não encontrada" });
      return;
    }
    if (existing.status === "active") {
      const session = engine.pelada.getSession();
      if (session?.bookingId === existing.id) {
        engine.pelada.stopSession(true);
      }
    }
    const ok = db.deletePeladaBooking(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Pelada não encontrada" });
      return;
    }
    res.json({ ok: true });
  });

  api.get("/matches", (_req, res) => {
    res.json(db.listMatches());
  });

  api.get("/matches/:id/events", (req, res) => {
    res.json(db.listEvents(req.params.id));
  });

  api.get("/effects", (_req, res) => {
    res.json(db.listEffects());
  });

  api.put("/effects/:id", (req, res) => {
    const effect = engine.updateEffect(req.params.id, req.body as Partial<Effect>);
    if (!effect) {
      res.status(404).json({ error: "Efeito não encontrado" });
      return;
    }
    res.json(effect);
  });

  api.post("/effects/:id/test", (req, res) => {
    const effects = db.listEffects();
    const effect = effects.find((e) => e.id === req.params.id);
    if (!effect) {
      res.status(404).json({ error: "Efeito não encontrado" });
      return;
    }
    const payload = engine.triggerEffect(effect.type, req.body ?? {});
    res.json(payload);
  });

  api.get("/backup", (_req, res) => {
    const backup = db.exportBackup();
    res.setHeader("Content-Disposition", `attachment; filename="arena-backup-${Date.now()}.json"`);
    res.json(backup);
  });

  api.post("/backup/import", (req, res) => {
    try {
      db.importBackup(req.body);
      eventBus.emit("STATE_CHANGED", null);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Import falhou" });
    }
  });

  api.post("/upload", upload.single("file"), (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "Arquivo ausente" });
      return;
    }
    res.json({ url: `/uploads/${req.file.filename}` });
  });

  // ensure uploads dir exists for static serve
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  return api;
}
