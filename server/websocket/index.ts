import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import type { Server } from "node:http";
import type { ClientCommand, ServerMessage } from "../../shared/events/index.ts";
import { isClientCommand } from "../../shared/events/index.ts";
import type { ClientRole } from "../../shared/types/index.ts";
import { eventBus } from "../domain/EventBus.ts";
import type { MatchEngine } from "../domain/MatchEngine.ts";

interface ConnectedClient {
  id: string;
  role: ClientRole;
  ws: WebSocket;
  authenticated: boolean;
}

export function setupWebSocket(server: Server, engine: MatchEngine): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Map<WebSocket, ConnectedClient>();

  const broadcast = (message: ServerMessage, filter?: (c: ConnectedClient) => boolean) => {
    const raw = JSON.stringify(message);
    for (const client of clients.values()) {
      if (filter && !filter(client)) continue;
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(raw);
      }
    }
  };

  const send = (ws: WebSocket, message: ServerMessage) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  const syncAll = () => {
    broadcast({ type: "STATE_SYNC", payload: engine.getState(), ts: Date.now() });
  };

  eventBus.on("STATE_CHANGED", () => syncAll());
  eventBus.on("EFFECT_TRIGGER", (payload) => {
    broadcast({ type: "EFFECT_TRIGGER", payload, ts: Date.now() });
    syncAll();
  });
  eventBus.on("EFFECT_CANCEL", () => {
    broadcast({ type: "EFFECT_CANCEL", payload: {}, ts: Date.now() });
  });

  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(String(data)) as unknown;
        if (!isClientCommand(parsed)) {
          send(ws, { type: "ERROR", payload: { code: "INVALID", message: "Comando inválido" }, ts: Date.now() });
          return;
        }
        handleCommand(ws, parsed, clients, engine, send, syncAll);
      } catch (err) {
        console.error("[WS] message error:", err);
        send(ws, {
          type: "ERROR",
          payload: { code: "SERVER", message: err instanceof Error ? err.message : "Erro interno" },
          ts: Date.now(),
        });
      }
    });

    ws.on("close", () => {
      const client = clients.get(ws);
      if (!client) return;
      clients.delete(ws);
      // Evita race do StrictMode/reconnect: só remove se não houver outro socket com o mesmo id
      const stillConnected = Array.from(clients.values()).some((c) => c.id === client.id);
      if (stillConnected) return;
      engine.unregisterClient(client.id);
      broadcast({
        type: "CLIENT_DISCONNECTED",
        payload: { id: client.id, role: client.role },
        ts: Date.now(),
      });
      syncAll();
    });
  });

  return wss;
}

function handleCommand(
  ws: WebSocket,
  cmd: ClientCommand,
  clients: Map<WebSocket, ConnectedClient>,
  engine: MatchEngine,
  send: (ws: WebSocket, message: ServerMessage) => void,
  syncAll: () => void
): void {
  if (cmd.type === "HELLO") {
    const { role, pin, clientId, label } = cmd.payload;
    let authenticated = role === "arena" || role === "admin";

    if (role === "controller") {
      if (!pin || !engine.verifyPin(pin)) {
        send(ws, {
          type: "ERROR",
          payload: { code: "AUTH", message: "PIN inválido" },
          ts: Date.now(),
        });
        return;
      }
      authenticated = true;
    }

    // Substitui conexão anterior do mesmo clientId (reconnect)
    for (const [existingWs, existing] of clients) {
      if (existing.id === clientId && existingWs !== ws) {
        clients.delete(existingWs);
        try {
          existingWs.close();
        } catch {
          // ignore
        }
      }
    }

    const client: ConnectedClient = { id: clientId, role, ws, authenticated };
    clients.set(ws, client);

    // AUTH_OK + sync direto primeiro; registerClient emite STATE_CHANGED
    send(ws, { type: "AUTH_OK", payload: { role }, ts: Date.now() });
    engine.registerClient({
      id: clientId,
      role,
      connectedAt: Date.now(),
      label: label ?? role,
    });
    return;
  }

  const client = clients.get(ws);
  if (!client || !client.authenticated) {
    send(ws, {
      type: "ERROR",
      payload: { code: "AUTH", message: "Não autenticado" },
      ts: Date.now(),
    });
    return;
  }

  if (client.role === "arena") {
    send(ws, {
      type: "ERROR",
      payload: { code: "FORBIDDEN", message: "Arena é somente leitura" },
      ts: Date.now(),
    });
    return;
  }

  if (!engine.canControl(client.id, client.role) && isMatchCommand(cmd.type)) {
    // Auto-claim: último controller que tentar comandar assume o controle
    if (client.role === "controller") {
      engine.claimControl(client.id);
    } else {
      send(ws, {
        type: "ERROR",
        payload: { code: "LOCKED", message: "Outro controlador está ativo" },
        ts: Date.now(),
      });
      return;
    }
  }

  try {
    switch (cmd.type) {
      case "AUTH_PIN":
        if (!engine.verifyPin(cmd.payload.pin)) {
          send(ws, { type: "ERROR", payload: { code: "AUTH", message: "PIN inválido" }, ts: Date.now() });
          return;
        }
        client.authenticated = true;
        send(ws, { type: "AUTH_OK", payload: { role: client.role }, ts: Date.now() });
        break;
      case "MATCH_CREATE":
        engine.createMatch(cmd.payload);
        break;
      case "MATCH_START":
        engine.startMatch();
        break;
      case "MATCH_PAUSE":
        engine.pauseMatch();
        break;
      case "MATCH_RESUME":
        engine.resumeMatch();
        break;
      case "MATCH_FINISH":
        engine.finishMatch();
        break;
      case "HALF_TIME":
        engine.halfTime();
        break;
      case "SECOND_HALF":
        engine.secondHalf();
        break;
      case "GOAL":
        engine.addGoal(cmd.payload.teamId, cmd.payload.playerId, cmd.payload.ownGoal);
        break;
      case "UNDO_LAST_GOAL":
        engine.undoLastGoal();
        break;
      case "SELECT_MVP":
        engine.selectMvp(cmd.payload.playerId);
        break;
      case "TRIGGER_EFFECT":
        engine.triggerEffect(cmd.payload.effectType, {
          teamId: cmd.payload.teamId,
          playerId: cmd.payload.playerId,
        });
        break;
      case "CANCEL_EFFECT":
        engine.clearScreen();
        break;
      case "TIMER_RESET":
        engine.resetTimer();
        break;
      case "SHOW_SCOREBOARD":
        engine.showScoreboard();
        break;
      case "SHOW_TEAM_INTRO":
        engine.showTeamIntro();
        break;
      case "SHOW_COUNTDOWN":
        engine.showCountdown();
        break;
      case "REGISTER_POINT":
        engine.registerPoint(cmd.payload);
        break;
      case "UNDO_LAST_POINT":
        engine.undoLastPoint();
        break;
      case "ASSIGN_LAST_POINT_PLAYER":
        engine.assignLastPointPlayer(cmd.payload.playerId);
        break;
      case "SET_SERVER":
        engine.setServer(cmd.payload.teamId, cmd.payload.playerId);
        break;
      case "START_NEXT_SET":
        engine.startNextSet();
        break;
      case "TIMEOUT_START":
        engine.startTimeout(cmd.payload.teamId);
        break;
      case "TIMEOUT_END":
        engine.endTimeout();
        break;
      case "SET_VOLLEYBALL_OPTIONS":
        engine.setVolleyballOptions(cmd.payload);
        break;
      default:
        send(ws, {
          type: "ERROR",
          payload: { code: "UNKNOWN", message: "Comando desconhecido" },
          ts: Date.now(),
        });
    }
  } catch (err) {
    send(ws, {
      type: "ERROR",
      payload: { code: "ACTION", message: err instanceof Error ? err.message : "Falha na ação" },
      ts: Date.now(),
    });
  }
}

function isMatchCommand(type: string): boolean {
  return [
    "MATCH_CREATE",
    "MATCH_START",
    "MATCH_PAUSE",
    "MATCH_RESUME",
    "MATCH_FINISH",
    "HALF_TIME",
    "SECOND_HALF",
    "GOAL",
    "UNDO_LAST_GOAL",
    "SELECT_MVP",
    "TRIGGER_EFFECT",
    "CANCEL_EFFECT",
    "TIMER_RESET",
    "SHOW_SCOREBOARD",
    "SHOW_TEAM_INTRO",
    "SHOW_COUNTDOWN",
    "REGISTER_POINT",
    "UNDO_LAST_POINT",
    "ASSIGN_LAST_POINT_PLAYER",
    "SET_SERVER",
    "START_NEXT_SET",
    "TIMEOUT_START",
    "TIMEOUT_END",
    "SET_VOLLEYBALL_OPTIONS",
  ].includes(type);
}
