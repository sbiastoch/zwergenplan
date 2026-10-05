import { describe, expect, it } from "vitest";
import { countProviders, isKnownProvider } from "./provider-count.ts";
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

describe("isKnownProvider (Plan 0010, E3)", () => {
  const offers = fixtureSiteOffers();
  const providers = [{ id: "turnverein-beispiel" }];

  it("kennt Anbieter aus dem Katalog und aus den Angeboten (Rückfall-Zeile)", () => {
    expect(isKnownProvider(providers, offers, "turnverein-beispiel")).toBe(true);
    expect(isKnownProvider(providers, offers, "theater-beispiel")).toBe(true);
  });

  it("kennt eine ID nicht, die weder im Katalog noch in den Angeboten steht", () => {
    expect(isKnownProvider(providers, offers, "gibt-es-nicht")).toBe(false);
    expect(isKnownProvider([], [], "theater-beispiel")).toBe(false);
  });
});
