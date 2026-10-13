import { describe, expect, it } from "vitest";
import {
  buildPriorityPlaylist,
  countEnabledByTier,
  normalizeSponsorTier,
  pickPrioritySponsor,
  SPONSOR_TIER_ORDER,
  tierVacancyError,
} from "./playlist.ts";
import type { Sponsor } from "../types/index.ts";

function sponsor(partial: Partial<Sponsor> & Pick<Sponsor, "id" | "tier">): Sponsor {
  return {
    name: partial.id,
    mediaUrl: "/x.png",
    mediaType: "image",
    slots: ["halftime", "idle"],
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe("normalizeSponsorTier", () => {
  it("mapeia standard legado para amigo", () => {
    expect(normalizeSponsorTier("standard")).toBe("amigo");
  });
});

describe("buildPriorityPlaylist", () => {
  it("ordena Master → Oficial → Parceiro → Amigo", () => {
    const playlist = buildPriorityPlaylist([
      sponsor({ id: "a1", tier: "amigo" }),
      sponsor({ id: "m1", tier: "master" }),
      sponsor({ id: "p1", tier: "parceiro" }),
      sponsor({ id: "o1", tier: "oficial" }),
    ]);
    expect(playlist.indexOf("m1")).toBeLessThan(playlist.indexOf("o1"));
    expect(playlist.indexOf("o1")).toBeLessThan(playlist.indexOf("p1"));
    expect(playlist.indexOf("p1")).toBeLessThan(playlist.indexOf("a1"));
  });
});

describe("pickPrioritySponsor", () => {
  it("prefere o tier mais alto disponível", () => {
    const picked = pickPrioritySponsor([
      sponsor({ id: "a1", tier: "amigo" }),
      sponsor({ id: "o1", tier: "oficial" }),
    ]);
    expect(picked?.id).toBe("o1");
  });
});

describe("tierVacancyError", () => {
  it("bloqueia segundo Master ativo", () => {
    const list = [sponsor({ id: "m1", tier: "master" })];
    expect(tierVacancyError(list, "master")).toMatch(/Master/);
    expect(tierVacancyError(list, "master", "m1")).toBeNull();
  });

  it("amigo não tem limite", () => {
    const list = SPONSOR_TIER_ORDER.flatMap((tier, i) =>
      tier === "amigo" ? [sponsor({ id: `a${i}`, tier: "amigo" })] : []
    );
    expect(countEnabledByTier(list, "amigo")).toBe(1);
    expect(tierVacancyError(list, "amigo")).toBeNull();
  });
});
