import { describe, expect, it } from "vitest";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import { expansionWindow, type RawContext, validateRaw } from "./raw.ts";

const { providers } = loadFixtures();
const ctx: RawContext = {
  providers,
  expected: ["familientreff-beispiel"],
  horizon: { from: "2026-10-05", to: "2027-02-05" },
  freeDays: { "2026-11-04": "Herbstferien" },
};

const treff = {
  providerId: "familientreff-beispiel",
  venueId: "familientreff-beispiel-haus",
  title: "Offener Krabbeltreff",
  summary: "Spielen und Austausch für Familien mit Babys, Kaffee steht bereit.",
  topics: ["krabbelgruppe", "elterncafe"],
  format: "regelmaessig",
  registration: "ohne-anmeldung",
  cost: "kostenlos",
  url: "https://example.org/familientreff/krabbeltreff",
  sourceUrl: "https://example.org/familientreff/programm",
  availability: { status: "ohne-anmeldung" },
  schedule: { kind: "weekly", weekdays: ["WE"], start: "10:00", end: "11:30", from: "2026-10-07", skipHolidays: true },
};
const batch = (
  events: unknown[],
  status: Record<string, unknown> = { "familientreff-beispiel": { status: "ok", checked: [] } },
) => ({
  providers: status,
  events,
});
const errors = (r: ReturnType<typeof validateRaw>) => (r.ok ? [] : r.errors);

describe("validateRaw", () => {
  it("akzeptiert ein gültiges Paket", () => {
    const r = validateRaw(batch([treff]), ctx);
    expect(errors(r)).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("meldet Schemafehler mit Pfad und Titel (offene Felder im Entwurf)", () => {
    const { format: _f, ...ohneFormat } = treff;
    const r = validateRaw(batch([{ ...ohneFormat, summary: "" }]), ctx);
    expect(errors(r).join("\n")).toContain("events.0 („Offener Krabbeltreff“).summary");
    expect(errors(r).join("\n")).toContain("events.0 („Offener Krabbeltreff“).format");
  });

  it("verlangt ein Thema mit Kategorie, wie das Angebot (Plan 0030, Review M2)", () => {
    const r = validateRaw(batch([{ ...treff, topics: ["vaeter"] }]), ctx);
    expect(errors(r).join("\n")).toContain("events.0 („Offener Krabbeltreff“).topics: mindestens ein Thema");
  });

  it("prüft Katalog-Referenzen", () => {
    const r = validateRaw(
      batch([
        { ...treff, venueId: "musikschule-beispiel-sued" },
        { ...treff, providerId: "gibts-nicht" },
      ]),
      ctx,
    );
    expect(errors(r)).toEqual([
      "events.0 („Offener Krabbeltreff“): Ort musikschule-beispiel-sued gehört nicht zu familientreff-beispiel (Orte: familientreff-beispiel-haus)",
      "events.1 („Offener Krabbeltreff“): unbekannter Anbieter gibts-nicht",
    ]);
  });

  it("verlangt einen Status je Paket-Anbieter und einen Grund bei fehler", () => {
    expect(errors(validateRaw(batch([], {}), ctx))).toEqual(["providers: Status für familientreff-beispiel fehlt"]);
    expect(
      errors(
        validateRaw(
          batch([], { "familientreff-beispiel": { status: "fehler", checked: [] }, x: { status: "ok", checked: [] } }),
          ctx,
        ),
      ),
    ).toEqual([
      "providers.familientreff-beispiel: status fehler braucht einen reason",
      "providers.x: unbekannter Anbieter",
    ]);
  });

  it("findet Termine in der fehlenden Stunde und verdrehte Zeiten", () => {
    const r = validateRaw(
      batch([
        { ...treff, schedule: { kind: "dates", dates: [{ start: "2027-03-28T02:30" }] }, format: "einmalig" },
        { ...treff, schedule: { kind: "dates", dates: [{ start: "2026-10-10T10:00", end: "2026-10-10T09:00" }] } },
      ]),
      { ...ctx, horizon: { from: "2026-10-05", to: "2027-04-01" } },
    );
    expect(errors(r).join("\n")).toContain("gibt es in Berlin nicht");
    expect(errors(r).join("\n")).toContain("liegt nicht nach Beginn");
  });

  it("warnt vor Events, die im Build entfallen", () => {
    const r = validateRaw(
      batch([
        { ...treff, schedule: { kind: "dates", dates: [{ start: "2027-06-01T10:00" }] } },
        { ...treff, format: "kurs", schedule: { kind: "dates", dates: [{ start: "2027-06-01T10:00" }] } },
        { ...treff, age: { minMonths: 48, maxMonths: 72 } },
        { ...treff, format: "kurs", schedule: { kind: "dates", dates: [{ start: "2026-06-01T10:00" }] } },
      ]),
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(4);
    expect(r.warnings.at(-1)).toContain("schon vorbei");
  });

  it("findet regelmäßige Angebote, deren Titel erst nach der Kürzung abweichen", () => {
    const lang = "Eltern-Kind-Kurs Musikschule (Kulturwerkstatt Auf AEG, dienstags";
    const r = validateRaw(
      batch([
        { ...treff, title: `${lang} 15:45 Uhr)` },
        { ...treff, title: `${lang} 16:45 Uhr)` },
      ]),
      ctx,
    );
    expect(errors(r).join("\n")).toContain("erst nach 60 Zeichen");
  });

  it("lehnt Nicht-Anbieter ab", () => {
    const withAggregator: RawContext = {
      ...ctx,
      providers: [
        ...providers,
        {
          id: "agg",
          role: "aggregator",
          name: "Sammelkalender (fiktiv)",
          url: "https://example.org/agg",
          programme: [{ url: "https://example.org/agg", kind: "html" }],
          availability: { shown: "nein" },
          verified: "2026-10-04",
        },
      ],
    };
    expect(errors(validateRaw(batch([{ ...treff, providerId: "agg" }]), withAggregator))).toEqual([
      "events.0 („Offener Krabbeltreff“): agg ist kein Anbieter (aggregator)",
    ]);
  });
});

describe("expansionWindow", () => {
  it("lässt begrenzte Kurse über den Horizont hinaus laufen", () => {
    const kurs = { format: "kurs" as const };
    expect(
      expansionWindow(
        {
          ...kurs,
          schedule: {
            kind: "weekly",
            weekdays: ["MO"],
            start: "10:00",
            from: "2027-01-11",
            until: "2027-03-29",
            skipHolidays: true,
          },
        },
        "2027-02-05",
      ),
    ).toBe("2027-03-29");
    expect(
      expansionWindow(
        {
          ...kurs,
          schedule: {
            kind: "weekly",
            weekdays: ["MO"],
            start: "10:00",
            from: "2027-01-11",
            count: 10,
            skipHolidays: true,
          },
        },
        "2027-02-05",
      ),
    ).toBe("2029-02-05");
    expect(
      expansionWindow(
        {
          format: "regelmaessig",
          schedule: {
            kind: "weekly",
            weekdays: ["MO"],
            start: "10:00",
            from: "2027-01-11",
            count: 10,
            skipHolidays: true,
          },
        },
        "2027-02-05",
      ),
    ).toBe("2027-02-05");
  });
});
