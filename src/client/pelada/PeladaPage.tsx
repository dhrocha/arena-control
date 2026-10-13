import { useEffect, useState } from "react";
import type { ClientCommand } from "@shared/events/index";
import type { PeladaSession } from "@shared/types/index";
import {
  formatCountdownMs,
  getPeladaGameRemainingMs,
  getPeladaSessionRemainingMs,
} from "@shared/pelada/clock";
import { useArenaSocket } from "../../hooks/useArenaSocket";
import { audioManager } from "../../infrastructure/audio/AudioManager";
import "./pelada.css";

const PIN_KEY = "arena-pelada-pin";
const COLORS = [
  "#1e88e5",
  "#e53935",
  "#43a047",
  "#fdd835",
  "#fb8c00",
  "#8e24aa",
  "#00acc1",
  "#ffffff",
  "#212121",
];

function useNow(tickMs = 200): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

export function PeladaPage() {
  const savedPin = localStorage.getItem(PIN_KEY) ?? "";
  const [pinInput, setPinInput] = useState(savedPin);
  const [pin, setPin] = useState(savedPin);
  const [enabled, setEnabled] = useState(Boolean(savedPin));
  const [screen, setScreen] = useState<"pin" | "main">(savedPin ? "main" : "pin");
  const [gameMinutes, setGameMinutes] = useState(5);
  const [team1Color, setTeam1Color] = useState(COLORS[0]!);
  const [team2Color, setTeam2Color] = useState(COLORS[1]!);
  const [flash, setFlash] = useState<string | null>(null);
  const now = useNow();

  const { connected, authenticated, state, error, send, setError } = useArenaSocket({
    role: "pelada",
    pin: enabled ? pin : undefined,
    enabled,
    label: "Pelada Control",
  });

  const session = state?.peladaSession ?? null;
  const gameMs = session ? getPeladaGameRemainingMs(session, now) : 0;
  const sessionMs = session ? getPeladaSessionRemainingMs(session, now) : 0;

  useEffect(() => {
    if (!error) return;
    setFlash(error);
    const t = setTimeout(() => setFlash(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!session) return;
    setGameMinutes(Math.max(1, Math.round(session.gameDurationSec / 60)));
    setTeam1Color(session.team1Color);
    setTeam2Color(session.team2Color);
  }, [session?.bookingId]);

  const safeSend = (cmd: Parameters<typeof send>[0]) => {
    audioManager.unlock();
    if (!send(cmd)) {
      setFlash("Sem conexão");
      return false;
    }
    return true;
  };

  const applyConfig = () =>
    safeSend({
      type: "PELADA_CONFIG",
      payload: {
        gameDurationSec: Math.max(1, gameMinutes) * 60,
        team1Color,
        team2Color,
      },
    });

  if (screen === "pin" || !enabled) {
    return (
      <div className="pelada-root">
        <div className="pelada-pin">
          <h1>PELADA</h1>
          <p>Digite o PIN da pelada (fornecido no agendamento)</p>
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="PIN"
          />
          <button
            type="button"
            className="btn-primary btn-lg"
            onClick={() => {
              localStorage.setItem(PIN_KEY, pinInput);
              setPin(pinInput);
              setEnabled(true);
              setScreen("main");
              setError(null);
            }}
          >
            Entrar
          </button>
          {flash && <p className="pelada-flash">{flash}</p>}
        </div>
      </div>
    );
  }

  if (!authenticated && enabled) {
    return (
      <div className="pelada-root">
        <div className="pelada-pin">
          <h1>PELADA</h1>
          <p>{connected ? "Autenticando…" : "Conectando…"}</p>
          {error && (
            <>
              <p className="pelada-flash">{error}</p>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  localStorage.removeItem(PIN_KEY);
                  setEnabled(false);
                  setScreen("pin");
                }}
              >
                Trocar PIN
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!session || session.phase === "expired") {
    return (
      <div className="pelada-root">
        <header className="pelada-top">
          <h1>PELADA</h1>
          <span className={`conn-dot ${connected ? "on" : ""}`} />
        </header>
        <div className="pelada-unavailable">
          <h2>Pelada indisponível</h2>
          <p>Aguarde o administrador iniciar uma sessão na aba Peladas.</p>
        </div>
      </div>
    );
  }

  const inGame = session.phase === "playing" || session.phase === "paused";
  const canConfig = session.phase === "lobby" || session.phase === "between_games";

  return (
    <div className="pelada-root">
      <header className="pelada-top">
        <h1>PELADA · {session.sport === "VOLLEYBALL" ? "VÔLEI" : "FUTEBOL"}</h1>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            localStorage.removeItem(PIN_KEY);
            setEnabled(false);
            setScreen("pin");
          }}
        >
          Sair
        </button>
      </header>

      {(flash || error) && <div className="pelada-flash">{flash ?? error}</div>}

      <div className="pelada-timers">
        <div>
          <span>Jogo</span>
          <strong>{formatCountdownMs(gameMs)}</strong>
        </div>
        <div>
          <span>Sessão</span>
          <strong>{formatCountdownMs(sessionMs)}</strong>
        </div>
        <div>
          <span>Fase</span>
          <strong>{session.phase}</strong>
        </div>
      </div>

      {canConfig && (
        <section className="pelada-config">
          <div className="field">
            <label>Tempo de jogo (min)</label>
            <input
              type="number"
              min={1}
              max={60}
              value={gameMinutes}
              onChange={(e) => setGameMinutes(Number(e.target.value) || 1)}
            />
          </div>
          <div className="pelada-colors">
            <ColorPicker label="Time 1" value={team1Color} onChange={setTeam1Color} />
            <ColorPicker label="Time 2" value={team2Color} onChange={setTeam2Color} />
          </div>
          <button
            type="button"
            className="btn-primary btn-lg"
            onClick={() => {
              applyConfig();
              safeSend({ type: "PELADA_GAME_START" });
            }}
          >
            Iniciar
          </button>
        </section>
      )}

      {inGame && (
        <>
          <ScorePanel session={session} send={safeSend} />
          <div className="pelada-actions">
            {session.phase === "playing" ? (
              <button
                type="button"
                className="btn-ghost btn-lg"
                onClick={() => safeSend({ type: "PELADA_GAME_PAUSE" })}
              >
                Pausar
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary btn-lg"
                onClick={() => safeSend({ type: "PELADA_GAME_RESUME" })}
              >
                Iniciar
              </button>
            )}
            <button
              type="button"
              className="btn-danger btn-lg"
              onClick={() => safeSend({ type: "PELADA_GAME_FINISH" })}
            >
              Finalizar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div>
      <label>{label}</label>
      <div className="pelada-swatches">
        {COLORS.map((c) => (
          <button
            key={`${label}-${c}`}
            type="button"
            className={value === c ? "on" : ""}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={`${label} ${c}`}
          />
        ))}
      </div>
    </div>
  );
}

function ScorePanel({
  session,
  send,
}: {
  session: PeladaSession;
  send: (cmd: ClientCommand) => boolean;
}) {
  return (
    <div className="pelada-score">
      <div className="pelada-team" style={{ borderColor: session.team1Color }}>
        <span style={{ background: session.team1Color }} />
        <strong>{session.team1Score}</strong>
        <div className="pelada-score-btns">
          <button type="button" onClick={() => send({ type: "PELADA_SCORE", payload: { team: 1, delta: 1 } })}>
            +
          </button>
          <button type="button" onClick={() => send({ type: "PELADA_SCORE", payload: { team: 1, delta: -1 } })}>
            −
          </button>
        </div>
      </div>
      <div className="pelada-team" style={{ borderColor: session.team2Color }}>
        <span style={{ background: session.team2Color }} />
        <strong>{session.team2Score}</strong>
        <div className="pelada-score-btns">
          <button type="button" onClick={() => send({ type: "PELADA_SCORE", payload: { team: 2, delta: 1 } })}>
            +
          </button>
          <button type="button" onClick={() => send({ type: "PELADA_SCORE", payload: { team: 2, delta: -1 } })}>
            −
          </button>
        </div>
      </div>
    </div>
  );
}
