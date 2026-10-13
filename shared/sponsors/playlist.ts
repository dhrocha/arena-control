import type { Sponsor, SponsorSlot, SponsorTier } from "../types/index.ts";

/** Display / pick priority: Master → Oficial → Parceiro → Amigo. */
export const SPONSOR_TIER_ORDER: SponsorTier[] = [
  "master",
  "oficial",
  "parceiro",
  "amigo",
];

/** Vacancy caps (`null` = unlimited). */
export const SPONSOR_TIER_LIMITS: Record<SponsorTier, number | null> = {
  master: 1,
  oficial: 4,
  parceiro: 4,
  amigo: null,
};

export const SPONSOR_TIER_LABELS: Record<SponsorTier, string> = {
  master: "Master",
  oficial: "Oficial",
  parceiro: "Parceiro",
  amigo: "Amigo da casa",
};

/** Default carousel seconds per tier (idle / manual). */
export const DEFAULT_SPONSOR_TIER_SECONDS: Record<SponsorTier, number> = {
  master: 60,
  oficial: 45,
  parceiro: 30,
  amigo: 20,
};

export const ALL_SPONSOR_SLOTS: SponsorSlot[] = [
  "idle",
  "timeout",
  "halftime",
  "mvp",
  "manual",
];

export function isSponsorTier(value: unknown): value is SponsorTier {
  return typeof value === "string" && (SPONSOR_TIER_ORDER as string[]).includes(value);
}

/** Map legacy `standard` → `amigo`. */
export function normalizeSponsorTier(value: unknown): SponsorTier {
  if (value === "standard") return "amigo";
  if (isSponsorTier(value)) return value;
  return "amigo";
}

export function sponsorsForSlot(sponsors: Sponsor[], slot: SponsorSlot): Sponsor[] {
  return sponsors.filter(
    (s) => s.enabled && s.mediaUrl && Array.isArray(s.slots) && s.slots.includes(slot)
  );
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/**
 * Playlist ordered by tier priority (Master first … Amigo last).
 * Within each tier, sponsors are shuffled.
 */
export function buildPriorityPlaylist(sponsors: Sponsor[]): string[] {
  const playlist: string[] = [];
  for (const tier of SPONSOR_TIER_ORDER) {
    const group = shuffleInPlace(sponsors.filter((s) => s.tier === tier).slice());
    for (const s of group) playlist.push(s.id);
  }
  return playlist;
}

/** @deprecated Use buildPriorityPlaylist — kept for callers that still import the old name. */
export function buildWeightedPlaylist(sponsors: Sponsor[]): string[] {
  return buildPriorityPlaylist(sponsors);
}

/** Pick a random sponsor from the highest available tier. */
export function pickPrioritySponsor(sponsors: Sponsor[]): Sponsor | null {
  if (!sponsors.length) return null;
  for (const tier of SPONSOR_TIER_ORDER) {
    const pool = sponsors.filter((s) => s.tier === tier);
    if (pool.length) {
      return pool[Math.floor(Math.random() * pool.length)] ?? null;
    }
  }
  return null;
}

/** @deprecated Use pickPrioritySponsor. */
export function pickWeightedSponsor(sponsors: Sponsor[]): Sponsor | null {
  return pickPrioritySponsor(sponsors);
}

export function isSponsorSlot(value: unknown): value is SponsorSlot {
  return typeof value === "string" && (ALL_SPONSOR_SLOTS as string[]).includes(value);
}

export function normalizeSponsorSlots(value: unknown): SponsorSlot[] {
  if (!Array.isArray(value)) return ["idle"];
  const slots = value.filter(isSponsorSlot);
  return slots.length ? [...new Set(slots)] : ["idle"];
}

export function countEnabledByTier(
  sponsors: Sponsor[],
  tier: SponsorTier,
  exceptId?: string
): number {
  return sponsors.filter(
    (s) => s.enabled && s.tier === tier && (!exceptId || s.id !== exceptId)
  ).length;
}

/** Returns an error message if the tier vacancy is full; otherwise null. */
export function tierVacancyError(
  sponsors: Sponsor[],
  tier: SponsorTier,
  exceptId?: string
): string | null {
  const limit = SPONSOR_TIER_LIMITS[tier];
  if (limit == null) return null;
  const used = countEnabledByTier(sponsors, tier, exceptId);
  if (used >= limit) {
    return `${SPONSOR_TIER_LABELS[tier]} já está com as ${limit} vaga${limit === 1 ? "" : "s"} preenchida${limit === 1 ? "" : "s"}.`;
  }
  return null;
}

export function normalizeSponsorTierSeconds(
  value: unknown
): Record<SponsorTier, number> {
  const base = { ...DEFAULT_SPONSOR_TIER_SECONDS };
  if (!value || typeof value !== "object") return base;
  const raw = value as Record<string, unknown>;
  for (const tier of SPONSOR_TIER_ORDER) {
    const n = Number(raw[tier]);
    if (Number.isFinite(n) && n > 0) base[tier] = Math.round(n);
  }
  return base;
}

export function secondsForSponsorTier(
  tierSeconds: Record<SponsorTier, number> | undefined,
  tier: SponsorTier
): number {
  const map = tierSeconds ?? DEFAULT_SPONSOR_TIER_SECONDS;
  return Math.max(3, map[tier] ?? DEFAULT_SPONSOR_TIER_SECONDS[tier]);
}
