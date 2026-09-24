import type { MatchMode, Sport } from "@shared/types/index";
import type { VolleyballConfig } from "@shared/sports/index";
import { DEFAULT_VOLLEYBALL_CONFIG } from "@shared/sports/index";

export type CreateMatchPayload = {
  homeTeamId: string;
  awayTeamId: string;
  mode: MatchMode;
  duration: number;
  sport: Sport;
  volleyballConfig?: Partial<VolleyballConfig>;
};

export function sportEmoji(sport: Sport): string {
  return sport === "VOLLEYBALL" ? "🏐" : "⚽";
}

export function sportLabel(sport: Sport): string {
  return sport === "VOLLEYBALL" ? "VÔLEI" : "FUTEBOL";
}

export function sportTitle(sport: Sport): string {
  return `${sportEmoji(sport)} ${sportLabel(sport)}`;
}

export function defaultVolleyballFormConfig(): Pick<
  VolleyballConfig,
  "format" | "normalSetPoints" | "decidingSetPoints" | "minDifference" | "timeoutSeconds"
> {
  return {
    format: DEFAULT_VOLLEYBALL_CONFIG.format,
    normalSetPoints: DEFAULT_VOLLEYBALL_CONFIG.normalSetPoints,
    decidingSetPoints: DEFAULT_VOLLEYBALL_CONFIG.decidingSetPoints,
    minDifference: DEFAULT_VOLLEYBALL_CONFIG.minDifference,
    timeoutSeconds: DEFAULT_VOLLEYBALL_CONFIG.timeoutSeconds,
  };
}
