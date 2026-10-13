import { useEffect, useState } from "react";
import { formatCountdownMs, getPeladaSessionRemainingMs } from "@shared/pelada/clock";
import { useArenaSocket } from "../../hooks/useArenaSocket";
import { Scoreboard } from "../../components/scoreboard/Scoreboard";
import { VolleyballScoreboard } from "../../components/scoreboard/VolleyballScoreboard";
import {
  PeladaAdOverlay,
  PeladaScoreboard,
} from "../../components/scoreboard/PeladaScoreboard";
import { EffectLayer } from "../../components/effects/EffectLayer";
import {
  HorizontalSponsorLayout,
  useLocalClock,
} from "../../components/sponsors/HorizontalSponsorLayout";
import { TimeoutSponsorSplit } from "../../components/sponsors/TimeoutSponsorSplit";
import { SponsorMedia } from "../../components/sponsors/SponsorMedia";
import { audioManager } from "../../infrastructure/audio/AudioManager";
import { useCountdownEndsAt } from "../../hooks/useCountdownEndsAt";
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

function useNow(tickMs = 250): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

export function ArenaPage() {
  const { connected, state, lastEffect } = useArenaSocket({ role: "arena" });
  const [ready, setReady] = useState(false);
  const [playedKey, setPlayedKey] = useState<string | null>(null);
  const clock = useLocalClock();
  const now = useNow();

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
  const pelada = state?.peladaSession ?? null;
  const home = match ? state?.teams.find((t) => t.id === match.homeTeamId) : null;
  const away = match ? state?.teams.find((t) => t.id === match.awayTeamId) : null;
  const volley = match?.sport === "VOLLEYBALL" ? match.sportState : null;
  const isTimeout = volley?.status === "TIMEOUT";
  const timeoutLeft = useCountdownEndsAt(isTimeout ? volley?.timeoutEndsAt : null);

  const isMicroPoint = lastEffect?.type === "VOLLEY_POINT";
  const isPeladaBuzzer = Boolean(lastEffect?.metadata?.peladaBuzzer);
  const idleFx = !lastEffect || isMicroPoint || isPeladaBuzzer;
  const arenaView = state?.arenaView ?? "scoreboard";
  const sponsorDisplay = state?.sponsorDisplay ?? null;

  const currentSponsorId =
    sponsorDisplay && sponsorDisplay.playlist.length
      ? sponsorDisplay.playlist[sponsorDisplay.index]
      : null;
  const currentSponsor = currentSponsorId
    ? state?.sponsors.find((s) => s.id === currentSponsorId)
    : null;
  const timeoutSponsor = state?.timeoutSponsorId
    ? state.sponsors.find((s) => s.id === state.timeoutSponsorId)
    : null;

  const peladaAdSponsor = pelada?.ad
    ? state?.sponsors.find((s) => s.id === pelada.ad!.sponsorId)
    : null;
  const peladaMaster = pelada?.masterSponsorId
    ? state?.sponsors.find((s) => s.id === pelada.masterSponsorId)
    : null;

  const showPelada =
    Boolean(pelada) &&
    idleFx &&
    pelada!.phase !== "expired";

  const showPeladaAd = showPelada && Boolean(pelada?.ad) && pelada!.phase === "playing";
  const showPeladaMaster =
    showPelada &&
    !showPeladaAd &&
    (pelada!.phase === "lobby" ||
      pelada!.phase === "paused" ||
      pelada!.phase === "between_games");
  const showPeladaScoreboard =
    showPelada && !showPeladaAd && !showPeladaMaster && pelada!.phase === "playing";

  const showSponsorCarousel =
    !showPelada &&
    idleFx &&
    arenaView === "sponsor_carousel" &&
    sponsorDisplay &&
    currentSponsor;
  const showTimeoutSplit =
    !showPelada &&
    idleFx &&
    match &&
    isTimeout &&
    arenaView === "scoreboard" &&
    !showSponsorCarousel;
  const showScoreboard =
    !showPelada &&
    idleFx &&
    match &&
    arenaView === "scoreboard" &&
    !isTimeout &&
    !showSponsorCarousel;
  const showIdle =
    !showPelada &&
    !lastEffect &&
    !showSponsorCarousel &&
    !showTimeoutSplit &&
    (arenaView === "idle" || !match);

  const timeoutTeam =
    isTimeout && volley?.timeoutTeamId
      ? state?.teams.find((t) => t.id === volley.timeoutTeamId)
      : null;

  const enterFullscreen = async () => {
    audioManager.unlock();
    setReady(true);
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // fullscreen may be blocked; still unlock audio
    }
  };

  const arenaName = state?.settings.arenaName ?? "ARENA";
  const advertisePhone = state?.settings.advertisePhone ?? "(11) 99999-9999";

  const halftimeTop = {
    left: "INTERVALO",
    center: currentSponsor
      ? `Apresentado por · ${currentSponsor.name}`
      : "Apresentado por",
    right: clock.time,
  };

  const halftimeBottom = match
    ? {
        left: home?.shortName ?? "CASA",
        center: `${match.homeScore} — ${match.awayScore}`,
        right: away?.shortName ?? "FORA",
      }
    : {
        left: arenaName,
        center: clock.date,
        right: clock.time,
      };

  return (
    <div className="arena-root">
      <div className="arena-bg" />
      {!ready && (
        <div className="arena-gate">
          <h1>ARENA SCREEN</h1>
          <p>{arenaName}</p>
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
            {showPeladaAd && pelada && (
              <PeladaAdOverlay
                session={pelada}
                now={now}
                sponsorNode={<SponsorMedia sponsor={peladaAdSponsor} />}
              />
            )}
            {showPeladaMaster && pelada && (
              <HorizontalSponsorLayout
                mode="idle"
                sponsor={peladaMaster}
                bottomStrip={{
                  left:
                    pelada.phase === "paused"
                      ? "PAUSADO"
                      : pelada.phase === "lobby"
                        ? "AGUARDANDO"
                        : "TROCA DE TIMES",
                  center: `${pelada.team1Score} — ${pelada.team2Score}`,
                  right: formatCountdownMs(getPeladaSessionRemainingMs(pelada, now)),
                }}
              />
            )}
            {showPeladaScoreboard && pelada && (
              <PeladaScoreboard session={pelada} advertisePhone={advertisePhone} now={now} />
            )}

            {showSponsorCarousel && sponsorDisplay && (
              <HorizontalSponsorLayout
                mode={sponsorDisplay.mode}
                sponsor={currentSponsor}
                topStrip={sponsorDisplay.mode === "halftime" ? halftimeTop : undefined}
                bottomStrip={
                  sponsorDisplay.mode === "halftime"
                    ? halftimeBottom
                    : {
                        left: arenaName,
                        center: clock.date,
                        right: clock.time,
                      }
                }
              />
            )}
            {showTimeoutSplit && match && (
              <TimeoutSponsorSplit
                match={match}
                home={home}
                away={away}
                sponsor={timeoutSponsor}
                countdownSeconds={timeoutLeft}
                timeoutTeamName={timeoutTeam?.shortName}
              />
            )}
            {showScoreboard &&
              (match.sport === "VOLLEYBALL" ? (
                <VolleyballScoreboard home={home} away={away} match={match} />
              ) : (
                <Scoreboard home={home} away={away} match={match} />
              ))}
            {showIdle && (
              <div className="arena-idle">
                <div className="arena-idle-title">{arenaName}</div>
                <div className="arena-idle-sub">{clock.time}</div>
              </div>
            )}
            <EffectLayer effect={isPeladaBuzzer ? null : lastEffect} state={state} />
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
