import { describe, expect, it } from "vitest";
import { countProviders, isKnownProvider } from "./provider-count.ts";
import { fixtureSiteOffers, fixturePublicId as pid } from "./test-fixtures.ts";

describe("countProviders (Plan 0010, E4)", () => {
  it("zählt verschiedene Anbieter, nicht Angebote", () => {
    const offers = fixtureSiteOffers();
    expect(offers).toHaveLength(9);
    expect(countProviders(offers)).toBe(5);
    expect(countProviders(offers.filter((o) => o.providerId === pid("familientreff-beispiel")))).toBe(1);
  });

  it("ist ohne Angebote 0", () => {
    expect(countProviders([])).toBe(0);
  });

  it("mit Kartenausschnitt nur die, die nicht außerhalb liegen (Plan 0055, E4)", () => {
    const offers = fixtureSiteOffers();
    const treff = pid("familientreff-beispiel");
    const theater = pid("theater-beispiel");
    // Theater bekannt und außerhalb, Familientreff drin, die übrigen ohne bekannten Ort gelten nie als außerhalb
    const view = { inView: new Set([treff]), known: new Set([treff, theater]) };
    expect(countProviders(offers, view)).toBe(4);
    expect(countProviders(offers, undefined)).toBe(5);
  });
});

describe("isKnownProvider (Plan 0010, E3)", () => {
  const offers = fixtureSiteOffers();
  const providers = [{ id: pid("turnverein-beispiel") }];

  it("kennt Anbieter aus dem Katalog und aus den Angeboten (Rückfall-Zeile)", () => {
    expect(isKnownProvider(providers, offers, pid("turnverein-beispiel"))).toBe(true);
    expect(isKnownProvider(providers, offers, pid("theater-beispiel"))).toBe(true);
  });

  it("kennt eine ID nicht, die weder im Katalog noch in den Angeboten steht", () => {
    expect(isKnownProvider(providers, offers, "gibt-es-nicht")).toBe(false);
    expect(isKnownProvider([], [], pid("theater-beispiel"))).toBe(false);
  });
});
