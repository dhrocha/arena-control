import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { MatchMode, Player, Sport, Team } from "@shared/types/index";
import { setsToWin, type VolleyballFormat } from "@shared/sports/index";
import { useArenaSocket } from "../../hooks/useArenaSocket";
import { useMatchClock } from "../../hooks/useMatchClock";
import { useQrDataUrl } from "../../hooks/useQrDataUrl";
import { Scoreboard } from "../../components/scoreboard/Scoreboard";
import { VolleyballScoreboard } from "../../components/scoreboard/VolleyballScoreboard";
import { EffectLayer } from "../../components/effects/EffectLayer";
import { audioManager } from "../../infrastructure/audio/AudioManager";
import {
  defaultVolleyballFormConfig,
  sportTitle,
  type CreateMatchPayload,
} from "../../sports/ui";
import { describeEvent, formatEventTime } from "../../sports/eventLabels";
import "./admin.css";

export function AdminPage() {
  const { connected, state, lastEffect, send, error, refreshState } = useArenaSocket({
    role: "admin",
    label: "Central de Comando",
  });
  const match = state?.match ?? null;
  const clock = useMatchClock(match, state?.serverTime);
  const home = match ? state?.teams.find((t) => t.id === match.homeTeamId) : null;
  const away = match ? state?.teams.find((t) => t.id === match.awayTeamId) : null;
  const volley = match?.sportState?.sport === "VOLLEYBALL" ? match.sportState : null;
  const isVolleyball = match?.sport === "VOLLEYBALL";
  const controlUrl = state?.network.urls.control;
  const qr = useQrDataUrl(controlUrl);
  const [goalTeamId, setGoalTeamId] = useState<string | null>(null);
  const [tab, setTab] = useState<"command" | "teams" | "history">("command");
  const [history, setHistory] = useState<Array<{ match: typeof match; events: unknown[] }>>([]);
  const [flash, setFlash] = useState<string | null>(null);

  const safeSend = (cmd: Parameters<typeof send>[0]) => {
    audioManager.unlock();
    if (!send(cmd)) {
      setFlash("Sem conexão WebSocket. Recarregue a página.");
      return;
    }
  };

  useEffect(() => {
    if (!error) return;
    setFlash(error);
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!match) return;
      switch (e.key.toLowerCase()) {
        case " ":
          e.preventDefault();
          if (match.status === "playing") safeSend({ type: "MATCH_PAUSE" });
          else if (match.status === "paused" || match.status === "halftime") safeSend({ type: "MATCH_RESUME" });
          else if (match.status === "setup") safeSend({ type: "MATCH_START" });
          break;
        case "g":
          if (home) setGoalTeamId(home.id);
          break;
        case "m":
          break;
        case "s":
          if (match.status === "setup") safeSend({ type: "MATCH_START" });
          break;
        case "e":
          safeSend({ type: "MATCH_FINISH" });
          break;
        case "r":
          safeSend({ type: "TIMER_RESET" });
          break;
        case "escape":
          safeSend({ type: "CANCEL_EFFECT" });
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [match, home, safeSend]);

  const loadHistory = useCallback(async () => {
    const matches = (await fetch("/api/matches").then((r) => r.json())) as Array<NonNullable<typeof match>>;
    const rows = await Promise.all(
      matches.slice(0, 20).map(async (m) => ({
        match: m,
        events: await fetch(`/api/matches/${m.id}/events`).then((r) => r.json()),
      }))
    );
    setHistory(rows);
  }, []);

  useEffect(() => {
    if (tab === "history") void loadHistory();
  }, [tab, loadHistory]);

  const devices = state?.devices ?? [];
  const arenaOnline = devices.some((d) => d.role === "arena");
  const controllerOnline = devices.some((d) => d.role === "controller");

  return (
    <div className="admin-root">
      <aside className="admin-side">
        <div className="admin-brand">
          <span>ARENA</span>
          <strong>{state?.settings.arenaName ?? "Control"}</strong>
        </div>
        <nav>
          <button type="button" className={tab === "command" ? "on" : ""} onClick={() => setTab("command")}>
            Comando
          </button>
          <button type="button" className={tab === "teams" ? "on" : ""} onClick={() => setTab("teams")}>
            Times
          </button>
          <button type="button" className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>
            Histórico
          </button>
          <Link to="/effects">Efeitos</Link>
          <Link to="/sponsors">Patrocinadores</Link>
          <Link to="/settings">Configurações</Link>
          <Link to="/setup">Setup</Link>
          <Link to="/arena" target="_blank">
            Abrir Arena
          </Link>
        </nav>

        <div className="admin-status">
          <StatusRow label="SERVER" ok={connected} />
          <StatusRow label="ARENA" ok={arenaOnline} detail={devices.filter((d) => d.role === "arena").length} />
          <StatusRow
            label="CONTROLLER"
            ok={controllerOnline}
            detail={devices.filter((d) => d.role === "controller").length}
          />
          {devices.length > 0 && (
            <div className="admin-devices-list">
              {devices.map((d) => (
                <span key={d.id}>
                  {d.role}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="admin-qr panel">
          <h3>CONECTAR CELULAR</h3>
          {qr && <img src={qr} alt="QR Code controle" />}
          <code>{controlUrl}</code>
        </div>
      </aside>

      <main className="admin-main">
        {(error || flash) && <div className="admin-error">{flash ?? error}</div>}

        {tab === "command" && (
          <>
            <section className="admin-match panel">
              {match && home && away ? (
                <>
                  <div className="admin-scoreline">
                    <div>
                      <span style={{ color: home.secondaryColor }}>{home.name}</span>
                      <strong>{match.homeScore}</strong>
                      {isVolleyball && volley && (
                        <small className="admin-sets-won">{volley.homeSetsWon} sets</small>
                      )}
                    </div>
                    <div className="admin-clock-wrap">
                      <div className="admin-sport-badge">{sportTitle(match.sport)}</div>
                      <div className="admin-clock">
                        {isVolleyball && volley
                          ? volley.homeSetsWon === setsToWin(volley.config) - 1 &&
                            volley.awaySetsWon === setsToWin(volley.config) - 1
                            ? "SET DECISIVO"
                            : `SET ${volley.currentSet}`
                          : clock}
                      </div>
                      <small>
                        {match.mode === "gameday" ? "GAME DAY" : "PELADA"} · {match.status}
                      </small>
                    </div>
                    <div>
                      <span style={{ color: away.secondaryColor }}>{away.name}</span>
                      <strong>{match.awayScore}</strong>
                      {isVolleyball && volley && (
                        <small className="admin-sets-won">{volley.awaySetsWon} sets</small>
                      )}
                    </div>
                  </div>
                  <div className="admin-toolbar">
                    {match.status === "setup" && (
                      <button
                        type="button"
                        className="btn-primary btn-lg"
                        onClick={() => safeSend({ type: "MATCH_START" })}
                      >
                        INICIAR
                      </button>
                    )}
                    {match.status === "playing" && (
                      <button type="button" className="btn-lg" onClick={() => safeSend({ type: "MATCH_PAUSE" })}>
                        PAUSAR
                      </button>
                    )}
                    {match.status === "paused" && (
                      <button
                        type="button"
                        className="btn-primary btn-lg"
                        onClick={() => safeSend({ type: "MATCH_RESUME" })}
                      >
                        CONTINUAR
                      </button>
                    )}
                    {match.status === "halftime" && !isVolleyball && (
                      <button
                        type="button"
                        className="btn-primary btn-lg"
                        onClick={() => safeSend({ type: "SECOND_HALF" })}
                      >
                        2º TEMPO
                      </button>
                    )}
                    {isVolleyball && volley?.status === "SET_FINISHED" && (
                      <button
                        type="button"
                        className="btn-primary btn-lg"
                        onClick={() => safeSend({ type: "START_NEXT_SET" })}
                      >
                        INICIAR PRÓXIMO SET
                      </button>
                    )}
                    {isVolleyball && volley?.status === "TIMEOUT" && (
                      <button
                        type="button"
                        className="btn-primary btn-lg"
                        onClick={() => safeSend({ type: "TIMEOUT_END" })}
                      >
                        ENCERRAR TIMEOUT
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-danger btn-lg"
                      onClick={() => safeSend({ type: "MATCH_FINISH" })}
                    >
                      FINALIZAR
                    </button>
                    {isVolleyball ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => safeSend({ type: "UNDO_LAST_POINT" })}
                      >
                        DESFAZER PONTO
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => safeSend({ type: "UNDO_LAST_GOAL" })}
                      >
                        DESFAZER GOL
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <CreateMatchInline
                  teams={state?.teams ?? []}
                  defaultDuration={state?.settings.defaultDuration ?? 40}
                  onCreate={(payload) => safeSend({ type: "MATCH_CREATE", payload })}
                />
              )}
            </section>

            {match && home && away && !isVolleyball && (
              <section className="admin-teams-grid">
                <TeamGoalPanel
                  team={home}
                  players={(state?.players ?? []).filter((p) => p.teamId === home.id)}
                  selected={goalTeamId === home.id}
                  onAskGoal={() => setGoalTeamId(home.id)}
                  onGoal={(playerId) => {
                    safeSend({ type: "GOAL", payload: { teamId: home.id, playerId } });
                    setGoalTeamId(null);
                  }}
                  onCancel={() => setGoalTeamId(null)}
                />
                <TeamGoalPanel
                  team={away}
                  players={(state?.players ?? []).filter((p) => p.teamId === away.id)}
                  selected={goalTeamId === away.id}
                  onAskGoal={() => setGoalTeamId(away.id)}
                  onGoal={(playerId) => {
                    safeSend({ type: "GOAL", payload: { teamId: away.id, playerId } });
                    setGoalTeamId(null);
                  }}
                  onCancel={() => setGoalTeamId(null)}
                />
              </section>
            )}

            {match && home && away && isVolleyball && (
              <section className="admin-teams-grid">
                <TeamPointPanel
                  team={home}
                  serving={volley?.serverTeamId === home.id}
                  onPoint={() => safeSend({ type: "REGISTER_POINT", payload: { teamId: home.id } })}
                  onServe={() => safeSend({ type: "SET_SERVER", payload: { teamId: home.id } })}
                  onTimeout={() => safeSend({ type: "TIMEOUT_START", payload: { teamId: home.id } })}
                  disabled={
                    match.status === "setup" ||
                    match.status === "finished" ||
                    match.status === "countdown" ||
                    volley?.status === "SET_FINISHED" ||
                    volley?.status === "TIMEOUT"
                  }
                />
                <TeamPointPanel
                  team={away}
                  serving={volley?.serverTeamId === away.id}
                  onPoint={() => safeSend({ type: "REGISTER_POINT", payload: { teamId: away.id } })}
                  onServe={() => safeSend({ type: "SET_SERVER", payload: { teamId: away.id } })}
                  onTimeout={() => safeSend({ type: "TIMEOUT_START", payload: { teamId: away.id } })}
                  disabled={
                    match.status === "setup" ||
                    match.status === "finished" ||
                    match.status === "countdown" ||
                    volley?.status === "SET_FINISHED" ||
                    volley?.status === "TIMEOUT"
                  }
                />
              </section>
            )}

            <section className="admin-bottom admin-command-grid">
              <div className="panel">
                <h3 className="admin-section-title">EFEITOS / TELA</h3>
                <div className="admin-effects">
                  {(() => {
                    const status = match?.status;
                    const isSetup = status === "setup";
                    const isLive = status === "playing" || status === "paused";
                    const isHalftime = status === "halftime";
                    const isGameDay = match?.mode === "gameday";
                    const preMatch = isSetup && isGameDay;
                    const midMatch = isLive && isGameDay;

                    type FxBtn = {
                      key: string;
                      label: string;
                      disabled: boolean;
                      onClick: () => void;
                    };

                    const buttons: FxBtn[] = [
                      {
                        key: "start",
                        label: "INÍCIO",
                        disabled: !isSetup,
                        onClick: () => safeSend({ type: "MATCH_START" }),
                      },
                      {
                        key: "intro",
                        label: "APRESENTAR",
                        disabled: !preMatch,
                        onClick: () => safeSend({ type: "SHOW_TEAM_INTRO" }),
                      },
                      {
                        key: "countdown",
                        label: "COUNTDOWN",
                        disabled: !preMatch,
                        onClick: () => safeSend({ type: "SHOW_COUNTDOWN" }),
                      },
                      {
                        key: "halftime",
                        label: "INTERVALO",
                        disabled: !(isLive && match?.currentPeriod === 1),
                        onClick: () => safeSend({ type: "HALF_TIME" }),
                      },
                      {
                        key: "second",
                        label: "2º TEMPO",
                        disabled: !isHalftime,
                        onClick: () => safeSend({ type: "SECOND_HALF" }),
                      },
                      {
                        key: "penalty",
                        label: "PÊNALTI",
                        disabled: !midMatch,
                        onClick: () =>
                          safeSend({ type: "TRIGGER_EFFECT", payload: { effectType: "PENALTY" } }),
                      },
                      {
                        key: "card",
                        label: "CARTÃO",
                        disabled: !midMatch,
                        onClick: () => safeSend({ type: "TRIGGER_EFFECT", payload: { effectType: "CARD" } }),
                      },
                      {
                        key: "mvp",
                        label: "CRAQUE",
                        disabled: !match || !isGameDay,
                        onClick: () => {
                          const first = state?.players.find(
                            (p) => p.teamId === match?.homeTeamId || p.teamId === match?.awayTeamId
                          );
                          if (first) safeSend({ type: "SELECT_MVP", payload: { playerId: first.id } });
                          else setFlash("Cadastre jogadores para escolher o Craque");
                        },
                      },
                      {
                        key: "end",
                        label: "FIM",
                        disabled: !match || status === "setup" || status === "countdown",
                        onClick: () => safeSend({ type: "MATCH_FINISH" }),
                      },
                      {
                        key: "scoreboard",
                        label: "PLACAR",
                        disabled: !match,
                        onClick: () => safeSend({ type: "SHOW_SCOREBOARD" }),
                      },
                      {
                        key: "sponsors",
                        label: "PATROCÍNIOS",
                        disabled: false,
                        onClick: () => safeSend({ type: "SHOW_SPONSORS" }),
                      },
                      {
                        key: "clear",
                        label: "LIMPAR",
                        disabled: false,
                        onClick: () => safeSend({ type: "CANCEL_EFFECT" }),
                      },
                    ];

                    return buttons.map((btn) => (
                      <button key={btn.key} type="button" disabled={btn.disabled} onClick={btn.onClick}>
                        {btn.label}
                      </button>
                    ));
                  })()}
                </div>
                <p className="admin-fx-hint">Gol com jogador: use + GOL nos times acima.</p>
              </div>

              <div className="panel admin-preview">
                <h3 className="admin-section-title">PREVIEW ARENA</h3>
                <div className="preview-frame">
                  {match &&
                    home &&
                    away &&
                    !lastEffect &&
                    (state?.arenaView ?? "scoreboard") !== "idle" &&
                    (match.sport === "VOLLEYBALL" ? (
                      <VolleyballScoreboard home={home} away={away} match={match} serverTime={state?.serverTime} compact />
                    ) : (
                      <Scoreboard home={home} away={away} match={match} serverTime={state?.serverTime} compact />
                    ))}
                  {(!match || (state?.arenaView === "idle" && !lastEffect)) && (
                    <div className="preview-empty">{match ? "TELA LIMPA" : "SEM PARTIDA"}</div>
                  )}
                  <EffectLayer effect={lastEffect} state={state} />
                </div>
              </div>
            </section>

            {match && (
              <section className="panel admin-events-panel">
                <h3 className="admin-section-title">EVENTOS</h3>
                <ul className="admin-events">
                  {(state?.events ?? [])
                    .slice()
                    .reverse()
                    .slice(0, 12)
                    .map((ev) => {
                      return (
                        <li key={ev.id}>
                          <code>{formatEventTime(ev.matchTime)}</code>
                          <span>
                            {describeEvent(ev, state?.teams ?? [], state?.players ?? [])}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </section>
            )}
          </>
        )}

        {tab === "teams" && (
          <AdminTeams
            stateTeams={state?.teams ?? []}
            statePlayers={state?.players ?? []}
            onChanged={() => void refreshState()}
          />
        )}

        {tab === "history" && (
          <section className="panel">
            <h3>HISTÓRICO</h3>
            <div className="admin-history">
              {history.map(({ match: m, events }) => {
                if (!m) return null;
                const h = state?.teams.find((t) => t.id === m.homeTeamId);
                const a = state?.teams.find((t) => t.id === m.awayTeamId);
                const volley = m.sport === "VOLLEYBALL" ? m.sportState : null;
                const finishedSets =
                  volley?.sets.filter((s) => s.status === "FINISHED") ?? [];
                return (
                  <article key={m.id}>
                    <header>
                      <strong>
                        {new Date(m.createdAt).toLocaleDateString("pt-BR")} · {sportTitle(m.sport)} ·{" "}
                        {m.mode.toUpperCase()}
                      </strong>
                      {volley ? (
                        <span>
                          {h?.name ?? "?"} {volley.homeSetsWon} × {volley.awaySetsWon} {a?.name ?? "?"}
                        </span>
                      ) : (
                        <span>
                          {h?.name ?? "?"} {m.homeScore} × {m.awayScore} {a?.name ?? "?"}
                        </span>
                      )}
                    </header>
                    {finishedSets.length > 0 && (
                      <div className="admin-history-sets">
                        <em>SETS</em>
                        {finishedSets.map((s) => (
                          <span key={s.number}>
                            {s.homeScore} — {s.awayScore}
                          </span>
                        ))}
                      </div>
                    )}
                    <ul>
                      {(events as Array<{
                        id: string;
                        type: string;
                        matchTime: number;
                        teamId?: string | null;
                        playerId?: string | null;
                        metadata?: Record<string, unknown> | null;
                      }>).map((ev) => (
                        <li key={ev.id}>
                          {formatEventTime(ev.matchTime)}{" "}
                          {describeEvent(
                            {
                              type: ev.type as never,
                              teamId: ev.teamId ?? null,
                              playerId: ev.playerId ?? null,
                              metadata: ev.metadata ?? null,
                            },
                            state?.teams ?? [],
                            state?.players ?? []
                          )}
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail?: number }) {
  return (
    <div className="status-row">
      <span className={`conn-dot ${ok ? "on" : ""}`} />
      <span>{label}</span>
      <em>{ok ? (detail != null ? `ONLINE · ${detail}` : "ONLINE") : "OFFLINE"}</em>
    </div>
  );
}

function CreateMatchInline({
  teams,
  defaultDuration,
  onCreate,
}: {
  teams: Team[];
  defaultDuration: number;
  onCreate: (p: CreateMatchPayload) => void;
}) {
  const [sport, setSport] = useState<Sport>("FOOTBALL");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [mode, setMode] = useState<MatchMode>("gameday");
  const [duration, setDuration] = useState(defaultDuration);
  const [volleyCfg, setVolleyCfg] = useState(defaultVolleyballFormConfig);

  const submit = () => {
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

  return (
    <div>
      <h2>Nova partida</h2>
      <p className="admin-fx-hint">Escolha o esporte e os times. Nada é pré-preenchido da partida anterior.</p>

      <div className="field">
        <label>Esporte</label>
        <div className="admin-sport-pick">
          <button
            type="button"
            className={sport === "FOOTBALL" ? "on" : ""}
            onClick={() => setSport("FOOTBALL")}
          >
            ⚽ Futebol
          </button>
          <button
            type="button"
            className={sport === "VOLLEYBALL" ? "on" : ""}
            onClick={() => setSport("VOLLEYBALL")}
          >
            🏐 Vôlei
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label>Time casa</label>
          <select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}>
            <option value="">Selecione...</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Time fora</label>
          <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
            <option value="">Selecione...</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id} disabled={t.id === homeTeamId}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Modo</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as MatchMode)}>
            <option value="pelada">Pelada</option>
            <option value="gameday">Game Day</option>
          </select>
        </div>
        {sport === "FOOTBALL" ? (
          <div className="field">
            <label>Duração (min)</label>
            <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
        ) : (
          <div className="field">
            <label>Formato</label>
            <select
              value={volleyCfg.format}
              onChange={(e) =>
                setVolleyCfg((c) => ({ ...c, format: e.target.value as VolleyballFormat }))
              }
            >
              <option value="BEST_OF_3">Melhor de 3</option>
              <option value="BEST_OF_5">Melhor de 5</option>
            </select>
          </div>
        )}
      </div>

      {sport === "VOLLEYBALL" && (
        <div className="grid-3">
          <div className="field">
            <label>Sets normais</label>
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
            <label>Set decisivo</label>
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
            <label>Diferença mín.</label>
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
            <label>Timeout (seg)</label>
            <input
              type="number"
              min={1}
              value={volleyCfg.timeoutSeconds}
              onChange={(e) =>
                setVolleyCfg((c) => ({ ...c, timeoutSeconds: Number(e.target.value) || 30 }))
              }
            />
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn-primary btn-lg"
        disabled={teams.length < 2 || !homeTeamId || !awayTeamId || homeTeamId === awayTeamId}
        onClick={submit}
      >
        CRIAR PARTIDA
      </button>
    </div>
  );
}

function TeamPointPanel({
  team,
  serving,
  onPoint,
  onServe,
  onTimeout,
  disabled,
}: {
  team: Team;
  serving: boolean;
  onPoint: () => void;
  onServe: () => void;
  onTimeout: () => void;
  disabled: boolean;
}) {
  return (
    <div className="panel team-goal-panel" style={{ borderColor: team.primaryColor }}>
      <h3>
        {team.name} {serving ? <em className="admin-serving">● SERVE</em> : null}
      </h3>
      <button
        type="button"
        className="btn-primary btn-lg"
        style={{ background: team.primaryColor, color: team.secondaryColor }}
        disabled={disabled}
        onClick={onPoint}
      >
        + PONTO
      </button>
      <div className="admin-point-actions">
        <button type="button" className="btn-ghost" disabled={disabled} onClick={onServe}>
          SAQUE
        </button>
        <button type="button" className="btn-ghost" disabled={disabled} onClick={onTimeout}>
          TIMEOUT
        </button>
      </div>
    </div>
  );
}

function TeamGoalPanel({
  team,
  players,
  selected,
  onAskGoal,
  onGoal,
  onCancel,
}: {
  team: Team;
  players: Player[];
  selected: boolean;
  onAskGoal: () => void;
  onGoal: (playerId?: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="panel team-goal-panel" style={{ borderColor: team.primaryColor }}>
      <h3>{team.name}</h3>
      {!selected ? (
        <button
          type="button"
          className="btn-primary btn-lg"
          style={{ background: team.primaryColor, color: team.secondaryColor }}
          onClick={onAskGoal}
        >
          + GOL
        </button>
      ) : (
        <div className="admin-player-pick">
          {players.map((p) => (
            <button key={p.id} type="button" onClick={() => onGoal(p.id)}>
              {p.shirtNumber} {p.nickname || p.name}
            </button>
          ))}
          <button type="button" className="btn-ghost" onClick={() => onGoal()}>
            Sem jogador
          </button>
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

function AdminTeams({
  stateTeams,
  statePlayers,
  onChanged,
}: {
  stateTeams: Team[];
  statePlayers: Player[];
  onChanged: () => void;
}) {
  const [teams, setTeams] = useState<Team[]>(stateTeams);
  const [players, setPlayers] = useState<Player[]>(statePlayers);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [shortTouched, setShortTouched] = useState(false);
  const [primaryColor, setPrimaryColor] = useState("#111111");
  const [secondaryColor, setSecondaryColor] = useState("#f5c518");
  const [playerName, setPlayerName] = useState("");
  const [playerNick, setPlayerNick] = useState("");
  const [shirt, setShirt] = useState(9);
  const [teamId, setTeamId] = useState(stateTeams[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = async () => {
    const [nextTeams, nextPlayers] = await Promise.all([
      fetch("/api/teams").then((r) => r.json()) as Promise<Team[]>,
      fetch("/api/players").then((r) => r.json()) as Promise<Player[]>,
    ]);
    setTeams(nextTeams);
    setPlayers(nextPlayers);
    if (!teamId && nextTeams[0]) setTeamId(nextTeams[0].id);
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (stateTeams.length > 0) setTeams(stateTeams);
    if (statePlayers.length > 0) setPlayers(statePlayers);
  }, [stateTeams, statePlayers]);

  useEffect(() => {
    if (!teamId && teams[0]) setTeamId(teams[0].id);
  }, [teams, teamId]);

  const suggest = (value: string) => {
    const cleaned = value.trim().replace(/\s+/g, " ");
    if (!cleaned) return "";
    const parts = cleaned.split(" ");
    if (parts.length === 1) return parts[0].slice(0, 6).toUpperCase();
    return parts
      .slice(0, 3)
      .map((p) => p[0] ?? "")
      .join("")
      .toUpperCase();
  };

  return (
    <div className="admin-teams-admin">
      <section className="panel">
        <h3>Novo time</h3>
        <div className="grid-2">
          <div className="field">
            <label>Nome</label>
            <input
              value={name}
              onChange={(e) => {
                const next = e.target.value;
                setName(next);
                if (!shortTouched) setShortName(suggest(next));
              }}
            />
          </div>
          <div className="field">
            <label>Curto</label>
            <input
              value={shortName}
              onChange={(e) => {
                setShortTouched(true);
                setShortName(e.target.value.toUpperCase());
              }}
            />
          </div>
          <div className="field">
            <label>Primária</label>
            <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
          </div>
          <div className="field">
            <label>Secundária</label>
            <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} />
          </div>
        </div>
        {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
        {msg && <p style={{ color: "var(--ok)" }}>{msg}</p>}
        <button
          type="button"
          className="btn-primary"
          onClick={async () => {
            setErr(null);
            setMsg(null);
            const trimmedName = name.trim();
            const trimmedShort = (shortName.trim() || suggest(trimmedName)).toUpperCase();
            if (!trimmedName || !trimmedShort) {
              setErr("Preencha nome e nome curto.");
              return;
            }
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
            const body = (await res.json().catch(() => null)) as { error?: string; id?: string } | null;
            if (!res.ok || !body?.id) {
              setErr(body?.error ?? "Falha ao salvar time");
              return;
            }
            setName("");
            setShortName("");
            setShortTouched(false);
            setMsg(`Time "${trimmedName}" salvo.`);
            await reload();
            onChanged();
          }}
        >
          Salvar time
        </button>
      </section>

      <section className="panel">
        <h3>Novo jogador</h3>
        <div className="field">
          <label>Time</label>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Nome</label>
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
          </div>
          <div className="field">
            <label>Apelido</label>
            <input value={playerNick} onChange={(e) => setPlayerNick(e.target.value)} />
          </div>
          <div className="field">
            <label>Número</label>
            <input type="number" value={shirt} onChange={(e) => setShirt(Number(e.target.value))} />
          </div>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={async () => {
            setErr(null);
            setMsg(null);
            if (!teamId || !playerName.trim()) {
              setErr("Selecione o time e informe o nome.");
              return;
            }
            const res = await fetch("/api/players", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                teamId,
                name: playerName.trim(),
                nickname: playerNick.trim() || playerName.trim(),
                shirtNumber: shirt,
                active: true,
              }),
            });
            if (!res.ok) {
              const body = (await res.json().catch(() => null)) as { error?: string } | null;
              setErr(body?.error ?? "Falha ao salvar jogador");
              return;
            }
            setPlayerName("");
            setPlayerNick("");
            setMsg("Jogador salvo.");
            await reload();
            onChanged();
          }}
        >
          Salvar jogador
        </button>
      </section>

      <section className="panel">
        <h3>Cadastrados ({teams.length})</h3>
        <button type="button" className="btn-ghost" onClick={() => void reload()}>
          Atualizar lista
        </button>
        {teams.map((t) => (
          <div key={t.id} className="admin-team-block">
            <strong style={{ color: t.secondaryColor }}>{t.name}</strong>
            <ul>
              {players
                .filter((p) => p.teamId === t.id)
                .map((p) => (
                  <li key={p.id}>
                    {p.shirtNumber} · {p.nickname || p.name}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
