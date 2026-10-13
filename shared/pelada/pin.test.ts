import { describe, expect, it } from "vitest";
import { generatePeladaPin } from "./pin.ts";

describe("generatePeladaPin", () => {
  it("gera PIN numérico de 4 dígitos", () => {
    for (let i = 0; i < 30; i++) {
      const pin = generatePeladaPin();
      expect(pin).toMatch(/^\d{4}$/);
      expect(Number(pin)).toBeGreaterThanOrEqual(1000);
      expect(Number(pin)).toBeLessThanOrEqual(9999);
    }
  });
});
