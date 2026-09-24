import { useEffect, useState } from "react";
import { useArenaSocket } from "../../hooks/useArenaSocket";
import { Scoreboard } from "../../components/scoreboard/Scoreboard";
import { VolleyballScoreboard } from "../../components/scoreboard/VolleyballScoreboard";
import { EffectLayer } from "../../components/effects/EffectLayer";
import { audioManager } from "../../infrastructure/audio/AudioManager";
import "./arena.css";

const AUDIO_URLS = [
  "/audio/goal.mp3",
  "/audio/match-start.mp3",
  "/audio/countdown.mp3",
  "/audio/halftime.mp3",
  "/audio/match-end.mp3",
  "/audio/mvp.mp3",
  "/audio/card.mp3",
  "/audio/penalty.mp3",
  "/audio/volleyball-point.mp3",
  "/audio/volleyball-set-point.mp3",
  "/audio/volleyball-deuce.mp3",
  "/audio/volleyball-set-win.mp3",
  "/audio/volleyball-match-point.mp3",
  "/audio/volleyball-timeout.mp3",
  "/audio/volleyball-match-win.mp3",
  "/audio/volleyball-mvp.mp3",
  "/audio/volleyball-set-start.mp3",
  "/audio/volleyball-match-start.mp3",
];

export function ArenaPage() {
  const { connected, state, lastEffect } = useArenaSocket({ role: "arena" });
  const [ready, setReady] = useState(false);
  const [playedKey, setPlayedKey] = useState<string | null>(null);

  useEffect(() => {
    void audioManager.preload(AUDIO_URLS);
  }, []);

  useEffect(() => {
    if (state?.settings) {
      audioManager.setVolumes(state.settings.volumeMaster, state.settings.volumeEffects);
    }
  }, [state?.settings]);

  useEffect(() => {
    if (!lastEffect || !ready) return;
    const key = `${lastEffect.type}-${lastEffect.startedAt}`;
    if (key === playedKey) return;
    setPlayedKey(key);
    audioManager.play(lastEffect.sound);
  }, [lastEffect, ready, playedKey]);

  const match = state?.match ?? null;
  const home = match ? state?.teams.find((t) => t.id === match.homeTeamId) : null;
  const away = match ? state?.teams.find((t) => t.id === match.awayTeamId) : null;
  const isMicroPoint = lastEffect?.type === "VOLLEY_POINT";
  const idle = !lastEffect || isMicroPoint;
  const showScoreboard = idle && match && (state?.arenaView ?? "scoreboard") !== "idle";
  const showIdle = !lastEffect && (!match || (state?.arenaView ?? "scoreboard") === "idle");

  const enterFullscreen = async () => {
    audioManager.unlock();
    setReady(true);
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // fullscreen may be blocked; still unlock audio
    }
  };

  return (
    <div className="arena-root">
      <div className="arena-bg" />
      {!ready && (
        <div className="arena-gate">
          <h1>ARENA SCREEN</h1>
          <p>{state?.settings.arenaName ?? "Arena Control"}</p>
          <button className="btn-primary btn-lg" type="button" onClick={() => void enterFullscreen()}>
            ENTRAR EM TELA CHEIA
          </button>
          <div className="conn-pill" style={{ marginTop: "1rem" }}>
            <span className={`conn-dot ${connected ? "on" : ""}`} />
            {connected ? "CONECTADO" : "DESCONECTADO"}
          </div>
        </div>
      )}

      {ready && (
        <>
          <div className="arena-stage">
            {showScoreboard &&
              (match.sport === "VOLLEYBALL" ? (
                <VolleyballScoreboard home={home} away={away} match={match} />
              ) : (
                <Scoreboard home={home} away={away} match={match} />
              ))}
            {showIdle && (
              <div className="arena-idle">
                <div className="arena-idle-title">{state?.settings.arenaName ?? "ARENA"}</div>
                <div className="arena-idle-sub">{match ? "TELA LIMPA" : "AGUARDANDO PARTIDA"}</div>
              </div>
            )}
            <EffectLayer effect={lastEffect} state={state} />
          </div>
          <div className="arena-hud">
            <span className={`conn-dot ${connected ? "on" : ""}`} />
            {!document.fullscreenElement && (
              <button type="button" className="btn-ghost" onClick={() => void enterFullscreen()}>
                TELA CHEIA
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
