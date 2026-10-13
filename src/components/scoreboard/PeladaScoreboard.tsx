import type { CSSProperties, ReactNode } from "react";
import type { PeladaSession } from "@shared/types/index";
import {
  formatCountdownMs,
  getPeladaGameRemainingMs,
  getPeladaSessionRemainingMs,
} from "@shared/pelada/clock";
import { useLocalClock } from "../sponsors/HorizontalSponsorLayout";
import "./pelada-scoreboard.css";

interface Props {
  session: PeladaSession;
  advertisePhone: string;
  now?: number;
}

export function PeladaScoreboard({ session, advertisePhone, now = Date.now() }: Props) {
  const clock = useLocalClock();
  const gameMs = getPeladaGameRemainingMs(session, now);
  const sessionMs = getPeladaSessionRemainingMs(session, now);

  return (
    <div className="pelada-sb">
      <div className="pelada-sb-main">
        <div className="pelada-sb-team" style={{ "--team-color": session.team1Color } as CSSProperties}>
          <div className="pelada-sb-swatch" />
          <div className="pelada-sb-label">TIME 1</div>
          <div className="pelada-sb-score">{session.team1Score}</div>
        </div>
        <div className="pelada-sb-center">
          <div className="pelada-sb-game-clock">{formatCountdownMs(gameMs)}</div>
          <div className="pelada-sb-meta">
            <span>{clock.time}</span>
            <span>GERAL {formatCountdownMs(sessionMs)}</span>
          </div>
          {session.phase === "paused" && <div className="pelada-sb-paused">PAUSADO</div>}
        </div>
        <div className="pelada-sb-team" style={{ "--team-color": session.team2Color } as CSSProperties}>
          <div className="pelada-sb-swatch" />
          <div className="pelada-sb-label">TIME 2</div>
          <div className="pelada-sb-score">{session.team2Score}</div>
        </div>
      </div>
      <div className="pelada-sb-ad-strip">
        <strong>Anuncie aqui</strong>
        <span>{advertisePhone}</span>
      </div>
    </div>
  );
}

interface AdOverlayProps {
  session: PeladaSession;
  sponsorNode: ReactNode;
  now?: number;
}

export function PeladaAdOverlay({ session, sponsorNode, now = Date.now() }: AdOverlayProps) {
  const clock = useLocalClock();
  const gameMs = getPeladaGameRemainingMs(session, now);
  const sessionMs = getPeladaSessionRemainingMs(session, now);

  return (
    <div className="pelada-ad-layout">
      <div className="pelada-ad-stage">{sponsorNode}</div>
      <div className="pelada-ad-strip">
        <span>
          {session.team1Score} — {session.team2Score}
        </span>
        <strong>{formatCountdownMs(gameMs)}</strong>
        <span>{clock.time}</span>
        <span>GERAL {formatCountdownMs(sessionMs)}</span>
      </div>
    </div>
  );
}
