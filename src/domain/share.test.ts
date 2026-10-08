import { describe, expect, it } from "vitest";
import { EMPTY_FILTER } from "./filter.ts";
import { parseRoute, routeToSearch } from "./route.ts";
import {
  offerAppSearch,
  offerImagePath,
  offerSharePath,
  providerAppSearch,
  providerSharePath,
  SHARE_DIRS,
} from "./share.ts";

const offerId = "familientreff--offener-krabbeltreff--beispielhof";
const providerId = "familientreff-beispiel";

describe("Pfade zum Teilen (Plan 0026, E1; ADR 0020)", () => {
  it("Vorschauseite und Bild relativ zur Basis, mit Schrägstrich am Ende", () => {
    expect(offerSharePath(offerId)).toBe(`angebot/${offerId}/`);
    expect(offerImagePath(offerId)).toBe(`angebot/${offerId}/vorschau.jpg`);
    expect(providerSharePath(providerId)).toBe(`anbieter/${providerId}/`);
    expect(SHARE_DIRS).toEqual({ offer: "angebot", provider: "anbieter" });
  });

  it("Ziel in der App ist die kanonische Query und wird wieder gelesen", () => {
    expect(offerAppSearch(offerId)).toBe(`?${routeToSearch({ tab: "entdecken", offerId, filter: EMPTY_FILTER })}`);
    expect(parseRoute(offerAppSearch(offerId)).offerId).toBe(offerId);
    expect(providerAppSearch(providerId)).toBe(`?anbieter=${providerId}`);
    expect(parseRoute(providerAppSearch(providerId)).providerId).toBe(providerId);
  });

  it("wirft bei IDs, die keine sind (zweite Linie gegen Pfad-Tricks)", () => {
    for (const bad of ["../x", "a/b--c--d", "", "A--b--c"]) {
      expect(() => offerSharePath(bad)).toThrow();
      expect(() => offerImagePath(bad)).toThrow();
    }
    expect(() => providerSharePath("../x")).toThrow();
    expect(() => providerSharePath("a".repeat(81))).toThrow();
  });
});
