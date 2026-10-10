import { describe, expect, it } from "vitest";
import { EMPTY_FILTER } from "./filter.ts";
import { parseRoute, routeToSearch } from "./route.ts";
import {
  LEGACY_SHARE_DIRS,
  offerAppSearch,
  offerImagePath,
  offerSharePath,
  providerAppSearch,
  providerSharePath,
  SHARE_DIRS,
} from "./share.ts";

const offerId = "4tpu5qaq";
const providerId = "b5nuus36";

describe("Pfade zum Teilen (Plan 0026, E1; ADR 0022)", () => {
  it("Vorschauseite und Bild relativ zur Basis, mit Schrägstrich am Ende", () => {
    expect(offerSharePath(offerId)).toBe(`a/${offerId}/`);
    expect(offerImagePath(offerId)).toBe(`a/${offerId}/vorschau.jpg`);
    expect(providerSharePath(providerId)).toBe(`p/${providerId}/`);
    expect(SHARE_DIRS).toEqual({ offer: "a", provider: "p" });
    expect(LEGACY_SHARE_DIRS).toEqual({ offer: "angebot", provider: "anbieter" });
  });

  it("Ziel in der App ist die kanonische Query und wird wieder gelesen", () => {
    expect(offerAppSearch(offerId)).toBe(`?${routeToSearch({ tab: "entdecken", offerId, filter: EMPTY_FILTER })}`);
    expect(offerAppSearch(offerId)).toBe(`?angebot=${offerId}`);
    expect(parseRoute(offerAppSearch(offerId)).offerId).toBe(offerId);
    expect(providerAppSearch(providerId)).toBe(`?anbieter=${providerId}`);
    expect(parseRoute(providerAppSearch(providerId)).providerId).toBe(providerId);
  });

  it("wirft bei IDs, die keine sind: Pfad-Tricks, lange Angebots-IDs und Katalog-IDs", () => {
    for (const bad of ["../x", "a/b--c--d", "", "A--b--c", "familientreff--offener-krabbeltreff--beispielhof"]) {
      expect(() => offerSharePath(bad)).toThrow();
      expect(() => offerImagePath(bad)).toThrow();
      expect(() => offerAppSearch(bad)).toThrow();
    }
    for (const bad of ["../x", "a".repeat(81), "familientreff-beispiel", "B5NUUS36"]) {
      expect(() => providerSharePath(bad)).toThrow();
      expect(() => providerAppSearch(bad)).toThrow();
    }
  });
});
