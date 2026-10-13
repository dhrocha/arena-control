import { AnimatePresence, motion } from "framer-motion";
import type { AppState, EffectPayload, EffectType, Player, Sponsor, Team } from "@shared/types/index";
import { displayText } from "../../lib/displayLabels";
import { SponsorMedia } from "../sponsors/SponsorMedia";
import "../sponsors/sponsors-display.css";
import "./effects.css";

interface Props {
  effect: EffectPayload | null;
  state: AppState | null;
}

export function EffectLayer({ effect, state }: Props) {
  if (!effect || !state) return null;

  const team = effect.teamId ? state.teams.find((t) => t.id === effect.teamId) : null;
  const player = effect.playerId ? state.players.find((p) => p.id === effect.playerId) : null;
  const homeId =
    state.match?.homeTeamId ?? (typeof effect.metadata?.homeTeamId === "string" ? effect.metadata.homeTeamId : null);
  const awayId =
    state.match?.awayTeamId ?? (typeof effect.metadata?.awayTeamId === "string" ? effect.metadata.awayTeamId : null);
  const home = homeId ? state.teams.find((t) => t.id === homeId) : null;
  const away = awayId ? state.teams.find((t) => t.id === awayId) : null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${effect.type}-${effect.startedAt}`}
        className={`effect-layer ${isMicroEffect(effect.type) ? "micro" : ""}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: isMicroEffect(effect.type) ? 0.12 : 0.2 }}
      >
        {effect.type === "GOAL" && <GoalEffect effect={effect} team={team} player={player} />}
        {effect.type === "COUNTDOWN" && <CountdownEffect value={effect.countdownValue ?? 0} />}
        {effect.type === "TEAM_INTRO" && <TeamIntroEffect home={home} away={away} />}
        {effect.type === "MATCH_START" && (
          <BannerEffect text={displayText(effect.text, "INÍCIO")} accent={effect.secondaryColor} />
        )}
        {effect.type === "HALF_TIME" && (
          <ScoreBanner
            title={displayText(effect.text, "INTERVALO")}
            home={home}
            away={away}
            homeScore={effect.homeScore ?? state.match?.homeScore ?? 0}
            awayScore={effect.awayScore ?? state.match?.awayScore ?? 0}
          />
        )}
        {effect.type === "MATCH_END" && (
          <MatchEndEffect
            home={home}
            away={away}
            homeScore={effect.homeScore ?? state.match?.homeScore ?? 0}
            awayScore={effect.awayScore ?? state.match?.awayScore ?? 0}
          />
        )}
        {(effect.type === "MVP" || effect.type === "VOLLEY_MVP") && (
          <MvpEffect team={team} player={player} />
        )}
        {effect.type === "MVP_TEASE" && (
          <MvpTeaseEffect text={displayText(effect.text, "O CRAQUE DA PARTIDA")} />
        )}
        {effect.type === "MVP_SPONSOR" && (
          <MvpSponsorEffect
            text={displayText(effect.text, "APRESENTADO POR")}
            sponsor={
              typeof effect.metadata?.sponsorId === "string"
                ? state.sponsors.find((s) => s.id === effect.metadata?.sponsorId)
                : undefined
            }
            sponsorName={
              typeof effect.metadata?.sponsorName === "string"
                ? effect.metadata.sponsorName
                : undefined
            }
          />
        )}
        {(effect.type === "PENALTY" || effect.type === "CARD" || effect.type === "CUSTOM") && (
          <BannerEffect text={displayText(effect.text, effect.type)} accent={effect.secondaryColor} />
        )}

        {effect.type === "VOLLEY_POINT" && (
          <VolleyPointEffect
            effect={effect}
            team={team}
            player={player}
            home={home}
            away={away}
          />
        )}
        {effect.type === "VOLLEY_SET_POINT" && (
          <VolleySpecialBanner
            label="PONTO DE SET"
            effect={effect}
            team={team}
            home={home}
            away={away}
            tone="set"
          />
        )}
        {effect.type === "VOLLEY_MATCH_POINT" && (
          <VolleySpecialBanner
            label="PONTO DE PARTIDA"
            effect={effect}
            team={team}
            home={home}
            away={away}
            tone="match"
          />
        )}
        {effect.type === "VOLLEY_DEUCE" && (
          <VolleySpecialBanner
            label="EMPATE"
            effect={effect}
            team={null}
            home={home}
            away={away}
            tone="deuce"
          />
        )}
        {effect.type === "VOLLEY_TIMEOUT" && (
          <VolleySpecialBanner
            label="TEMPO"
            effect={effect}
            team={team}
            home={home}
            away={away}
            tone="timeout"
          />
        )}
        {effect.type === "VOLLEY_SET_END" && (
          <VolleySetEndEffect effect={effect} team={team} home={home} away={away} />
        )}
        {effect.type === "VOLLEY_MATCH_END" && (
          <VolleyMatchEndEffect effect={effect} team={team} home={home} away={away} />
        )}
        {effect.type === "VOLLEY_MATCH_START" && (
          <VolleyMatchStartEffect home={home} away={away} text={effect.text} />
        )}
        {effect.type === "VOLLEY_SET_START" && (
          <VolleySetStartEffect effect={effect} home={home} away={away} />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function isMicroEffect(type: EffectType): boolean {
  return type === "VOLLEY_POINT";
}

function VolleyPointEffect({
  effect,
  team,
  player,
  home,
  away,
}: {
  effect: EffectPayload;
  team?: Team | null;
  player?: Player | null;
  home?: Team | null;
  away?: Team | null;
}) {
  return (
    <div className="fx-volley-point">
      <motion.div
        className="fx-volley-point-score"
        initial={{ scale: 0.7, opacity: 0, y: 12 }}
        animate={{ scale: 1.08, opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        style={{
          textShadow: `0 0 28px ${effect.secondaryColor || team?.secondaryColor || "#f5c518"}88`,
          color: effect.secondaryColor || team?.secondaryColor || "#fff",
        }}
      >
        {effect.homeScore ?? 0}
        <span>—</span>
        {effect.awayScore ?? 0}
      </motion.div>
      <motion.div
        className="fx-volley-point-meta"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.08 }}
      >
        <strong>{team?.shortName ?? "PONTO"}</strong>
        {player && <span>#{player.shirtNumber} {player.nickname || player.name}</span>}
        <small>
          {home?.shortName} · {away?.shortName}
        </small>
      </motion.div>
    </div>
  );
}

function VolleySpecialBanner({
  label,
  effect,
  team,
  home,
  away,
  tone,
}: {
  label: string;
  effect: EffectPayload;
  team?: Team | null;
  home?: Team | null;
  away?: Team | null;
  tone: "set" | "match" | "deuce" | "timeout";
}) {
  const timeoutSeconds =
    typeof effect.metadata?.timeoutSeconds === "number" ? effect.metadata.timeoutSeconds : null;
  return (
    <div className={`fx-volley-special ${tone}`}>
      <motion.div
        className="fx-volley-special-label"
        initial={{ y: -20, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 16 }}
      >
        {displayText(effect.text, label)}
      </motion.div>
      {team && <div className="fx-volley-special-team">{team.name}</div>}
      {tone === "timeout" && timeoutSeconds != null && (
        <div className="fx-volley-special-timeout">{timeoutSeconds}s</div>
      )}
      <div className="fx-volley-special-score">
        <span>{home?.shortName ?? "CASA"}</span>
        <strong>
          {effect.homeScore ?? 0} — {effect.awayScore ?? 0}
        </strong>
        <span>{away?.shortName ?? "FORA"}</span>
      </div>
    </div>
  );
}

function VolleySetEndEffect({
  effect,
  team,
  home,
  away,
}: {
  effect: EffectPayload;
  team?: Team | null;
  home?: Team | null;
  away?: Team | null;
}) {
  const setsHome = Number(effect.metadata?.homeSetsWon ?? 0);
  const setsAway = Number(effect.metadata?.awaySetsWon ?? 0);
  return (
    <div
      className="fx-volley-set-end"
      style={{
        background: `radial-gradient(circle at 40% 30%, ${(team?.secondaryColor ?? "#f5c518")}33, transparent 50%), linear-gradient(160deg, ${team?.primaryColor ?? "#111"}, #05070b)`,
      }}
    >
      <motion.div
        className="fx-volley-set-end-logo"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 160, damping: 14 }}
      >
        {team?.logo ? <img src={team.logo} alt="" /> : <span>{team?.shortName}</span>}
      </motion.div>
      <motion.h1 initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.12 }}>
        {displayText(effect.text, "FIM DE SET")}
      </motion.h1>
      <h2 style={{ color: team?.secondaryColor }}>{team?.name}</h2>
      <div className="fx-volley-set-end-score">
        {effect.homeScore ?? 0} — {effect.awayScore ?? 0}
      </div>
      <div className="fx-volley-set-end-sets">
        SETS · {home?.shortName} {setsHome} — {setsAway} {away?.shortName}
      </div>
      <div className="fx-particles soft">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            style={{
              left: `${(i * 19) % 100}%`,
              animationDelay: `${(i % 6) * 0.1}s`,
              background: i % 2 === 0 ? team?.secondaryColor ?? "#f5c518" : "#fff",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function VolleyMatchEndEffect({
  effect,
  team,
  home,
  away,
}: {
  effect: EffectPayload;
  team?: Team | null;
  home?: Team | null;
  away?: Team | null;
}) {
  const finishedSets = Array.isArray(effect.metadata?.finishedSets)
    ? (effect.metadata?.finishedSets as Array<{ home: number; away: number }>)
    : [];
  return (
    <div
      className="fx-volley-match-end"
      style={{
        background: `linear-gradient(165deg, ${team?.primaryColor ?? "#0a0e14"}, #05070b 70%)`,
      }}
    >
      <div className="fx-volley-match-end-label">{displayText(effect.text, "FIM DA PARTIDA")}</div>
      <motion.h1
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 140 }}
        style={{ color: team?.secondaryColor }}
      >
        {team?.name ?? "VENCEDOR"}
      </motion.h1>
      <div className="fx-volley-match-end-sets">
        <strong>{effect.homeScore ?? 0}</strong>
        <span>—</span>
        <strong>{effect.awayScore ?? 0}</strong>
      </div>
      <div className="fx-volley-match-end-names">
        {home?.shortName} · {away?.shortName}
      </div>
      {finishedSets.length > 0 && (
        <div className="fx-volley-match-end-history">
          {finishedSets.map((s, i) => (
            <span key={i}>
              {s.home} — {s.away}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function VolleyMatchStartEffect({
  home,
  away,
  text,
}: {
  home?: Team | null;
  away?: Team | null;
  text?: string | null;
}) {
  return (
    <div className="fx-volley-match-start">
      <div className="fx-volley-match-start-eyebrow">{displayText(text, "DIA DE JOGO")}</div>
      <div className="fx-volley-match-start-sport">VÔLEI</div>
      <div className="fx-volley-match-start-row">
        <div>
          {home?.logo && <img src={home.logo} alt="" />}
          <h2>{home?.name ?? "CASA"}</h2>
        </div>
        <span>VS</span>
        <div>
          {away?.logo && <img src={away.logo} alt="" />}
          <h2>{away?.name ?? "FORA"}</h2>
        </div>
      </div>
    </div>
  );
}

function VolleySetStartEffect({
  effect,
  home,
  away,
}: {
  effect: EffectPayload;
  home?: Team | null;
  away?: Team | null;
}) {
  const setNum = Number(effect.metadata?.currentSet ?? 1);
  const setsHome = Number(effect.metadata?.homeSetsWon ?? 0);
  const setsAway = Number(effect.metadata?.awaySetsWon ?? 0);
  return (
    <div className="fx-volley-set-start">
      <div className="fx-volley-set-start-label">SET {setNum}</div>
      <div className="fx-volley-set-start-row">
        <div>
          <strong>{home?.shortName}</strong>
          <em>{setsHome} SET{setsHome === 1 ? "" : "S"}</em>
        </div>
        <div>
          <strong>{away?.shortName}</strong>
          <em>{setsAway} SET{setsAway === 1 ? "" : "S"}</em>
        </div>
      </div>
      <div className="fx-volley-set-start-ready">PRONTOS?</div>
    </div>
  );
}

function GoalEffect({
  effect,
  team,
  player,
}: {
  effect: EffectPayload;
  team?: Team | null;
  player?: Player | null;
}) {
  return (
    <motion.div
      className="fx-goal"
      style={{
        background: `radial-gradient(circle at 30% 40%, ${effect.secondaryColor}33, transparent 45%), linear-gradient(135deg, ${effect.primaryColor}, #05070b 70%)`,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="fx-goal-stripes" style={{ background: effect.secondaryColor }} />
      <motion.div
        className="fx-goal-logo"
        initial={{ scale: 0.4, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 14 }}
      >
        {team?.logo ? <img src={team.logo} alt="" /> : <span>{team?.shortName ?? "GOL"}</span>}
      </motion.div>
      <motion.h1
        className="fx-goal-title"
        style={{ color: effect.secondaryColor }}
        initial={{ y: 80, opacity: 0, scale: 0.8 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 160 }}
      >
        {effect.text ?? "GOOOOOOL!"}
      </motion.h1>
      <motion.div
        className="fx-goal-meta"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35 }}
      >
        <div className="fx-goal-team">{team?.name}</div>
        <div className="fx-goal-player">
          {player ? `${player.shirtNumber} · ${player.nickname || player.name}` : "GOL"}
        </div>
        <div className="fx-goal-score">
          {effect.homeScore ?? 0} — {effect.awayScore ?? 0}
        </div>
      </motion.div>
      <div className="fx-particles">
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            style={{
              left: `${(i * 17) % 100}%`,
              animationDelay: `${(i % 7) * 0.08}s`,
              background: i % 2 === 0 ? effect.secondaryColor : "#fff",
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function CountdownEffect({ value }: { value: number }) {
  return (
    <div className="fx-countdown">
      <motion.div
        key={value}
        className="fx-countdown-num"
        initial={{ scale: 1.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
      >
        {value}
      </motion.div>
      <div className="fx-countdown-label">DIA DE JOGO</div>
    </div>
  );
}

function TeamIntroEffect({ home, away }: { home?: Team | null; away?: Team | null }) {
  return (
    <div className="fx-intro">
      <div className="fx-intro-side" style={{ background: home?.primaryColor ?? "#111" }}>
        {home?.logo && <img src={home.logo} alt="" />}
        <h2 style={{ color: home?.secondaryColor }}>{home?.name ?? "CASA"}</h2>
      </div>
      <div className="fx-intro-vs">VS</div>
      <div className="fx-intro-side right" style={{ background: away?.primaryColor ?? "#222" }}>
        {away?.logo && <img src={away.logo} alt="" />}
        <h2 style={{ color: away?.secondaryColor }}>{away?.name ?? "FORA"}</h2>
      </div>
    </div>
  );
}

function BannerEffect({ text, accent }: { text: string; accent: string }) {
  return (
    <div className="fx-banner">
      <motion.h1 style={{ color: accent }} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        {text}
      </motion.h1>
    </div>
  );
}

function ScoreBanner({
  title,
  home,
  away,
  homeScore,
  awayScore,
}: {
  title: string;
  home?: Team | null;
  away?: Team | null;
  homeScore: number;
  awayScore: number;
}) {
  return (
    <div className="fx-score-banner">
      <div className="fx-score-title">{title}</div>
      <div className="fx-score-row">
        <span>{home?.shortName ?? "CASA"}</span>
        <strong>
          {homeScore} — {awayScore}
        </strong>
        <span>{away?.shortName ?? "FORA"}</span>
      </div>
    </div>
  );
}

function MatchEndEffect({
  home,
  away,
  homeScore,
  awayScore,
}: {
  home?: Team | null;
  away?: Team | null;
  homeScore: number;
  awayScore: number;
}) {
  const winner = homeScore === awayScore ? null : homeScore > awayScore ? home : away;
  return (
    <div className="fx-final">
      <div className="fx-final-label">FINAL</div>
      <div className="fx-final-scores">
        <div>
          <h3>{home?.name}</h3>
          <strong>{homeScore}</strong>
        </div>
        <div>
          <h3>{away?.name}</h3>
          <strong>{awayScore}</strong>
        </div>
      </div>
      {winner && (
        <motion.div
          className="fx-winner"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <span>VENCEDOR</span>
          <h2 style={{ color: winner.secondaryColor }}>{winner.name}</h2>
        </motion.div>
      )}
      {!winner && (
        <div className="fx-winner">
          <span>EMPATE</span>
        </div>
      )}
    </div>
  );
}

function MvpEffect({
  team,
  player,
}: {
  team?: Team | null;
  player?: Player | null;
}) {
  return (
    <div
      className="fx-mvp"
      style={{
        background: `linear-gradient(160deg, ${team?.primaryColor ?? "#111"}, #05070b)`,
      }}
    >
      <div className="fx-mvp-badge craque">CRAQUE DA PARTIDA</div>
      <div className="fx-mvp-photo">
        {player?.photo ? <img src={player.photo} alt="" /> : <span>{player?.shirtNumber ?? "?"}</span>}
      </div>
      <h1>{player?.nickname || player?.name}</h1>
      <h2 style={{ color: team?.secondaryColor }}>{team?.name}</h2>
    </div>
  );
}

function MvpTeaseEffect({ text }: { text: string }) {
  return (
    <motion.div
      className="fx-mvp-tease"
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <h1>{text}</h1>
    </motion.div>
  );
}

function MvpSponsorEffect({
  text,
  sponsor,
  sponsorName,
}: {
  text: string;
  sponsor?: Sponsor | null;
  sponsorName?: string;
}) {
  const name = sponsorName || sponsor?.name;
  return (
    <div className="fx-mvp-sponsor-layout">
      <div className="fx-mvp-sponsor-top">
        <strong>{text}</strong>
        {name ? <span>{name}</span> : null}
      </div>
      <div className="fx-mvp-sponsor-stage">
        <SponsorMedia sponsor={sponsor} />
      </div>
    </div>
  );
}
