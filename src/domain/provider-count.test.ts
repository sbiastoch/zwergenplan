import { describe, expect, it } from "vitest";
import { countProviders } from "./provider-count.ts";
import { fixtureSiteOffers } from "./test-fixtures.ts";

describe("countProviders (Plan 0010, E4)", () => {
  it("zählt verschiedene Anbieter, nicht Angebote", () => {
    const offers = fixtureSiteOffers();
    expect(offers).toHaveLength(9);
    expect(countProviders(offers)).toBe(5);
    expect(countProviders(offers.filter((o) => o.providerId === "familientreff-beispiel"))).toBe(1);
  });

  it("ist ohne Angebote 0", () => {
    expect(countProviders([])).toBe(0);
  });
});
