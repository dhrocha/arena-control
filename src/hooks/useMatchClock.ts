import { useEffect, useState } from "react";
import type { Match } from "@shared/types/index";

export function getMatchElapsedMs(match: Match | null, now: number): number {
  if (!match) return 0;
  if (match.status === "playing" && match.startedAt != null) {
    return match.accumulatedMs + (now - match.startedAt);
  }
  return match.accumulatedMs;
}

export function formatMatchTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function useMatchClock(match: Match | null): string {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!match || match.status !== "playing") return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [match?.status, match?.startedAt, match?.id]);

  return formatMatchTime(getMatchElapsedMs(match, now));
}
