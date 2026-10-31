import { describe, expect, it } from "vitest";
import { DiscoverState, emptyState, reservedConflicts } from "./discover-state.ts";

const state = DiscoverState.parse({
  region: "nuernberg",
  abgelehnt: [{ id: "alt-anbieter", publicId: "abcd1234", grund: "zurückgenommen", datum: "2026-10-11" }],
  zurueckgestellt: [],
});

describe("reservedConflicts (ADR 0022, Rücknahme)", () => {
  it("meldet eine wieder vergebene Katalog-ID oder publicId, egal über welchen Weg", () => {
    const issues = reservedConflicts(
      [
        { id: "alt-anbieter", publicId: "zzzz9999" },
        { id: "neu-anbieter", publicId: "abcd1234" },
        { id: "sammelkalender" },
      ],
      [state],
    );
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/Katalog-ID alt-anbieter/);
    expect(issues[1]).toMatch(/publicId abcd1234 \(neu-anbieter\)/);
  });

  it("ohne Treffer nichts", () => {
    expect(reservedConflicts([{ id: "x", publicId: "y0000000" }], [state])).toEqual([]);
  });
});

describe("DiscoverState: orte und klaerfaelle (Plan 0050, E5)", () => {
  it("bestehende Dateien ohne orte und klaerfaelle bleiben gültig und bekommen leere Werte", () => {
    const s = DiscoverState.parse({ region: "fuerth", abgelehnt: [], zurueckgestellt: [] });
    expect(s.orte).toEqual({});
    expect(s.klaerfaelle).toEqual([]);
  });

  it("nimmt Orte und Klärfälle, lehnt eine unbekannte Stufe ab", () => {
    const ort = { lat: 49.45, lon: 11.07, adresse: "Musterstraße 3, 90402 Nürnberg", stufe: 2, datum: "2026-10-29" };
    const klaerfall = {
      url: "https://example.org/",
      name: "Beispiel",
      grund: "Geocoder ohne Treffer",
      seit: "2026-10-01",
      zuletzt: "2026-10-29",
      anzahl: 2,
    };
    const s = DiscoverState.parse({
      region: "nuernberg",
      abgelehnt: [],
      zurueckgestellt: [],
      orte: { "Musterstraße 3, 90402 Nürnberg": { ...ort, district: "Altstadt" } },
      klaerfaelle: [{ ...klaerfall, aussetzenBis: "2026-12-03" }],
    });
    expect(s.klaerfaelle[0]?.aussetzenBis).toBe("2026-12-03");
    expect(() => DiscoverState.parse({ ...s, orte: { x: { ...ort, stufe: 4 } } })).toThrow();
  });

  it("emptyState hat leere orte und klaerfaelle", () => {
    expect(emptyState("nuernberg")).toMatchObject({ orte: {}, klaerfaelle: [] });
  });
});

describe("DiscoverState: seiten, gepflegt, abgelehnt.anbieter (Plan 0049, E4)", () => {
  it("bestehende Dateien ohne die neuen Felder bleiben gültig und bekommen leere Werte", () => {
    const s = DiscoverState.parse({ region: "nuernberg", abgelehnt: [], zurueckgestellt: [] });
    expect(s.seiten).toEqual([]);
    expect(s.gepflegt).toEqual([]);
    expect(emptyState("fuerth")).toMatchObject({ seiten: [], gepflegt: [] });
  });

  it("nimmt geprüfte Seiten und gepflegte Anbieter, lehnt ein unbekanntes Ergebnis ab", () => {
    const seite = {
      url: "https://example.org/kurse",
      anbieter: "beispiel",
      geprueft: "2026-10-31",
      ergebnis: "deckungsgleich",
      stand: "abc123",
    };
    const s = DiscoverState.parse({
      region: "nuernberg",
      abgelehnt: [],
      zurueckgestellt: [],
      seiten: [seite, { ...seite, url: "https://example.org/b", ergebnis: "fehler", grund: "HTTP 500" }],
      gepflegt: [{ anbieter: "beispiel", datum: "2026-10-31" }],
    });
    expect(s.seiten).toHaveLength(2);
    expect(() => DiscoverState.parse({ ...s, seiten: [{ ...seite, ergebnis: "fremder-ort" }] })).toThrow();
  });

  it("abgelehnt mit anbieter (abgelehnte Seite) löst keinen reservedConflicts aus, mit id schon", () => {
    const s = DiscoverState.parse({
      region: "nuernberg",
      abgelehnt: [
        { url: "https://example.org/fremd", anbieter: "beispiel", grund: "fremder Veranstalter", datum: "2026-10-31" },
      ],
      zurueckgestellt: [],
    });
    expect(reservedConflicts([{ id: "beispiel" }], [s])).toEqual([]);
    const t = DiscoverState.parse({ ...s, abgelehnt: [{ id: "beispiel", grund: "zurück", datum: "2026-10-31" }] });
    expect(reservedConflicts([{ id: "beispiel" }], [t])).toHaveLength(1);
  });

  it("abgelehnt mit anbieter braucht eine url", () => {
    expect(() =>
      DiscoverState.parse({
        region: "nuernberg",
        abgelehnt: [{ host: "example.org", anbieter: "beispiel", grund: "x", datum: "2026-10-31" }],
        zurueckgestellt: [],
      }),
    ).toThrow();
  });
});
