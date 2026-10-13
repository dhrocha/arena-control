/** Maps known English display strings to pt-BR for arena visualization. */
const DISPLAY_TEXT_PT: Record<string, string> = {
  "HALF TIME": "INTERVALO",
  TIMEOUT: "TEMPO",
  SERVE: "SAQUE",
  MVP: "CRAQUE DA PARTIDA",
  "MATCH START": "INÍCIO",
  "SET POINT": "PONTO DE SET",
  "MATCH POINT": "PONTO DE PARTIDA",
  "CHAMPIONSHIP POINT": "PONTO DE TÍTULO",
  DEUCE: "EMPATE",
  "SET WON": "FIM DE SET",
  "MATCH WON": "FIM DA PARTIDA",
  "GAME DAY": "DIA DE JOGO",
  "SET START": "INÍCIO DE SET",
  WINNER: "VENCEDOR",
  "READY?": "PRONTOS?",
  VOLLEYBALL: "VÔLEI",
  COUNTDOWN: "CONTAGEM",
  HOME: "CASA",
  AWAY: "FORA",
  SETS: "SETS",
  FINAL: "FINAL",
};

/** Localize a known English UI/effect string; leave custom text unchanged. */
export function displayText(text: string | null | undefined, fallback: string): string {
  const raw = (text?.trim() || fallback).trim();
  if (!raw) return fallback;
  return DISPLAY_TEXT_PT[raw.toUpperCase()] ?? raw;
}

export function specialStateLabel(special: string): string {
  return displayText(special.replace(/_/g, " "), special);
}
