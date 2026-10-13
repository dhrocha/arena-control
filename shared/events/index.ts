import type {
  ClientRole,
  EffectPayload,
  EffectType,
  MatchMode,
  AppState,
  Sport,
} from "../types/index.ts";
import type { VolleyballConfig, VolleyballPointType } from "../sports/volleyball/types.ts";

export type ClientCommand =
  | {
      type: "HELLO";
      payload: { role: ClientRole; pin?: string; clientId: string; label?: string };
    }
  | { type: "AUTH_PIN"; payload: { pin: string } }
  | {
      type: "MATCH_CREATE";
      payload: {
        homeTeamId: string;
        awayTeamId: string;
        mode: MatchMode;
        duration: number;
        /** Defaults to FOOTBALL when omitted (legacy clients). */
        sport?: Sport;
        /** Used when sport is VOLLEYBALL. */
        volleyballConfig?: Partial<VolleyballConfig>;
      };
    }
  | { type: "MATCH_START"; payload?: Record<string, never> }
  | { type: "MATCH_PAUSE"; payload?: Record<string, never> }
  | { type: "MATCH_RESUME"; payload?: Record<string, never> }
  | { type: "MATCH_FINISH"; payload?: Record<string, never> }
  | { type: "HALF_TIME"; payload?: Record<string, never> }
  | { type: "SECOND_HALF"; payload?: Record<string, never> }
  | {
      type: "GOAL";
      payload: { teamId: string; playerId?: string; ownGoal?: boolean };
    }
  | { type: "UNDO_LAST_GOAL"; payload?: Record<string, never> }
  | { type: "SELECT_MVP"; payload: { playerId: string } }
  | { type: "TRIGGER_EFFECT"; payload: { effectType: EffectType; teamId?: string; playerId?: string } }
  | { type: "CANCEL_EFFECT"; payload?: Record<string, never> }
  | { type: "TIMER_RESET"; payload?: Record<string, never> }
  | { type: "SHOW_SCOREBOARD"; payload?: Record<string, never> }
  | { type: "SHOW_SPONSORS"; payload?: Record<string, never> }
  | { type: "SHOW_TEAM_INTRO"; payload?: Record<string, never> }
  | { type: "SHOW_COUNTDOWN"; payload?: Record<string, never> }
  | {
      type: "REGISTER_POINT";
      payload: {
        teamId: string;
        playerId?: string;
        pointType?: VolleyballPointType;
      };
    }
  | { type: "UNDO_LAST_POINT"; payload?: Record<string, never> }
  | {
      type: "ASSIGN_LAST_POINT_PLAYER";
      payload: { playerId: string };
    }
  | {
      type: "SET_SERVER";
      payload: { teamId: string; playerId?: string };
    }
  | { type: "START_NEXT_SET"; payload?: Record<string, never> }
  | { type: "TIMEOUT_START"; payload: { teamId: string } }
  | { type: "TIMEOUT_END"; payload?: Record<string, never> }
  | {
      type: "SET_VOLLEYBALL_OPTIONS";
      payload: {
        pointSoundEnabled?: boolean;
        autoServer?: boolean;
        timeoutSeconds?: number;
      };
    }
  | { type: "PELADA_SESSION_START"; payload: { bookingId: string } }
  | { type: "PELADA_SESSION_STOP"; payload?: Record<string, never> }
  | {
      type: "PELADA_CONFIG";
      payload: { gameDurationSec: number; team1Color: string; team2Color: string };
    }
  | { type: "PELADA_GAME_START"; payload?: Record<string, never> }
  | { type: "PELADA_GAME_PAUSE"; payload?: Record<string, never> }
  | { type: "PELADA_GAME_RESUME"; payload?: Record<string, never> }
  | { type: "PELADA_GAME_FINISH"; payload?: Record<string, never> }
  | { type: "PELADA_SCORE"; payload: { team: 1 | 2; delta: 1 | -1 } };

export type ServerMessage =
  | { type: "STATE_SYNC"; payload: AppState; ts: number }
  | { type: "EFFECT_TRIGGER"; payload: EffectPayload; ts: number }
  | { type: "EFFECT_CANCEL"; payload: Record<string, never>; ts: number }
  | { type: "ERROR"; payload: { code: string; message: string }; ts: number }
  | { type: "AUTH_OK"; payload: { role: ClientRole }; ts: number }
  | { type: "CLIENT_CONNECTED"; payload: { id: string; role: ClientRole }; ts: number }
  | { type: "CLIENT_DISCONNECTED"; payload: { id: string; role: ClientRole }; ts: number };

export function isClientCommand(value: unknown): value is ClientCommand {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}
