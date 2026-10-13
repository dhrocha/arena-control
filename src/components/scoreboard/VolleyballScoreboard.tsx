import type { CSSProperties } from "react";
import type { Match, Team } from "@shared/types/index";
import { setsToWin } from "@shared/sports/index";
import { useCountdownEndsAt } from "../../hooks/useCountdownEndsAt";
import { displayText, specialStateLabel } from "../../lib/displayLabels";
import "./volleyball-scoreboard.css";

interface Props {
  home?: Team | null;
  away?: Team | null;
  match: Match;
  serverTime?: number;
  compact?: boolean;
}

export function VolleyballScoreboard({ home, away, match, serverTime, compact }: Props) {
  const volley = match.sportState?.sport === "VOLLEYBALL" ? match.sportState : null;
  const timeoutLeft = useCountdownEndsAt(
    volley?.status === "TIMEOUT" ? volley.timeoutEndsAt : null,
    serverTime
  );

  if (!volley) {
    return (
      <div className={`vb-scoreboard ${compact ? "compact" : ""}`}>
        <p className="vb-missing">Estado de vôlei indisponível</p>
      </div>
    );
  }

  const deciding =
    volley.homeSetsWon === setsToWin(volley.config) - 1 &&
    volley.awaySetsWon === setsToWin(volley.config) - 1;

  const finishedSets = volley.sets.filter((s) => s.status === "FINISHED");
  const special = volley.specialState;
  const serveHome = volley.serverTeamId === match.homeTeamId;
  const serveAway = volley.serverTeamId === match.awayTeamId;
  const timeoutTeam =
    volley.timeoutTeamId === match.homeTeamId
      ? home
      : volley.timeoutTeamId === match.awayTeamId
        ? away
        : null;

  return (
    <div
      className={`vb-scoreboard ${compact ? "compact" : "broadcast"}`}
      style={
        {
          ["--home"]: home?.primaryColor ?? "#e10600",
          ["--away"]: away?.primaryColor ?? "#1a4cff",
        } as CSSProperties
      }
    >
      <div className="vb-glow" aria-hidden />

      <div className="vb-period">
        {volley.status === "MATCH_FINISHED" || match.status === "finished"
          ? "FINAL"
          : volley.status === "TIMEOUT"
            ? "TEMPO"
            : volley.status === "SET_FINISHED"
              ? "FIM DE SET"
              : deciding
                ? "SET DECISIVO"
                : `SET ${volley.currentSet}`}
      </div>

      {volley.status === "TIMEOUT" && (
        <div className="vb-timeout-block">
          <div className="vb-timeout-label">TEMPO {timeoutTeam?.shortName ?? ""}</div>
          <div className="vb-timeout-clock">{timeoutLeft ?? volley.config.timeoutSeconds}</div>
          <div className="vb-timeout-score">
            {match.homeScore} — {match.awayScore}
          </div>
        </div>
      )}

      {special && volley.status !== "SET_FINISHED" && volley.status !== "MATCH_FINISHED" && (
        <div className={`vb-special ${special.toLowerCase()}`}>{specialStateLabel(special)}</div>
      )}

      <div className="vb-teams-row">
        <div className={`vb-side home ${serveHome ? "serving" : ""}`}>
          <Crest team={home} />
          <strong>{home?.shortName ?? "CASA"}</strong>
          {serveHome && <span className="vb-serve">● SAQUE</span>}
        </div>
        <div className={`vb-side away ${serveAway ? "serving" : ""}`}>
          <Crest team={away} />
          <strong>{away?.shortName ?? "FORA"}</strong>
          {serveAway && <span className="vb-serve">● SAQUE</span>}
        </div>
      </div>

      <div className="vb-sets-row" aria-label="Sets vencidos">
        <span className="vb-sets-num">{volley.homeSetsWon}</span>
        <span className="vb-sets-label">SETS</span>
        <span className="vb-sets-num">{volley.awaySetsWon}</span>
      </div>

      <div className="vb-points-row" aria-label="Placar do set">
        <span className="vb-points-num">{match.homeScore}</span>
        <span className="vb-points-sep">—</span>
        <span className="vb-points-num">{match.awayScore}</span>
      </div>

      {!compact && finishedSets.length > 0 && (
        <div className="vb-history">
          {finishedSets.map((s) => (
            <span key={s.number}>
              {s.homeScore} — {s.awayScore}
            </span>
          ))}
        </div>
      )}

      {compact && (
        <div className="vb-status">
          {volley.status === "TIMEOUT"
            ? "TEMPO"
            : match.status === "playing"
              ? "AO VIVO"
              : displayText(match.status.replace(/_/g, " ").toUpperCase(), match.status.toUpperCase())}
        </div>
      )}
    </div>
  );
}

function Crest({ team }: { team?: Team | null }) {
  return (
    <div className="vb-crest" title={team?.name}>
      {team?.logo ? <img src={team.logo} alt={team.name} /> : <span>{(team?.shortName ?? "?").slice(0, 2)}</span>}
    </div>
  );
}
