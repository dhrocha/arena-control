/** 4-digit numeric PIN, never padded with leading zeros ambiguity (1000–9999). */
export function generatePeladaPin(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}
