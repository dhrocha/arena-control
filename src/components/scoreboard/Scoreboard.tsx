import type { CSSProperties } from "react";
import type { Match, Team } from "@shared/types/index";
import { useMatchClock } from "../../hooks/useMatchClock";
import "./scoreboard.css";

interface Props {
  home?: Team | null;
  away?: Team | null;
  match: Match;
  serverTime?: number;
  compact?: boolean;
}

export function Scoreboard({ home, away, match, serverTime, compact }: Props) {
  const clock = useMatchClock(match, serverTime);
  const [minutes, seconds] = clock.split(":");

  return (
    <div
      className={`scoreboard ${compact ? "compact" : "broadcast"}`}
      style={
        {
          ["--home"]: home?.primaryColor ?? "#e10600",
          ["--away"]: away?.primaryColor ?? "#1a4cff",
        } as CSSProperties
      }
    >
      <div className="sb-glow" aria-hidden />

      <div className="sb-period">{periodLabel(match)}</div>

      <div className="sb-clock-row">
        <Crest team={home} side="home" />
        <div className="sb-clock" aria-label={clock}>
          <span className="sb-clock-digits">{minutes}</span>
          <span className="sb-clock-colon">:</span>
          <span className="sb-clock-digits">{seconds}</span>
        </div>
        <Crest team={away} side="away" />
      </div>

      <div className="sb-score-row">
        <span className="sb-score-num">{match.homeScore}</span>
        <span className="sb-score-bar" aria-hidden>
          |
        </span>
        <span className="sb-score-num">{match.awayScore}</span>
      </div>

      {!compact && (
        <div className="sb-team-labels">
          <span className="home">{home?.shortName ?? "HOME"}</span>
          <span className="away">{away?.shortName ?? "AWAY"}</span>
        </div>
      )}

      {compact && <div className="sb-status">{statusLabel(match.status)}</div>}
    </div>
  );
}

function Crest({ team, side }: { team?: Team | null; side: "home" | "away" }) {
  return (
    <div className={`sb-crest ${side}`} title={team?.name}>
      {team?.logo ? (
        <img src={team.logo} alt={team.name} />
      ) : (
        <span>{(team?.shortName ?? "?").slice(0, 2)}</span>
      )}
    </div>
  );
}

function periodLabel(match: Match): string {
  if (match.status === "halftime") return "INTERVALO";
  if (match.status === "finished") return "FINAL";
  if (match.status === "countdown") return "COUNTDOWN";
  if (match.status === "setup") return "PRÉ-JOGO";
  if (match.currentPeriod === 2) return "2º TEMPO";
  return "1º TEMPO";
}

function statusLabel(status: Match["status"]): string {
  switch (status) {
    case "playing":
      return "AO VIVO";
    case "paused":
      return "PAUSADO";
    case "finished":
      return "ENCERRADO";
    default:
      return status.toUpperCase();
  }
}
