import { describe, expect, it } from "vitest";
import type { ProviderRow } from "../../domain/directory.ts";
import type { Reach } from "../../domain/reach.ts";
import { hiddenProvidersText, idleLine, placesText, providerCountText, providerLine } from "./provider-format.ts";

const provider = { id: "x", name: "X", topics: [], venues: [] };
const row = (overrides: Partial<ProviderRow> = {}): ProviderRow => ({
  provider,
  state: "aktiv",
  shown: 3,
  upcoming: 3,
  places: ["Gostenhof"],
  ...overrides,
});
const minutes = (value: number): Reach => ({ kind: "oepnv", minutes: value, byFoot: false });
const meters = (value: number): Reach => ({ kind: "luftlinie", meters: value });

describe("providerLine", () => {
  it("zählt die Angebote: alle sichtbar, eins, ein Teil", () => {
    expect(providerLine(row(), undefined)).toBe("3 Angebote · Gostenhof");
    expect(providerLine(row({ shown: 1, upcoming: 1 }), undefined)).toBe("1 Angebot · Gostenhof");
    expect(providerLine(row({ shown: 1, upcoming: 3 }), undefined)).toBe("1 von 3 Angeboten · Gostenhof");
  });

  it("nennt einen, zwei oder zwei Stadtteile plus Rest", () => {
    expect(providerLine(row({ places: ["Gostenhof", "St. Johannis"] }), undefined)).toBe(
      "3 Angebote · Gostenhof, St. Johannis",
    );
    expect(providerLine(row({ places: ["Gostenhof", "St. Johannis", "Altstadt", "Südstadt"] }), undefined)).toBe(
      "3 Angebote · Gostenhof, St. Johannis +2",
    );
    expect(providerLine(row({ places: [] }), undefined)).toBe("3 Angebote");
  });

  it("hängt die Wegzeit bzw. Entfernung in Kurzform an, je ReachMode", () => {
    expect(providerLine(row({ nearest: minutes(24) }), { kind: "oepnv" })).toBe("3 Angebote · Gostenhof · 25 Min.");
    expect(providerLine(row({ nearest: meters(1427) }), { kind: "luftlinie", reason: "fehler" })).toBe(
      "3 Angebote · Gostenhof · 1,4 km",
    );
  });

  it("ohne Wert, ohne Startpunkt oder beim Laden entfällt die Wegzeit (kein Platzhalter)", () => {
    expect(providerLine(row(), { kind: "oepnv" })).toBe("3 Angebote · Gostenhof");
    expect(providerLine(row({ nearest: minutes(24) }), undefined)).toBe("3 Angebote · Gostenhof");
    expect(providerLine(row({ nearest: minutes(24) }), { kind: "laedt" })).toBe("3 Angebote · Gostenhof");
  });
});

describe("idleLine", () => {
  it("ohne Termine bzw. ausgeblendet, mit den Orten aus dem Katalog", () => {
    expect(idleLine(row({ state: "ohne-termine", shown: 0, upcoming: 0, places: ["Schweinau"] }))).toBe(
      "Gerade keine Termine im Plan · Schweinau",
    );
    expect(idleLine(row({ state: "ausgeblendet", shown: 0, upcoming: 2, places: [] }))).toBe(
      "2 Angebote, keins passt zur Auswahl",
    );
    expect(idleLine(row({ state: "ausgeblendet", shown: 0, upcoming: 1 }))).toBe(
      "1 Angebot, passt nicht zur Auswahl · Gostenhof",
    );
  });
});

describe("Zähltexte", () => {
  it("weitere Anbieter ohne Passendes", () => {
    expect(hiddenProvidersText(12)).toBe("12 weitere Anbieter haben gerade nichts Passendes.");
    expect(hiddenProvidersText(1)).toBe("1 weiterer Anbieter hat gerade nichts Passendes.");
  });

  it("Live-Text der Suche", () => {
    expect(providerCountText(12)).toBe("12 Anbieter");
    expect(providerCountText(1)).toBe("1 Anbieter");
  });

  it("Orte: höchstens zwei, Rest als Zahl", () => {
    expect(placesText(["A", "B", "C"])).toBe("A, B +1");
  });
});
