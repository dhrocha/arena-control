import { useEffect, useState } from "react";
import type { MatchMode, Player, Sport, Team } from "@shared/types/index";
import { setsToWin, type VolleyballFormat } from "@shared/sports/index";
import { useArenaSocket } from "../../hooks/useArenaSocket";
import { useMatchClock } from "../../hooks/useMatchClock";
import { useCountdownEndsAt } from "../../hooks/useCountdownEndsAt";
import { audioManager } from "../../infrastructure/audio/AudioManager";
import {
  defaultVolleyballFormConfig,
  sportTitle,
  type CreateMatchPayload,
} from "../../sports/ui";
import "./control.css";

type Screen =
  | "pin"
  | "home"
  | "new-match"
  | "pick-scorer"
  | "pick-point-player"
  | "mvp"
  | "teams"
  | "team-form"
  | "players"
  | "player-form";

const PIN_KEY = "arena-control-pin";

function suggestShortName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  const parts = cleaned.split(" ");
  if (parts.length === 1) return parts[0].slice(0, 6).toUpperCase();
  return parts
    .slice(0, 3)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}

export function ControlPage() {
  const savedPin = localStorage.getItem(PIN_KEY) ?? "";
  const [pinInput, setPinInput] = useState(savedPin);
  const [pin, setPin] = useState(savedPin);
  const [enabled, setEnabled] = useState(Boolean(savedPin));
  const [screen, setScreen] = useState<Screen>(savedPin ? "home" : "pin");
  const [goalTeamId, setGoalTeamId] = useState<string | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const { connected, authenticated, state, error, send, setError, refreshState } = useArenaSocket({
    role: "controller",
    pin: enabled ? pin : undefined,
    enabled,
  });

  const [actionError, setActionError] = useState<string | null>(null);

  const match = state?.match ?? null;
  const clock = useMatchClock(match);
  const home = match ? state?.teams.find((t) => t.id === match.homeTeamId) : null;
  const away = match ? state?.teams.find((t) => t.id === match.awayTeamId) : null;
  const isGameDay = match?.mode === "gameday";
  const isVolleyball = match?.sport === "VOLLEYBALL";
  const volley = match?.sportState?.sport === "VOLLEYBALL" ? match.sportState : null;
  const timeoutLeft = useCountdownEndsAt(
    volley?.status === "TIMEOUT" ? volley.timeoutEndsAt : null
  );

  const unlockAudio = () => audioManager.unlock();

  const safeSend = (cmd: Parameters<typeof send>[0]) => {
    unlockAudio();
    const ok = send(cmd);
    if (!ok) {
      setActionError("Sem conexão com o servidor. Aguarde reconectar.");
      return false;
    }
    setActionError(null);
    return true;
  };

  useEffect(() => {
    if (error && authenticated) {
      setActionError(error);
      const t = setTimeout(() => {
        setActionError(null);
        setError(null);
      }, 3500);
      return () => clearTimeout(t);
    }
  }, [error, authenticated, setError]);

  if (!enabled || !authenticated) {
    return (
      <div className="ctrl-root">
        <header className="ctrl-top">
          <h1>CÓDIGO DE CONTROLE</h1>
          <Conn connected={connected} />
        </header>
        <div className="ctrl-pin">
          <input
            inputMode="numeric"
            maxLength={8}
            value={pinInput}
            onChange={(e) => {
              setPinInput(e.target.value);
              setError(null);
            }}
            placeholder="PIN"
            autoFocus
          />
          {enabled && !authenticated && !error && <p>Conectando...</p>}
          {error && <p className="ctrl-error">{error}</p>}
          <button
            className="btn-primary btn-lg"
            type="button"
            onClick={() => {
              localStorage.setItem(PIN_KEY, pinInput);
              setPin(pinInput);
              setEnabled(true);
              unlockAudio();
              // force reconnect with new pin by toggling
              if (enabled && pin === pinInput) {
                setEnabled(false);
                setTimeout(() => setEnabled(true), 50);
              }
            }}
          >
            ENTRAR
          </button>
        </div>
      </div>
    );
  }

  if (screen === "new-match" || (!match && screen === "home")) {
    return (
      <NewMatchScreen
        connected={connected}
        teams={state?.teams ?? []}
        defaultDuration={state?.settings.defaultDuration ?? 40}
        onBack={() => setScreen("home")}
        onCreate={(payload) => {
          safeSend({ type: "MATCH_CREATE", payload });
          setScreen("home");
        }}
        onTeams={() => setScreen("teams")}
      />
    );
  }

  if (screen === "pick-point-player" && goalTeamId && match) {
    const players = (state?.players ?? []).filter((p) => p.teamId === goalTeamId && p.active);
    const team = state?.teams.find((t) => t.id === goalTeamId);
    return (
      <div className="ctrl-root">
        <header className="ctrl-top">
          <button type="button" className="btn-ghost" onClick={() => setScreen("home")}>
            ←
          </button>
          <h1>QUEM FEZ O PONTO?</h1>
          <Conn connected={connected} />
        </header>
        <p className="ctrl-hint">{team?.name ?? ""} — opcional</p>
        <div className="ctrl-list">
          {players.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ctrl-player-btn"
              onClick={() => {
                safeSend({ type: "ASSIGN_LAST_POINT_PLAYER", payload: { playerId: p.id } });
                setScreen("home");
              }}
            >
              <span className="num">{p.shirtNumber}</span>
              <span>{p.nickname || p.name}</span>
            </button>
          ))}
          <button type="button" className="btn-ghost btn-lg" onClick={() => setScreen("home")}>
            SEM IDENTIFICAR
          </button>
        </div>
      </div>
    );
  }

  if (screen === "pick-scorer" && goalTeamId && match) {
    const players = (state?.players ?? []).filter((p) => p.teamId === goalTeamId && p.active);
    const team = state?.teams.find((t) => t.id === goalTeamId);
    return (
      <div className="ctrl-root">
        <header className="ctrl-top">
          <button type="button" className="btn-ghost" onClick={() => setScreen("home")}>
            ←
          </button>
          <h1>{team?.name ?? "GOL"}</h1>
          <Conn connected={connected} />
        </header>
        <div className="ctrl-list">
          {players.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ctrl-player-btn"
              onClick={() => {
                safeSend({ type: "GOAL", payload: { teamId: goalTeamId, playerId: p.id } });
                setScreen("home");
              }}
            >
              <span className="num">{p.shirtNumber}</span>
              <span>{p.nickname || p.name}</span>
            </button>
          ))}
          <button
            type="button"
            className="btn-ghost btn-lg"
            onClick={() => {
              safeSend({ type: "GOAL", payload: { teamId: goalTeamId } });
              setScreen("home");
            }}
          >
            GOL SEM JOGADOR
          </button>
        </div>
      </div>
    );
  }

  if (screen === "mvp" && match) {
    const players = (state?.players ?? []).filter(
      (p) => (p.teamId === match.homeTeamId || p.teamId === match.awayTeamId) && p.active
    );
    return (
      <div className="ctrl-root">
        <header className="ctrl-top">
          <button type="button" className="btn-ghost" onClick={() => setScreen("home")}>
            ←
          </button>
          <h1>Craque da Partida</h1>
          <Conn connected={connected} />
        </header>
        <div className="ctrl-list">
          {players.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ctrl-player-btn"
              onClick={() => {
                safeSend({ type: "SELECT_MVP", payload: { playerId: p.id } });
                setScreen("home");
              }}
            >
              <span className="num">{p.shirtNumber}</span>
              <span>{p.nickname || p.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (screen === "teams" || screen === "team-form") {
    return (
      <TeamsScreen
        key={screen === "team-form" ? editingTeam?.id ?? "new-team" : "teams-list"}
        connected={connected}
        initialTeams={state?.teams ?? []}
        editing={editingTeam}
        formMode={screen === "team-form"}
        onBack={() => {
          setEditingTeam(null);
          setScreen("home");
        }}
        onNew={() => {
          setEditingTeam(null);
          setScreen("team-form");
        }}
        onEdit={(t) => {
          setEditingTeam(t);
          setScreen("team-form");
        }}
        onPlayers={(t) => {
          setSelectedTeamId(t.id);
          setScreen("players");
        }}
        onSaved={async () => {
          await refreshState();
          setEditingTeam(null);
          setScreen("teams");
        }}
      />
    );
  }

  if ((screen === "players" || screen === "player-form") && selectedTeamId) {
    return (
      <PlayersScreen
        key={screen === "player-form" ? "new-player" : `players-${selectedTeamId}`}
        connected={connected}
        teamId={selectedTeamId}
        team={state?.teams.find((t) => t.id === selectedTeamId)}
        players={(state?.players ?? []).filter((p) => p.teamId === selectedTeamId)}
        formMode={screen === "player-form"}
        onBack={() => setScreen("teams")}
        onNew={() => setScreen("player-form")}
        onSaved={async () => {
          await refreshState();
          setScreen("players");
        }}
      />
    );
  }

  return (
    <div className="ctrl-root">
      <header className="ctrl-top">
        <div>
          <div className="ctrl-mode">
            {match ? sportTitle(match.sport) : "ARENA"}
            {match ? ` · ${isGameDay ? "GAME DAY" : "PELADA"}` : ""}
          </div>
          <h1>{state?.settings.arenaName ?? "Arena"}</h1>
        </div>
        <Conn connected={connected} />
      </header>

      {actionError && <div className="ctrl-toast">{actionError}</div>}

      {match && home && away && (
        <div className="ctrl-stack">
          <section className="ctrl-score">
            <div>
              <strong>{home.shortName}</strong>
              <em style={{ color: home.secondaryColor }}>{match.homeScore}</em>
              {isVolleyball && volley && (
                <small className="ctrl-sets-won">{volley.homeSetsWon} SETS</small>
              )}
            </div>
            <div className="ctrl-mid">
              <span>×</span>
              {isVolleyball && volley ? (
                <>
                  <div className="ctrl-clock">
                    {volley.homeSetsWon === setsToWin(volley.config) - 1 &&
                    volley.awaySetsWon === setsToWin(volley.config) - 1
                      ? "SET DECISIVO"
                      : `SET ${volley.currentSet}`}
                  </div>
                  <small className="ctrl-match-status">{match.status}</small>
                </>
              ) : (
                <>
                  <div className="ctrl-clock">{clock}</div>
                  <small className="ctrl-match-status">{match.status}</small>
                </>
              )}
            </div>
            <div>
              <strong>{away.shortName}</strong>
              <em style={{ color: away.secondaryColor }}>{match.awayScore}</em>
              {isVolleyball && volley && (
                <small className="ctrl-sets-won">{volley.awaySetsWon} SETS</small>
              )}
            </div>
          </section>

          {match.status === "finished" ? (
            <section className="ctrl-stack">
              <p className="ctrl-finished-msg">PARTIDA ENCERRADA</p>
              <section className="ctrl-row">
                {isGameDay && (
                  <button type="button" className="btn-lg" onClick={() => setScreen("mvp")}>
                    CRAQUE
                  </button>
                )}
                <button type="button" className="btn-primary btn-lg" onClick={() => setScreen("new-match")}>
                  NOVA PARTIDA
                </button>
              </section>
            </section>
          ) : match.status === "countdown" ? (
            <section className="ctrl-row single">
              <button type="button" className="btn-primary" disabled>
                COUNTDOWN NA ARENA...
              </button>
            </section>
          ) : (
            <>
              {isVolleyball &&
                (match.status === "playing" || match.status === "paused") &&
                volley?.status !== "SET_FINISHED" &&
                volley?.status !== "MATCH_FINISHED" && (
                  <>
                    {volley?.status === "TIMEOUT" ? (
                      <section className="ctrl-row single">
                        <div className="ctrl-timeout-banner">
                          <strong>TIMEOUT</strong>
                          <em>{timeoutLeft ?? volley.config.timeoutSeconds}s</em>
                        </div>
                        <button
                          type="button"
                          className="btn-primary btn-lg"
                          onClick={() => safeSend({ type: "TIMEOUT_END" })}
                        >
                          ENCERRAR TIMEOUT
                        </button>
                      </section>
                    ) : (
                      <section className="ctrl-goals ctrl-volley-points">
                        <button
                          type="button"
                          style={{ background: home.primaryColor, color: home.secondaryColor }}
                          onClick={() => {
                            if (!safeSend({ type: "REGISTER_POINT", payload: { teamId: home.id } })) return;
                            setGoalTeamId(home.id);
                            setScreen("pick-point-player");
                          }}
                        >
                          + PONTO {home.shortName}
                        </button>
                        <button
                          type="button"
                          style={{ background: away.primaryColor, color: away.secondaryColor }}
                          onClick={() => {
                            if (!safeSend({ type: "REGISTER_POINT", payload: { teamId: away.id } })) return;
                            setGoalTeamId(away.id);
                            setScreen("pick-point-player");
                          }}
                        >
                          + PONTO {away.shortName}
                        </button>
                      </section>
                    )}

                    {volley?.status !== "TIMEOUT" && (
                      <>
                        <section className="ctrl-serve">
                          <h2>SAQUE</h2>
                          <div className="ctrl-mode-pick">
                            <button
                              type="button"
                              className={volley?.serverTeamId === home.id ? "on" : ""}
                              onClick={() => safeSend({ type: "SET_SERVER", payload: { teamId: home.id } })}
                            >
                              {home.shortName}
                            </button>
                            <button
                              type="button"
                              className={volley?.serverTeamId === away.id ? "on" : ""}
                              onClick={() => safeSend({ type: "SET_SERVER", payload: { teamId: away.id } })}
                            >
                              {away.shortName}
                            </button>
                          </div>
                        </section>

                        <label className="ctrl-check">
                          <input
                            type="checkbox"
                            checked={volley?.config.pointSoundEnabled ?? true}
                            onChange={(e) =>
                              safeSend({
                                type: "SET_VOLLEYBALL_OPTIONS",
                                payload: { pointSoundEnabled: e.target.checked },
                              })
                            }
                          />
                          Som de ponto
                        </label>

                        <section className="ctrl-row">
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => safeSend({ type: "TIMEOUT_START", payload: { teamId: home.id } })}
                          >
                            TIMEOUT {home.shortName}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => safeSend({ type: "TIMEOUT_START", payload: { teamId: away.id } })}
                          >
                            TIMEOUT {away.shortName}
                          </button>
                        </section>
                      </>
                    )}
                  </>
                )}

              {isVolleyball && volley?.status === "SET_FINISHED" && (
                <section className="ctrl-row single">
                  <button
                    type="button"
                    className="btn-primary btn-lg"
                    onClick={() => safeSend({ type: "START_NEXT_SET" })}
                  >
                    INICIAR PRÓXIMO SET
                  </button>
                </section>
              )}

              {!isVolleyball &&
                (match.status === "playing" || match.status === "paused" || match.status === "halftime") && (
                <section className="ctrl-goals">
                  <button
                    type="button"
                    style={{ background: home.primaryColor, color: home.secondaryColor }}
                    onClick={() => {
                      setGoalTeamId(home.id);
                      setScreen("pick-scorer");
                    }}
                  >
                    GOL {home.shortName}
                  </button>
                  <button
                    type="button"
                    style={{ background: away.primaryColor, color: away.secondaryColor }}
                    onClick={() => {
                      setGoalTeamId(away.id);
                      setScreen("pick-scorer");
                    }}
                  >
                    GOL {away.shortName}
                  </button>
                </section>
              )}

              <section className="ctrl-row">
                {match.status === "setup" && (
                  <button type="button" className="btn-primary" onClick={() => safeSend({ type: "MATCH_START" })}>
                    INICIAR
                  </button>
                )}
                {match.status === "paused" && (
                  <button type="button" className="btn-primary" onClick={() => safeSend({ type: "MATCH_RESUME" })}>
                    CONTINUAR
                  </button>
                )}
                {match.status === "halftime" && !isVolleyball && (
                  <button type="button" className="btn-primary" onClick={() => safeSend({ type: "SECOND_HALF" })}>
                    2º TEMPO
                  </button>
                )}
                {match.status === "playing" && (
                  <button type="button" onClick={() => safeSend({ type: "MATCH_PAUSE" })}>
                    PAUSAR
                  </button>
                )}
                {isGameDay && match.status !== "setup" && (
                  <button type="button" onClick={() => setScreen("mvp")}>
                    CRAQUE
                  </button>
                )}
              </section>

              {match.status !== "setup" && (
                <section className="ctrl-secondary">
                  {isVolleyball ? (
                    <button type="button" className="btn-ghost" onClick={() => safeSend({ type: "UNDO_LAST_POINT" })}>
                      DESFAZER
                    </button>
                  ) : (
                    <button type="button" className="btn-ghost" onClick={() => safeSend({ type: "UNDO_LAST_GOAL" })}>
                      DESFAZER GOL
                    </button>
                  )}
                  <button type="button" className="btn-danger" onClick={() => safeSend({ type: "MATCH_FINISH" })}>
                    FINALIZAR
                  </button>
                </section>
              )}
            </>
          )}

          {isGameDay && !isVolleyball && match.status !== "finished" && match.status !== "countdown" && (
            <section className="ctrl-effects">
              <h2>EFEITOS / TELA</h2>
              <div className="ctrl-effects-grid">
                {(
                  [
                    {
                      key: "start",
                      label: "INÍCIO",
                      disabled: match.status !== "setup",
                      run: () => safeSend({ type: "MATCH_START" }),
                    },
                    {
                      key: "intro",
                      label: "TIMES",
                      disabled: match.status !== "setup",
                      run: () => safeSend({ type: "SHOW_TEAM_INTRO" }),
                    },
                    {
                      key: "count",
                      label: "COUNT",
                      disabled: match.status !== "setup",
                      run: () => safeSend({ type: "SHOW_COUNTDOWN" }),
                    },
                    {
                      key: "ht",
                      label: "INTERVALO",
                      disabled: !(
                        (match.status === "playing" || match.status === "paused") &&
                        match.currentPeriod === 1
                      ),
                      run: () => safeSend({ type: "HALF_TIME" }),
                    },
                    {
                      key: "h2",
                      label: "2º TEMPO",
                      disabled: match.status !== "halftime",
                      run: () => safeSend({ type: "SECOND_HALF" }),
                    },
                    {
                      key: "pen",
                      label: "PÊNALTI",
                      disabled: match.status !== "playing" && match.status !== "paused",
                      run: () => safeSend({ type: "TRIGGER_EFFECT", payload: { effectType: "PENALTY" } }),
                    },
                    {
                      key: "end",
                      label: "FIM",
                      disabled: match.status === "setup",
                      run: () => safeSend({ type: "MATCH_FINISH" }),
                    },
                    {
                      key: "board",
                      label: "PLACAR",
                      disabled: false,
                      run: () => safeSend({ type: "SHOW_SCOREBOARD" }),
                    },
                    {
                      key: "sponsors",
                      label: "PATROCÍNIOS",
                      disabled: false,
                      run: () => safeSend({ type: "SHOW_SPONSORS" }),
                    },
                    {
                      key: "clear",
                      label: "LIMPAR",
                      disabled: false,
                      run: () => safeSend({ type: "CANCEL_EFFECT" }),
                    },
                  ] as Array<{ key: string; label: string; disabled: boolean; run: () => void }>
                ).map((btn) => (
                  <button key={btn.key} type="button" disabled={btn.disabled} onClick={btn.run}>
                    {btn.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {(isVolleyball || !isGameDay || match?.status === "finished" || !match) && (
            <section className="ctrl-effects">
              <h2>TELA</h2>
              <div className="ctrl-effects-grid">
                <button type="button" onClick={() => safeSend({ type: "SHOW_SCOREBOARD" })}>
                  PLACAR
                </button>
                <button type="button" onClick={() => safeSend({ type: "SHOW_SPONSORS" })}>
                  PATROCÍNIOS
                </button>
                <button type="button" onClick={() => safeSend({ type: "CANCEL_EFFECT" })}>
                  LIMPAR
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {!match && (
        <section className="ctrl-effects" style={{ marginTop: "1rem" }}>
          <h2>TELA</h2>
          <div className="ctrl-effects-grid">
            <button type="button" onClick={() => safeSend({ type: "SHOW_SPONSORS" })}>
              PATROCÍNIOS
            </button>
            <button type="button" onClick={() => safeSend({ type: "CANCEL_EFFECT" })}>
              LIMPAR
            </button>
          </div>
        </section>
      )}

      <nav className="ctrl-nav">
        <button type="button" onClick={() => setScreen("new-match")}>
          PARTIDA
        </button>
        <button type="button" onClick={() => setScreen("teams")}>
          TIMES
        </button>
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem(PIN_KEY);
            setEnabled(false);
            setPin("");
            setError(null);
            setScreen("pin");
          }}
        >
          SAIR
        </button>
      </nav>
    </div>
  );
}

function Conn({ connected }: { connected: boolean }) {
  return (
    <div className="conn-pill">
      <span className={`conn-dot ${connected ? "on" : ""}`} />
      {connected ? "CONECTADO" : "DESCONECTADO"}
    </div>
  );
}

function NewMatchScreen({
  connected,
  teams: teamsFromState,
  defaultDuration,
  onCreate,
  onBack,
  onTeams,
}: {
  connected: boolean;
  teams: Team[];
  defaultDuration: number;
  onCreate: (p: CreateMatchPayload) => void;
  onBack: () => void;
  onTeams: () => void;
}) {
  const [step, setStep] = useState<"sport" | "config">("sport");
  const [sport, setSport] = useState<Sport | null>(null);
  const [teams, setTeams] = useState<Team[]>(teamsFromState);
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [mode, setMode] = useState<MatchMode>("gameday");
  const [duration, setDuration] = useState(defaultDuration);
  const [volleyCfg, setVolleyCfg] = useState(defaultVolleyballFormConfig);
  const [loading, setLoading] = useState(teamsFromState.length === 0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = (await fetch("/api/teams").then((r) => r.json())) as Team[];
        if (cancelled) return;
        setTeams(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (teamsFromState.length > 0) setTeams(teamsFromState);
  }, [teamsFromState]);

  const pickSport = (next: Sport) => {
    setSport(next);
    setStep("config");
  };

  const submit = () => {
    if (!sport || !homeTeamId || !awayTeamId) return;
    const payload: CreateMatchPayload = {
      homeTeamId,
      awayTeamId,
      mode,
      duration: sport === "FOOTBALL" ? duration : defaultDuration,
      sport,
    };
    if (sport === "VOLLEYBALL") {
      payload.volleyballConfig = { ...volleyCfg };
    }
    onCreate(payload);
  };

  if (step === "sport") {
    return (
      <div className="ctrl-root">
        <header className="ctrl-top">
          <button type="button" className="btn-ghost" onClick={onBack}>
            ←
          </button>
          <h1>NOVO JOGO</h1>
          <Conn connected={connected} />
        </header>
        <div className="ctrl-form">
          <p className="ctrl-hint">ESCOLHA O ESPORTE</p>
          <div className="ctrl-sport-pick">
            <button type="button" className="ctrl-sport-card" onClick={() => pickSport("FOOTBALL")}>
              <span className="ctrl-sport-emoji" aria-hidden>
                ⚽
              </span>
              <strong>FUTEBOL</strong>
            </button>
            <button type="button" className="ctrl-sport-card" onClick={() => pickSport("VOLLEYBALL")}>
              <span className="ctrl-sport-emoji" aria-hidden>
                🏐
              </span>
              <strong>VÔLEI</strong>
            </button>
          </div>
          <button type="button" className="btn-ghost btn-lg" onClick={onTeams}>
            GERENCIAR TIMES
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ctrl-root">
      <header className="ctrl-top">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setStep("sport");
            setSport(null);
          }}
        >
          ←
        </button>
        <h1>{sport ? sportTitle(sport) : "NOVA PARTIDA"}</h1>
        <Conn connected={connected} />
      </header>
      <div className="ctrl-form">
        <p className="ctrl-hint">Escolha os times — nada vem pré-selecionado da partida anterior.</p>
        <div className="field">
          <label>Time 1</label>
          <select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}>
            <option value="">{loading ? "Carregando..." : "Selecione..."}</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Time 2</label>
          <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
            <option value="">{loading ? "Carregando..." : "Selecione..."}</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id} disabled={t.id === homeTeamId}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Modo</label>
          <div className="ctrl-mode-pick">
            <button type="button" className={mode === "pelada" ? "on" : ""} onClick={() => setMode("pelada")}>
              PELADA
            </button>
            <button type="button" className={mode === "gameday" ? "on" : ""} onClick={() => setMode("gameday")}>
              GAME DAY
            </button>
          </div>
        </div>

        {sport === "FOOTBALL" && (
          <div className="field">
            <label>Duração (min)</label>
            <input
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
        )}

        {sport === "VOLLEYBALL" && (
          <>
            <div className="field">
              <label>Formato</label>
              <div className="ctrl-mode-pick">
                <button
                  type="button"
                  className={volleyCfg.format === "BEST_OF_3" ? "on" : ""}
                  onClick={() => setVolleyCfg((c) => ({ ...c, format: "BEST_OF_3" as VolleyballFormat }))}
                >
                  MELHOR DE 3
                </button>
                <button
                  type="button"
                  className={volleyCfg.format === "BEST_OF_5" ? "on" : ""}
                  onClick={() => setVolleyCfg((c) => ({ ...c, format: "BEST_OF_5" }))}
                >
                  MELHOR DE 5
                </button>
              </div>
            </div>
            <div className="field">
              <label>Sets normais (pontos)</label>
              <input
                type="number"
                min={1}
                value={volleyCfg.normalSetPoints}
                onChange={(e) =>
                  setVolleyCfg((c) => ({ ...c, normalSetPoints: Number(e.target.value) || 1 }))
                }
              />
            </div>
            <div className="field">
              <label>Set decisivo (pontos)</label>
              <input
                type="number"
                min={1}
                value={volleyCfg.decidingSetPoints}
                onChange={(e) =>
                  setVolleyCfg((c) => ({ ...c, decidingSetPoints: Number(e.target.value) || 1 }))
                }
              />
            </div>
            <div className="field">
              <label>Diferença mínima</label>
              <input
                type="number"
                min={1}
                value={volleyCfg.minDifference}
                onChange={(e) =>
                  setVolleyCfg((c) => ({ ...c, minDifference: Number(e.target.value) || 1 }))
                }
              />
            </div>
            <div className="field">
              <label>Timeout (segundos)</label>
              <input
                type="number"
                min={1}
                value={volleyCfg.timeoutSeconds}
                onChange={(e) =>
                  setVolleyCfg((c) => ({ ...c, timeoutSeconds: Number(e.target.value) || 30 }))
                }
              />
            </div>
          </>
        )}

        {teams.length < 2 && !loading && (
          <p className="ctrl-error">Cadastre pelo menos 2 times.</p>
        )}
        <button
          type="button"
          className="btn-primary btn-lg"
          disabled={teams.length < 2 || !homeTeamId || !awayTeamId || homeTeamId === awayTeamId}
          onClick={submit}
        >
          CRIAR PARTIDA
        </button>
        <button type="button" className="btn-ghost btn-lg" onClick={onTeams}>
          GERENCIAR TIMES
        </button>
      </div>
    </div>
  );
}

function TeamsScreen({
  connected,
  initialTeams,
  editing,
  formMode,
  onBack,
  onNew,
  onEdit,
  onPlayers,
  onSaved,
}: {
  connected: boolean;
  initialTeams: Team[];
  editing: Team | null;
  formMode: boolean;
  onBack: () => void;
  onNew: () => void;
  onEdit: (t: Team) => void;
  onPlayers: (t: Team) => void;
  onSaved: () => void | Promise<void>;
}) {
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState(editing?.name ?? "");
  const [shortName, setShortName] = useState(editing?.shortName ?? "");
  const [shortTouched, setShortTouched] = useState(Boolean(editing?.shortName));
  const [primaryColor, setPrimaryColor] = useState(editing?.primaryColor ?? "#111111");
  const [secondaryColor, setSecondaryColor] = useState(editing?.secondaryColor ?? "#ffffff");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadTeams = async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/teams");
      if (!res.ok) throw new Error("Falha ao carregar times");
      const list = (await res.json()) as Team[];
      setTeams(list);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTeams();
  }, []);

  useEffect(() => {
    if (initialTeams.length > 0) setTeams(initialTeams);
  }, [initialTeams]);

  if (formMode) {
    return (
      <div className="ctrl-root">
        <header className="ctrl-top">
          <button type="button" className="btn-ghost" onClick={() => void onSaved()}>
            ←
          </button>
          <h1>{editing ? "EDITAR TIME" : "NOVO TIME"}</h1>
          <Conn connected={connected} />
        </header>
        <div className="ctrl-form">
          <div className="field">
            <label>Nome</label>
            <input
              value={name}
              placeholder="Ex: Black Wolves"
              onChange={(e) => {
                const next = e.target.value;
                setName(next);
                if (!shortTouched) setShortName(suggestShortName(next));
              }}
            />
          </div>
          <div className="field">
            <label>Nome curto</label>
            <input
              value={shortName}
              placeholder="Ex: BLACK"
              onChange={(e) => {
                setShortTouched(true);
                setShortName(e.target.value.toUpperCase());
              }}
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Cor primária</label>
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
            </div>
            <div className="field">
              <label>Cor secundária</label>
              <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Logo (opcional)</label>
            <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
          </div>
          {formError && <p className="ctrl-error">{formError}</p>}
          <button
            type="button"
            className="btn-primary btn-lg"
            disabled={busy}
            onClick={async () => {
              const trimmedName = name.trim();
              const trimmedShort = (shortName.trim() || suggestShortName(trimmedName)).toUpperCase();
              if (!trimmedName) {
                setFormError("Informe o nome do time.");
                return;
              }
              if (!trimmedShort) {
                setFormError("Informe o nome curto.");
                return;
              }
              setBusy(true);
              setFormError(null);
              try {
                let teamId = editing?.id;
                if (editing) {
                  const res = await fetch(`/api/teams/${editing.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: trimmedName,
                      shortName: trimmedShort,
                      primaryColor,
                      secondaryColor,
                    }),
                  });
                  if (!res.ok) {
                    const body = (await res.json().catch(() => null)) as { error?: string } | null;
                    throw new Error(body?.error ?? "Falha ao atualizar time");
                  }
                } else {
                  const res = await fetch("/api/teams", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: trimmedName,
                      shortName: trimmedShort,
                      primaryColor,
                      secondaryColor,
                    }),
                  });
                  const body = (await res.json()) as Team & { error?: string };
                  if (!res.ok || !body.id) {
                    throw new Error(body.error ?? "Falha ao criar time");
                  }
                  teamId = body.id;
                }
                if (logoFile && teamId) {
                  const fd = new FormData();
                  fd.append("logo", logoFile);
                  const logoRes = await fetch(`/api/teams/${teamId}/logo`, { method: "POST", body: fd });
                  if (!logoRes.ok) {
                    throw new Error("Time salvo, mas a logo falhou");
                  }
                }
                await loadTeams();
                await onSaved();
              } catch (err) {
                setFormError(err instanceof Error ? err.message : "Erro ao salvar");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "SALVANDO..." : "SALVAR"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ctrl-root">
      <header className="ctrl-top">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ←
        </button>
        <h1>TIMES ({teams.length})</h1>
        <Conn connected={connected} />
      </header>
      <div className="ctrl-list">
        {loading && <p>Carregando times...</p>}
        {loadError && <p className="ctrl-error">{loadError}</p>}
        {!loading && teams.length === 0 && (
          <p className="ctrl-error">Nenhum time cadastrado ainda.</p>
        )}
        {teams.map((t) => (
          <div key={t.id} className="ctrl-team-row">
            <div className="swatch" style={{ background: t.primaryColor }} />
            <div className="ctrl-team-info">
              <strong>{t.name}</strong>
              <small>{t.shortName}</small>
            </div>
            <button type="button" onClick={() => onPlayers(t)}>
              JOGADORES
            </button>
            <button type="button" onClick={() => onEdit(t)}>
              EDITAR
            </button>
          </div>
        ))}
        <button type="button" className="btn-ghost" onClick={() => void loadTeams()}>
          ATUALIZAR LISTA
        </button>
        <button type="button" className="btn-primary btn-lg" onClick={onNew}>
          + NOVO TIME
        </button>
      </div>
    </div>
  );
}

function PlayersScreen({
  connected,
  teamId,
  team,
  players,
  formMode,
  onBack,
  onNew,
  onSaved,
}: {
  connected: boolean;
  teamId: string;
  team?: Team;
  players: Player[];
  formMode: boolean;
  onBack: () => void;
  onNew: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [shirtNumber, setShirtNumber] = useState(10);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (formMode) {
    return (
      <div className="ctrl-root">
        <header className="ctrl-top">
          <button type="button" className="btn-ghost" onClick={() => void onSaved()}>
            ←
          </button>
          <h1>+ JOGADOR</h1>
          <Conn connected={connected} />
        </header>
        <div className="ctrl-form">
          <div className="field">
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Apelido</label>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
          <div className="field">
            <label>Número</label>
            <input
              type="number"
              value={shirtNumber}
              onChange={(e) => setShirtNumber(Number(e.target.value))}
            />
          </div>
          {formError && <p className="ctrl-error">{formError}</p>}
          <button
            type="button"
            className="btn-primary btn-lg"
            disabled={busy}
            onClick={async () => {
              if (!name.trim()) {
                setFormError("Informe o nome do jogador.");
                return;
              }
              setBusy(true);
              setFormError(null);
              try {
                const res = await fetch("/api/players", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    teamId,
                    name: name.trim(),
                    nickname: nickname.trim() || name.trim(),
                    shirtNumber,
                    active: true,
                  }),
                });
                const body = (await res.json().catch(() => null)) as { error?: string } | null;
                if (!res.ok) {
                  throw new Error(body?.error ?? "Falha ao salvar jogador");
                }
                await onSaved();
              } catch (err) {
                setFormError(err instanceof Error ? err.message : "Erro ao salvar");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "SALVANDO..." : "SALVAR"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ctrl-root">
      <header className="ctrl-top">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ←
        </button>
        <h1>{team?.name ?? "Jogadores"}</h1>
        <Conn connected={connected} />
      </header>
      <div className="ctrl-list">
        {players.map((p) => (
          <div key={p.id} className="ctrl-player-btn static">
            <span className="num">{p.shirtNumber}</span>
            <span>{p.nickname || p.name}</span>
          </div>
        ))}
        <button type="button" className="btn-primary btn-lg" onClick={onNew}>
          + NOVO JOGADOR
        </button>
      </div>
    </div>
  );
}
