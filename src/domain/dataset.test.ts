import { describe, expect, it } from "vitest";
import { checkPlausibility, validateDataset } from "./dataset.ts";
import { rawFixtures } from "./test-fixtures.ts";
import { CATEGORIES, categoriesOf, TOPIC_CATEGORIES } from "./topics.ts";

type Raw = { offers: Array<Record<string, unknown>>; generatedAt: string };

function mutate(fn: (offers: Raw, providers: Array<Record<string, unknown>>) => void) {
  const { providers, offers } = structuredClone(rawFixtures()) as {
    providers: Array<Record<string, unknown>>;
    offers: Raw;
  };
  fn(offers, providers);
  return validateDataset(providers, offers);
}

const errorsOf = (r: ReturnType<typeof validateDataset>) => (r.ok ? [] : r.errors).join("\n");

describe("validateDataset", () => {
  it("akzeptiert die Fixtures", () => {
    const r = mutate(() => {});
    expect(errorsOf(r)).toBe("");
    // 7 Katalog-Einträge: 6 Anbieter (einer ohne Angebote) und ein Sammelkalender (Plan 0010, E6)
    expect(r.ok && r.summary).toEqual({ offers: 9, providers: 7, generatedAt: "2026-10-05T06:00:00+02:00" });
  });

  it.each([
    [
      "Zeit ohne Offset",
      (o: Raw) =>
        Object.assign(o.offers[0] as object, { sessions: [{ start: "2026-10-13T09:30", end: "2026-10-13T11:00" }] }),
      "sessions",
    ],
    [
      "Ende vor Beginn",
      (o: Raw) =>
        Object.assign(o.offers[0] as object, {
          sessions: [{ start: "2026-10-13T11:00:00+02:00", end: "2026-10-13T09:30:00+02:00" }],
        }),
      "end muss nach start",
    ],
    ["unbekanntes Thema", (o: Raw) => Object.assign(o.offers[0] as object, { topics: ["fussball"] }), "topics"],
    [
      "nur Merkmals-Themen",
      (o: Raw) => Object.assign(o.offers[0] as object, { topics: ["mehrsprachig"] }),
      "Kategorie",
    ],
    ["unbekanntes Feld", (o: Raw) => Object.assign(o.offers[0] as object, { foo: 1 }), "foo"],
    ["ID passt nicht zu Anbieter/Ort", (o: Raw) => Object.assign(o.offers[0] as object, { id: "x--y--z" }), "id muss"],
    [
      "einmalig mit zwei Terminen",
      (o: Raw) =>
        Object.assign(o.offers[5] as object, {
          sessions: [
            { start: "2026-11-15T11:00:00+01:00", end: "2026-11-15T11:35:00+01:00" },
            { start: "2026-11-16T11:00:00+01:00", end: "2026-11-16T11:35:00+01:00" },
          ],
        }),
      "genau einen Termin",
    ],
    [
      "unsortierte Termine",
      (o: Raw) => {
        const s = (o.offers[1] as { sessions: unknown[] }).sessions;
        s.reverse();
      },
      "aufsteigend",
    ],
    [
      "Alter verdreht",
      (o: Raw) => Object.assign(o.offers[0] as object, { age: { minMonths: 6, maxMonths: 2 } }),
      "minMonths",
    ],
  ])("lehnt ab: %s", (_name, fn, expected) => {
    const r = mutate(fn);
    expect(r.ok).toBe(false);
    expect(errorsOf(r)).toContain(expected);
  });

  it("prüft Referenzen und Eindeutigkeit", () => {
    expect(errorsOf(mutate((o) => o.offers.push(structuredClone(o.offers[0]) as Record<string, unknown>)))).toContain(
      "ID doppelt",
    );
    expect(
      errorsOf(
        mutate((o) => {
          Object.assign(o.offers[0] as object, {
            venueId: "musikschule-beispiel-sued",
            id: "familientreff-beispiel--pekip-herbst--musikschule-beispiel-sued",
          });
        }),
      ),
    ).toContain("gehört zu musikschule-beispiel");
    expect(
      errorsOf(
        mutate((_o, p) => {
          p.push(structuredClone(p[0]) as Record<string, unknown>);
        }),
      ),
    ).toContain("Anbieter-ID doppelt");
  });

  it("prüft die ID-Regel (ADR 0006)", () => {
    expect(
      errorsOf(
        mutate((o) => {
          Object.assign(o.offers[0] as object, {
            id: "familientreff-beispiel--pekip-herbst--familientreff-beispiel-haus",
          });
        }),
      ),
    ).toContain("erwartet familientreff-beispiel--pekip-gruppe-herbst");
  });

  it("prüft Rollen: Pflichtorte, coveredBy und Angebote nur von Anbietern", () => {
    const aggregator = {
      id: "kalender-mit-adapter",
      role: "aggregator",
      adapter: "evtermine",
      name: "Sammelkalender (fiktiv)",
      url: "https://example.org/kalender",
      venues: [],
      topics: ["krabbelgruppe"],
      formats: ["regelmaessig"],
      costs: ["kostenlos"],
      registrations: ["ohne-anmeldung"],
      programme: [{ url: "https://example.org/kalender/json", kind: "json-api" }],
      availability: { shown: "nein" },
      verified: "2026-10-04",
    };
    expect(errorsOf(mutate((_o, p) => p.push(structuredClone(aggregator))))).toBe("");
    expect(
      errorsOf(mutate((_o, p) => p.push({ ...structuredClone(aggregator), role: "anbieter", adapter: undefined }))),
    ).toContain("venues");
    expect(errorsOf(mutate((_o, p) => p.push({ ...structuredClone(aggregator), role: "verzeichnis" })))).toContain(
      "adapter",
    );
    expect(errorsOf(mutate((_o, p) => Object.assign(p[0] as object, { coveredBy: "musikschule-beispiel" })))).toContain(
      "coveredBy musikschule-beispiel ist kein Sammelkalender",
    );
    expect(
      errorsOf(
        mutate((_o, p) => {
          p.push(structuredClone(aggregator));
          Object.assign(p[0] as object, { coveredBy: "kalender-mit-adapter" });
        }),
      ),
    ).toBe("");
    expect(
      errorsOf(
        mutate((_o, p) => {
          Object.assign(p[0] as object, { role: "aggregator" });
        }),
      ),
    ).toContain("ist kein Anbieter (aggregator)");
    expect(errorsOf(mutate((_o, p) => Object.assign(p[1] as object, { costs: ["kostenlos", "kostenlos"] })))).toContain(
      "doppelt",
    );
  });

  it("weist komplett vergangene Angebote und Prüfzeitpunkte nach generatedAt ab", () => {
    expect(errorsOf(mutate((o) => (o.generatedAt = "2027-03-01T06:00:00+01:00")))).toContain("Vergangenheit");
    expect(
      errorsOf(
        mutate((o) => {
          (o.offers[0] as { availability: { checkedAt: string } }).availability.checkedAt = "2026-10-06T06:00:00+02:00";
        }),
      ),
    ).toContain("checkedAt");
  });
});

describe("checkPlausibility", () => {
  const now = new Date("2026-10-05T12:00:00+02:00");
  const summary = { offers: 40, providers: 10, generatedAt: "2026-10-05T06:00:00+02:00" };

  it("lässt normale Schwankung durch", () => {
    expect(checkPlausibility(summary, { ...summary, offers: 60 }, { fixture: false, now })).toEqual({
      errors: [],
      warnings: [],
    });
  });
  it("stoppt Einbrüche über 50 % gegenüber dem deployten Stand", () => {
    expect(checkPlausibility({ ...summary, offers: 10 }, summary, { fixture: false, now }).errors[0]).toContain(
      "eingebrochen",
    );
  });
  it("erlaubt leeren Bestand nur bei Fixtures", () => {
    const empty = { ...summary, offers: 0 };
    expect(checkPlausibility(empty, undefined, { fixture: true, now }).errors).toEqual([]);
    expect(checkPlausibility(empty, undefined, { fixture: false, now }).errors).toHaveLength(1);
  });
  it("warnt bei altem Datenstand", () => {
    const later = new Date("2026-11-01T12:00:00+01:00");
    expect(checkPlausibility(summary, undefined, { fixture: false, now: later }).warnings[0]).toContain("Tage alt");
  });
});

describe("Themen und Kategorien", () => {
  it("nutzt jede Kategorie mindestens einmal", () => {
    const used = new Set(Object.values(TOPIC_CATEGORIES).flat());
    expect(CATEGORIES.filter((c) => !used.has(c))).toEqual([]);
  });
  it("leitet Kategorien kanonisch sortiert und ohne Dubletten ab", () => {
    expect(categoriesOf(["singen", "vorlesen", "musik", "vaeter"])).toEqual(["musik", "buecher"]);
  });
});
