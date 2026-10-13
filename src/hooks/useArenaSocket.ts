import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ClientCommand, ServerMessage } from "@shared/events/index";
import type { AppState, ClientRole, EffectPayload } from "@shared/types/index";

function makeClientId(role: ClientRole): string {
  const key = `arena-client-id-${role}`;
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = `${role}-${uuidv4()}`;
  sessionStorage.setItem(key, id);
  return id;
}

export interface UseArenaSocketOptions {
  role: ClientRole;
  pin?: string;
  enabled?: boolean;
  label?: string;
}

export function useArenaSocket(options: UseArenaSocketOptions) {
  const { role, pin, enabled = true, label } = options;
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<AppState | null>(null);
  const [lastEffect, setLastEffect] = useState<EffectPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(role === "arena" || role === "admin");
  // pelada / controller authenticate via PIN on HELLO
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientId = useRef(makeClientId(role));
  const generationRef = useRef(0);

  const send = useCallback((cmd: ClientCommand) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(cmd));
    return true;
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const next = (await fetch("/api/state").then((r) => r.json())) as AppState;
      setState(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let closed = false;
    const generation = ++generationRef.current;
    clientId.current = makeClientId(role);

    const clearReconnect = () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };

    const detach = (ws: WebSocket) => {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
    };

    const connect = () => {
      if (closed || generation !== generationRef.current) return;
      clearReconnect();

      const prev = wsRef.current;
      if (prev) {
        detach(prev);
        wsRef.current = null;
        try {
          prev.close();
        } catch {
          // ignore
        }
      }

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws || closed) return;
        setConnected(true);
        setError(null);
        ws.send(
          JSON.stringify({
            type: "HELLO",
            payload: {
              role,
              pin,
              clientId: clientId.current,
              label: label ?? role,
            },
          } satisfies ClientCommand)
        );
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        try {
          const msg = JSON.parse(String(event.data)) as ServerMessage;
          switch (msg.type) {
            case "STATE_SYNC":
              setState(msg.payload);
              setLastEffect(msg.payload.activeEffect);
              break;
            case "EFFECT_TRIGGER":
              setLastEffect(msg.payload);
              break;
            case "EFFECT_CANCEL":
              setLastEffect(null);
              break;
            case "AUTH_OK":
              setAuthenticated(true);
              setError(null);
              break;
            case "ERROR":
              setError(msg.payload.message);
              if (msg.payload.code === "AUTH") setAuthenticated(false);
              break;
            default:
              break;
          }
        } catch (err) {
          console.error("WS parse error", err);
        }
      };

      ws.onclose = () => {
        // Só o socket ativo pode reagendar reconnect — evita storm quando o
        // server fecha a conexão anterior no HELLO de substituição.
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        setConnected(false);
        if (!closed && generation === generationRef.current) {
          clearReconnect();
          reconnectRef.current = setTimeout(connect, 1200);
        }
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        setError("Falha de conexão");
      };
    };

    connect();
    void refreshState();

    return () => {
      closed = true;
      clearReconnect();
      const ws = wsRef.current;
      if (ws) {
        detach(ws);
        wsRef.current = null;
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
      setConnected(false);
    };
  }, [enabled, role, pin, label, refreshState]);

  return {
    connected,
    authenticated,
    state,
    lastEffect,
    error,
    send,
    setError,
    refreshState,
    clientId: clientId.current,
  };
}
