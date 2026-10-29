import { describe, expect, it } from "vitest";
import { countProviders, isKnownProvider, isOutside, viewNarrows } from "./provider-count.ts";
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

describe("Kartenausschnitt (Plan 0055, E2, E4)", () => {
  const view = { inView: new Set(["a"]), known: new Set(["a", "b"]) };

  it("außerhalb ist nur, wer einen bekannten Ort hat und keinen im Ausschnitt", () => {
    expect(isOutside(view, "a")).toBe(false);
    expect(isOutside(view, "b")).toBe(true);
    expect(isOutside(view, "ohne-ort")).toBe(false);
    expect(isOutside(undefined, "b")).toBe(false);
  });

  it("schränkt ein, sobald ein bekannter Anbieter außerhalb liegt", () => {
    expect(viewNarrows(view)).toBe(true);
    expect(viewNarrows({ inView: new Set(["a", "b"]), known: new Set(["a", "b"]) })).toBe(false);
    expect(viewNarrows(undefined)).toBe(false);
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
