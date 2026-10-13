import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ADVERTISE_PHONE = "(11) 99999-9999";

/** Load KEY=VALUE pairs from project .env into process.env (no override). */
export function loadDotEnv(): void {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const envPath = path.join(root, ".env");
    if (!fs.existsSync(envPath)) return;
    const text = fs.readFileSync(envPath, "utf-8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // ignore missing/unreadable .env
  }
}

loadDotEnv();

/** Phone shown on pelada scoreboard "Anuncie aqui" strip. */
export function getAdvertisePhone(): string {
  const raw = process.env.ARENA_ADVERTISE_PHONE?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_ADVERTISE_PHONE;
}
