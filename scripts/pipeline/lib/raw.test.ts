import { describe, expect, it } from "vitest";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import {
  acceptanceFor,
  CATEGORY_CONFLICT,
  expansionWindow,
  IdAcceptance,
  idAcceptanceIssues,
  ProviderRaw,
  providerRawIssues,
  providerStatus,
  type RawContext,
  validateRaw,
} from "./raw.ts";

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

  describe("Hauptkategorie category (Plan 0037, E2, E4)", () => {
    it("ein Event ohne category ist gültig (alte Stände in data/raw)", () => {
      const r = validateRaw(batch([treff]), ctx);
      expect(r.ok).toBe(true);
    });

    it("warnt, wenn category zu keinem Thema passt, ohne Fehler", () => {
      const r = validateRaw(batch([{ ...treff, category: "musik" }]), ctx);
      expect(errors(r)).toEqual([]);
      expect(r.warnings).toEqual([
        `events.0 („Offener Krabbeltreff“).category: musik ${CATEGORY_CONFLICT} (krabbelgruppe, elterncafe)`,
      ]);
      expect(CATEGORY_CONFLICT).toBe("passt zu keinem Thema");
    });

    it("warnt nicht, wenn category zu einem Thema passt", () => {
      const r = validateRaw(batch([{ ...treff, category: "krabbel-spielgruppen" }]), ctx);
      expect(errors(r)).toEqual([]);
      expect(r.warnings).toEqual([]);
      expect(r.ok && r.batch.events[0]?.category).toBe("krabbel-spielgruppen");
    });
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
          region: "nuernberg",
          adapter: "frankenkids",
          name: "Sammelkalender (fiktiv)",
          url: "https://example.org/agg",
          programme: [{ url: "https://example.org/agg", kind: "html", use: "termine" }],
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

describe("ProviderRaw (Plan 0032, E5)", () => {
  const T = "2026-10-12T03:00:00+02:00";
  const base = { events: [], status: "keine-termine", checkedAt: T, sources: [] };
  const hashed = { inputHash: "a".repeat(64), model: "haiku", changedAt: T };
  const issues = (raw: unknown) => {
    const r = ProviderRaw.safeParse(raw);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it("nimmt gültige Zustände an: extrahiert, Fehler mit Serie, nie extrahiert mit Fehler", () => {
    expect(issues({ ...base, ...hashed })).toEqual([]);
    expect(issues({ ...base, ...hashed, status: "fehler", reason: "HTTP 503", failingSince: T })).toEqual([]);
    expect(issues({ ...base, status: "fehler", reason: "Bot-Schutz", failingSince: T })).toEqual([]);
  });

  it("lehnt Widersprüche ab", () => {
    expect(issues({ ...base, ...hashed, status: "fehler", failingSince: T })).toContain(
      "status fehler braucht einen reason",
    );
    expect(issues({ ...base, ...hashed, status: "fehler", reason: "x" })).toContain(
      "status fehler braucht failingSince",
    );
    expect(issues({ ...base, ...hashed, failingSince: T })).toContain("failingSince nur bei status fehler");
    expect(issues(base)).toContain("ohne inputHash nur status fehler ohne Events");
    expect(issues({ ...base, ...hashed, model: undefined })).toContain(
      "inputHash, model und changedAt gibt es nur zusammen",
    );
    expect(issues({ ...base, ...hashed, checkedAt: "2026-10-12T03:00" })).not.toEqual([]); // Offset Pflicht
    expect(issues({ ...base, ...hashed, via: "x" })).not.toEqual([]); // strikt
  });
});

describe("providerRawIssues (data:validate, Plan 0032 E13)", () => {
  const T = "2026-10-12T03:00:00+02:00";
  const ok = {
    events: [],
    status: "keine-termine",
    checkedAt: T,
    sources: [],
    inputHash: "a".repeat(64),
    model: "haiku",
    changedAt: T,
  };
  const anbieter = new Set(["familientreff-beispiel"]);

  it("gültig, Schemafehler, verwaist, fremde Events", () => {
    expect(providerRawIssues("f.json", "familientreff-beispiel", ok, anbieter)).toEqual([]);
    expect(providerRawIssues("f.json", "familientreff-beispiel", { ...ok, status: "?" }, anbieter)[0]).toMatch(
      /^f\.json: status: /,
    );
    expect(providerRawIssues("f.json", "weg", ok, anbieter)[0]).toContain("weg ist kein Anbieter im Katalog");
    const event = treff;
    expect(
      providerRawIssues(
        "f.json",
        "familientreff-beispiel",
        { ...ok, status: "ok", events: [{ ...event, providerId: "x" }] },
        anbieter,
      ),
    ).toEqual(["f.json: Event „Offener Krabbeltreff“ gehört zu x"]);
  });
});

describe("ProviderRaw Version 2 (Plan 0048, E4)", () => {
  const T = "2026-10-12T03:00:00+02:00";
  const ok = {
    events: [],
    status: "keine-termine",
    checkedAt: T,
    inputHash: "a".repeat(64),
    model: "opus",
    changedAt: T,
  };
  const failed = { events: [], status: "fehler", reason: "HTTP 404", failingSince: T, checkedAt: T };
  const v2 = (units: Record<string, object>) => ({ version: 2, units });
  const issues = (raw: unknown) =>
    providerRawIssues("f.json", "familientreff-beispiel", raw, new Set(["familientreff-beispiel"]));

  it("Regeln je Einheit; klasse nur mit klasseSince und nur bei fehler; sources nur bei kandidaten", () => {
    expect(issues(v2({ "seite:https://a.de/1": ok, kandidaten: { ...ok, sources: ["evtermine"] } }))).toEqual([]);
    expect(issues(v2({ "seite:https://a.de/1": { ...ok, status: "fehler" } })).join("\n")).toMatch(/reason/);
    expect(issues(v2({ "seite:https://a.de/1": { ...failed, klasse: "dauerhaft" } })).join("\n")).toMatch(
      /klasse und klasseSince/,
    );
    expect(issues(v2({ "seite:https://a.de/1": { ...ok, klasse: "dauerhaft", klasseSince: T } })).join("\n")).toMatch(
      /klasse nur bei status fehler/,
    );
    expect(issues(v2({ "seite:https://a.de/1": { ...ok, sources: [] } })).join("\n")).toMatch(
      /sources nur bei kandidaten/,
    );
    expect(issues(v2({ "falsch:x": ok })).length).toBeGreaterThan(0);
  });

  it("fremde Events auch in pending und held (Arch-Review B, m4)", () => {
    const foreign = { ...treff, providerId: "x" };
    const key = { inputHash: "b".repeat(64), model: "opus", events: [foreign] };
    const held = { ...key, since: T, reason: "unklar", lost: ["ab12cd34"] };
    expect(issues(v2({ "seite:a": { ...ok, pending: key } }))).toEqual([
      "f.json: Event „Offener Krabbeltreff“ gehört zu x",
    ]);
    expect(issues(v2({ "seite:a": { ...ok, held } }))).toEqual(["f.json: Event „Offener Krabbeltreff“ gehört zu x"]);
  });

  it("keepIds: Schlüssel ist ein Zeitpunkt mit Offset (Arch-Review B, m5)", () => {
    const withKeep = (keepIds: Record<string, string>) =>
      issues(v2({ "seite:a": { ...ok, status: "ok", events: [{ ...treff, keepIds }] } }));
    expect(withKeep({ "2026-11-02T15:00:00+01:00": "ab12cd34" })).toEqual([]);
    expect(withKeep({ "2026-11-02T15:00": "ab12cd34" }).join("\n")).toMatch(/keepIds/);
    expect(withKeep({ montags: "ab12cd34" }).join("\n")).toMatch(/keepIds/);
  });

  it("V1 bleibt gültig bis S5", () => {
    expect(issues({ ...ok, sources: [] })).toEqual([]);
  });

  it("providerStatus: fehler nur, wenn alle Einheiten fehler sind; sonst ok mit Zahl der Einheiten im Fehler", () => {
    const withEvents = { ...ok, status: "ok", events: [treff] };
    const parse = (raw: unknown) => ProviderRaw.parse(raw);
    expect(providerStatus(parse(v2({ "seite:a": failed, "seite:b": failed })))).toMatchObject({
      status: "fehler",
      failedUnits: 2,
      failingSince: T,
    });
    expect(providerStatus(parse(v2({ "seite:a": failed, "seite:b": withEvents })))).toMatchObject({
      status: "ok",
      failedUnits: 1,
      reason: "seite:a: HTTP 404",
    });
    expect(providerStatus(parse(v2({ "seite:a": ok })))).toEqual({ status: "keine-termine", failedUnits: 0 });
    expect(providerStatus(parse({ ...ok, sources: [] }))).toEqual({ status: "keine-termine", failedUnits: 0 });
  });
});

describe("Hinnehmen-Datei data/id-hinnehmen.yaml (ADR 0041, Punkt 7; Plan 0049, Nachtrag 2, B5)", () => {
  const entry = { anbieter: "familientreff-beispiel", grund: "Kurs neu zugeschnitten", datum: "2026-11-02" };
  /** Tag des Laufs bzw. der Prüfung; alle Einträge oben liegen davor */
  const TODAY = "2026-11-30";

  it("Schema: Liste von {anbieter, grund, datum}, keine weiteren Felder", () => {
    expect(IdAcceptance.parse([entry])).toEqual([entry]);
    expect(IdAcceptance.parse([])).toEqual([]);
    expect(IdAcceptance.safeParse([{ ...entry, grund: "" }]).success).toBe(false);
    expect(IdAcceptance.safeParse([{ ...entry, datum: "2.11.2026" }]).success).toBe(false);
    expect(IdAcceptance.safeParse([{ ...entry, ids: ["ab12cd34"] }]).success).toBe(false);
    expect(IdAcceptance.safeParse({ anbieter: "x" }).success).toBe(false);
  });

  it("acceptanceFor: nur der eigene Anbieter, datum ≥ Berliner Datum von since, der späteste gewinnt", () => {
    const since = "2026-11-01T03:00:00+01:00";
    const other = { ...entry, anbieter: "anderer", datum: "2026-12-01" };
    const earlier = { ...entry, grund: "alt", datum: "2026-10-31" };
    const sameDay = { ...entry, grund: "am selben Tag", datum: "2026-11-01" };
    const later = { ...entry, grund: "später", datum: "2026-11-05" };
    expect(acceptanceFor([], "familientreff-beispiel", since, TODAY)).toBeUndefined();
    expect(acceptanceFor([other, earlier], "familientreff-beispiel", since, TODAY)).toBeUndefined();
    expect(acceptanceFor([sameDay], "familientreff-beispiel", since, TODAY)).toEqual({
      grund: "am selben Tag",
      datum: "2026-11-01",
    });
    expect(acceptanceFor([later, sameDay, earlier], "familientreff-beispiel", since, TODAY)).toEqual({
      grund: "später",
      datum: "2026-11-05",
    });
  });

  it("acceptanceFor: Tag nach Europe/Berlin, nicht nach UTC", () => {
    // 2026-10-31T23:30Z ist in Berlin schon der 1.11.: Ein Eintrag vom 31.10. stammt von vor dem Halten
    const since = "2026-10-31T23:30:00Z";
    expect(acceptanceFor([{ ...entry, datum: "2026-10-31" }], "familientreff-beispiel", since, TODAY)).toBeUndefined();
    expect(acceptanceFor([{ ...entry, datum: "2026-11-01" }], "familientreff-beispiel", since, TODAY)?.datum).toBe(
      "2026-11-01",
    );
  });

  it("acceptanceFor: ein Eintrag mit Datum nach dem Lauf zählt nicht (Arch-Review B, M5)", () => {
    const since = "2026-11-01T03:00:00+01:00";
    const future = { ...entry, datum: "2026-12-24" };
    expect(acceptanceFor([future], "familientreff-beispiel", since, TODAY)).toBeUndefined();
    expect(acceptanceFor([future, { ...entry, datum: TODAY }], "familientreff-beispiel", since, TODAY)?.datum).toBe(
      TODAY,
    );
  });

  it("idAcceptanceIssues: Datum in der Zukunft ist ein Fehler (Arch-Review B, M5)", () => {
    const anbieter = new Set(["familientreff-beispiel"]);
    expect(idAcceptanceIssues("h.yaml", [{ ...entry, datum: TODAY }], anbieter, TODAY)).toEqual([]);
    expect(idAcceptanceIssues("h.yaml", [entry, { ...entry, datum: "2026-12-01" }], anbieter, TODAY)).toEqual([
      "h.yaml: Eintrag 2: Datum 2026-12-01 in der Zukunft – nimmt spätere Verluste ungeprüft hin",
    ]);
  });

  it("idAcceptanceIssues: Schemafehler mit Pfad, unbekannter Anbieter", () => {
    const anbieter = new Set(["familientreff-beispiel"]);
    expect(idAcceptanceIssues("h.yaml", [entry], anbieter, TODAY)).toEqual([]);
    expect(idAcceptanceIssues("h.yaml", [{ ...entry, datum: "morgen" }], anbieter, TODAY)[0]).toMatch(
      /^h\.yaml: 0\.datum: /,
    );
    expect(idAcceptanceIssues("h.yaml", { a: 1 }, anbieter, TODAY)[0]).toMatch(/^h\.yaml: \(Wurzel\): /);
    expect(idAcceptanceIssues("h.yaml", [entry, { ...entry, anbieter: "weg" }], anbieter, TODAY)).toEqual([
      "h.yaml: Eintrag 2: weg ist kein Anbieter im Katalog",
    ]);
  });
});
