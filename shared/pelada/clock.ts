import type { PeladaSession } from "../types/index.ts";

/** Countdown remaining for the current pelada game. */
export function getPeladaGameRemainingMs(session: PeladaSession, now = Date.now()): number {
  if (session.phase === "playing" && session.gameStartedAt != null) {
    return Math.max(0, session.gameRemainingMs - (now - session.gameStartedAt));
  }
  return Math.max(0, session.gameRemainingMs);
}

/** Wall-clock remaining for the overall pelada session booking. */
export function getPeladaSessionRemainingMs(session: PeladaSession, now = Date.now()): number {
  return Math.max(0, session.sessionEndsAt - now);
}

export function formatCountdownMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
