import type { MatchEvent, MatchEventType, Player, Team } from "@shared/types/index";

const LABELS: Partial<Record<MatchEventType, string>> = {
  GOAL: "Gol",
  OWN_GOAL: "Gol contra",
  UNDO_GOAL: "Desfazer gol",
  MATCH_START: "Início",
  HALF_TIME: "Intervalo",
  MATCH_END: "Fim",
  MVP: "MVP",
  PENALTY: "Pênalti",
  YELLOW_CARD: "Cartão amarelo",
  RED_CARD: "Cartão vermelho",
  VOLLEYBALL_POINT: "Ponto",
  SET_POINT: "Set point",
  MATCH_POINT: "Match point",
  DEUCE: "Deuce",
  SET_START: "Início de set",
  SET_END: "Fim de set",
  TIMEOUT_START: "Timeout",
  TIMEOUT_END: "Fim do timeout",
  UNDO_POINT: "Desfazer ponto",
  SERVER_CHANGED: "Saque",
};

export function eventLabel(type: string): string {
  return LABELS[type as MatchEventType] ?? type;
}

export function formatEventTime(matchTime: number): string {
  const mm = Math.floor(matchTime / 60000);
  const ss = String(Math.floor((matchTime % 60000) / 1000)).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function describeEvent(
  ev: Pick<MatchEvent, "type" | "teamId" | "playerId" | "metadata">,
  teams: Team[],
  players: Player[]
): string {
  const team = teams.find((t) => t.id === ev.teamId);
  const player = players.find((p) => p.id === ev.playerId);
  const parts = [eventLabel(ev.type)];
  if (team) parts.push(team.shortName);
  if (player) parts.push(`#${player.shirtNumber} ${player.nickname || player.name}`);
  const pointType = ev.metadata?.pointType;
  if (typeof pointType === "string" && pointType) parts.push(`(${pointType})`);
  return parts.join(" · ");
}
