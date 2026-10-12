import type { Sponsor, SponsorSlot, SponsorTier } from "../types/index.ts";

export const SPONSOR_TIER_WEIGHT: Record<SponsorTier, number> = {
  master: 3,
  standard: 1,
};

export const ALL_SPONSOR_SLOTS: SponsorSlot[] = [
  "idle",
  "timeout",
  "halftime",
  "mvp",
  "manual",
];

export function sponsorsForSlot(sponsors: Sponsor[], slot: SponsorSlot): Sponsor[] {
  return sponsors.filter(
    (s) => s.enabled && s.mediaUrl && Array.isArray(s.slots) && s.slots.includes(slot)
  );
}

/** Build a weighted playlist (masters appear more often), shuffled. */
export function buildWeightedPlaylist(sponsors: Sponsor[]): string[] {
  const pool: string[] = [];
  for (const s of sponsors) {
    const weight = SPONSOR_TIER_WEIGHT[s.tier] ?? 1;
    for (let i = 0; i < weight; i++) pool.push(s.id);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool;
}

export function pickWeightedSponsor(sponsors: Sponsor[]): Sponsor | null {
  if (!sponsors.length) return null;
  const masters = sponsors.filter((s) => s.tier === "master");
  const pool = masters.length ? masters : sponsors;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export function isSponsorSlot(value: unknown): value is SponsorSlot {
  return typeof value === "string" && (ALL_SPONSOR_SLOTS as string[]).includes(value);
}

export function normalizeSponsorSlots(value: unknown): SponsorSlot[] {
  if (!Array.isArray(value)) return ["idle"];
  const slots = value.filter(isSponsorSlot);
  return slots.length ? [...new Set(slots)] : ["idle"];
}
