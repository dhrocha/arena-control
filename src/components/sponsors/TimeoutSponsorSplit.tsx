import type { Match, Sponsor, Team } from "@shared/types/index";
import { SponsorMedia } from "./SponsorMedia";
import "./sponsors-display.css";

interface Props {
  match: Match;
  home: Team | null | undefined;
  away: Team | null | undefined;
  sponsor: Sponsor | null | undefined;
  countdownSeconds: number | null;
  timeoutTeamName?: string;
}

export function TimeoutSponsorSplit({
  match,
  home,
  away,
  sponsor,
  countdownSeconds,
  timeoutTeamName,
}: Props) {
  return (
    <div className="sponsor-timeout-split">
      <div className="sponsor-timeout-countdown">
        <div className="sponsor-timeout-label">TIMEOUT {timeoutTeamName ?? ""}</div>
        <div className="sponsor-timeout-clock">{countdownSeconds ?? "—"}</div>
        <div className="sponsor-timeout-score">
          <span style={{ color: home?.secondaryColor }}>{home?.shortName ?? "HOME"}</span>
          <strong>
            {match.homeScore} — {match.awayScore}
          </strong>
          <span style={{ color: away?.secondaryColor }}>{away?.shortName ?? "AWAY"}</span>
        </div>
      </div>
      <div className="sponsor-timeout-sponsor">
        <div className="sponsor-presented-by">APRESENTADO POR</div>
        <div className="sponsor-timeout-media">
          {sponsor ? <SponsorMedia sponsor={sponsor} /> : <div className="sponsor-media empty">—</div>}
        </div>
        {sponsor?.name && <div className="sponsor-timeout-name">{sponsor.name}</div>}
      </div>
    </div>
  );
}
