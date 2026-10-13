import type { MatchEvent, Sport } from "@shared/types/index";

function undoneGoalIds(events: MatchEvent[]): Set<string> {
  return new Set(
    events
      .filter((e) => e.type === "UNDO_GOAL")
      .map((e) => String(e.metadata?.undoneEventId ?? ""))
      .filter(Boolean)
  );
}

function undonePointIds(events: MatchEvent[]): Set<string> {
  return new Set(
    events
      .filter((e) => e.type === "UNDO_POINT")
      .map((e) => String(e.metadata?.undoneEventId ?? ""))
      .filter(Boolean)
  );
}

/** Goals credited to a player in the current match (football). */
export function countPlayerGoals(events: MatchEvent[], playerId: string): number {
  const undone = undoneGoalIds(events);
  return events.filter(
    (e) => e.type === "GOAL" && e.playerId === playerId && !undone.has(e.id)
  ).length;
}

/** Points attributed to a player in the current match (volleyball). */
export function countPlayerPoints(events: MatchEvent[], playerId: string): number {
  const undone = undonePointIds(events);
  return events.filter(
    (e) =>
      (e.type === "VOLLEYBALL_POINT" || e.type === "SET_END" || e.type === "MATCH_END") &&
      e.playerId === playerId &&
      !undone.has(e.id)
  ).length;
}

export function playerStatLabel(sport: Sport | undefined, count: number): string {
  if (sport === "VOLLEYBALL") {
    return count === 1 ? "1 ponto" : `${count} pontos`;
  }
  return count === 1 ? "1 gol" : `${count} gols`;
}

export function countPlayerStat(
  sport: Sport | undefined,
  events: MatchEvent[],
  playerId: string
): number {
  return sport === "VOLLEYBALL"
    ? countPlayerPoints(events, playerId)
    : countPlayerGoals(events, playerId);
}
