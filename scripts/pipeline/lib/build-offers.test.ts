import { describe, expect, it } from "vitest";
import { shortId } from "../../../src/domain/ids.ts";
import { OffersFile, type Provider } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import { fallbackCategory } from "../../../src/domain/topics.ts";
import { type BuildInput, batchesFromRaw, buildOffers } from "./build-offers.ts";
import { ProviderRaw, RawBatch, RawEvent } from "./raw.ts";

const { providers: fixtureProviders } = loadFixtures();
const aggregator: Provider = {
  id: "ev-kalender",
  role: "aggregator",
  region: "nuernberg",
  adapter: "evtermine",
  name: "Sammelkalender (fiktiv)",
  url: "https://example.org/kalender",
  programme: [{ url: "https://example.org/kalender/json", kind: "json-api", use: "termine" }],
  availability: { shown: "nein" },
  verified: "2026-10-04",
};
const providers: Provider[] = [
  // evtermine ordnet über die vid in den Programm-URLs zu (Plan 0031)
  ...fixtureProviders.map((p) =>
    p.id === "stadtbibliothek-beispiel"
      ? {
          ...p,
          coveredBy: "ev-kalender",
          programme: [
            {
              url: "https://www.evangelische-termine.de/veranstaltungen?vid=999",
              kind: "html" as const,
              use: "termine" as const,
            },
          ],
        }
      : p,
  ),
  aggregator,
];

const CHECKED = "2026-10-05T05:00:00+02:00";
const base = (over: Partial<BuildInput> = {}): BuildInput => ({
  batches: [],
  providers,
  freeDays: { "2026-11-04": "Herbstferien" },
  horizon: { from: "2026-10-05", to: "2027-02-05" },
  generatedAt: "2026-10-05T06:00:00+02:00",
  sources: { evtermine: "ok" },
  ...over,
});

const ev = (over: Record<string, unknown> = {}) => ({
  providerId: "familientreff-beispiel",
  venueId: "familientreff-beispiel-haus",
  title: "Offener Krabbeltreff",
  summary: "Spielen und Austausch für Familien mit Babys.",
  topics: ["krabbelgruppe"],
  format: "regelmaessig",
  registration: "ohne-anmeldung",
  cost: "kostenlos",
  url: "https://example.org/familientreff/krabbeltreff",
  sourceUrl: "https://example.org/familientreff/programm",
  availability: { status: "ohne-anmeldung" },
  schedule: {
    kind: "weekly",
    weekdays: ["WE"],
    start: "10:00",
    end: "11:30",
    from: "2026-10-07",
    until: "2026-11-18",
    skipHolidays: true,
  },
  ...over,
});
const batch = (name: string, events: unknown[], status: Record<string, unknown> = {}) => ({
  name,
  checkedAt: CHECKED,
  batch: RawBatch.parse({ providers: status, events }),
});
const ok = { status: "ok", checked: [] };

describe("buildOffers", () => {
  it("expandiert Regeln mit Offset, ohne Ferien, und vergibt neue IDs aus dem Schlüssel (ADR 0022)", () => {
    const { file, report } = buildOffers(
      base({ batches: [batch("batch-1", [ev()], { "familientreff-beispiel": ok })] }),
    );
    expect(report.errors).toEqual([]);
    const [treff] = file?.offers ?? [];
    expect(treff?.id).toBe(shortId("familientreff-beispiel--offener-krabbeltreff--familientreff-beispiel-haus"));
    expect(treff?.sessions.map((s) => s.start)).toEqual([
      "2026-10-07T10:00:00+02:00",
      "2026-10-14T10:00:00+02:00",
      "2026-10-21T10:00:00+02:00",
      "2026-10-28T10:00:00+01:00",
      // 4.11. Herbstferien
      "2026-11-11T10:00:00+01:00",
      "2026-11-18T10:00:00+01:00",
    ]);
    expect(treff?.availability).toEqual({ status: "ohne-anmeldung", checkedAt: CHECKED });
    expect(report.providers.ok).toEqual(["familientreff-beispiel"]);
  });

  it("zerlegt Einzeltermine, schätzt fehlende Enden, kappt das Alter und nimmt nur den Horizont", () => {
    const { file, report } = buildOffers(
      base({
        batches: [
          batch("batch-1", [
            ev({
              title: "Babymassage-Schnupperstunde",
              format: "einmalig",
              registration: "mit-anmeldung",
              cost: "kostenpflichtig",
              price: "10 €",
              age: { minMonths: 1, maxMonths: 72 },
              availability: { status: "frei" },
              registrationWindow: { deadline: "2026-10-15T12:00" },
              schedule: {
                kind: "dates",
                dates: [{ start: "2026-10-01T10:00" }, { start: "2026-10-17T10:00" }, { start: "2026-10-24T10:00" }],
              },
            }),
          ]),
        ],
      }),
    );
    expect(report.errors).toEqual([]);
    expect(file?.offers.map((o) => o.id)).toEqual(
      [
        "familientreff-beispiel--babymassage-schnupperstunde-20261017t1000--familientreff-beispiel-haus",
        "familientreff-beispiel--babymassage-schnupperstunde-20261024t1000--familientreff-beispiel-haus",
      ].map((key) => shortId(key)),
    );
    expect(file?.offers[0]?.sessions).toEqual([
      { start: "2026-10-17T10:00:00+02:00", end: "2026-10-17T11:00:00+02:00" },
    ]);
    expect(file?.offers[0]?.age).toEqual({ minMonths: 1, maxMonths: 36 });
    expect(file?.offers[0]?.registrationWindow).toEqual({ deadline: "2026-10-15T12:00:00+02:00" });
    expect(report.notes.join("\n")).toContain("Endzeit bei 3 Termin(en) auf 60 Min. geschätzt");
  });

  it("Kurse behalten vergangene Termine; laufen über den Horizont; Kurse nach dem Horizont entfallen", () => {
    const kurs = ev({
      title: "PEKiP",
      format: "kurs",
      registration: "mit-anmeldung",
      cost: "kostenpflichtig",
      topics: ["pekip"],
      availability: { status: "wenige" },
      schedule: {
        kind: "weekly",
        weekdays: ["TU"],
        start: "09:30",
        end: "11:00",
        from: "2026-09-22",
        count: 4,
        skipHolidays: true,
      },
    });
    const spaet = ev({
      ...kurs,
      title: "PEKiP Frühjahr",
      schedule: { kind: "dates", dates: [{ start: "2027-03-02T09:30" }] },
    });
    const { file, report } = buildOffers(base({ batches: [batch("batch-1", [kurs, spaet])] }));
    expect(report.errors).toEqual([]);
    expect(file?.offers).toHaveLength(1);
    expect(file?.offers[0]?.id).toBe(
      shortId("familientreff-beispiel--pekip-20260922t0930--familientreff-beispiel-haus"),
    );
    expect(file?.offers[0]?.sessions).toHaveLength(4);
    expect(report.notes.join("\n")).toContain("Kurs beginnt nach dem Horizont");
  });

  it("schreibt laufende Kurse mit dem Altbestand fort (ID bleibt stabil)", () => {
    const first = buildOffers(
      base({
        batches: [
          batch("batch-1", [
            ev({
              title: "PEKiP",
              format: "kurs",
              topics: ["pekip"],
              schedule: {
                kind: "dates",
                dates: ["2026-09-29", "2026-10-06", "2026-10-13"].map((d) => ({ start: `${d}T09:30` })),
              },
            }),
          ]),
        ],
      }),
    ).file as OffersFile;
    const second = buildOffers(
      base({
        previous: first,
        horizon: { from: "2026-10-12", to: "2027-02-12" },
        generatedAt: "2026-10-12T06:00:00+02:00",
        batches: [
          batch("batch-1", [
            ev({
              title: "PEKiP",
              format: "kurs",
              topics: ["pekip"],
              schedule: { kind: "dates", dates: [{ start: "2026-10-13T09:30" }] },
            }),
          ]),
        ],
      }),
    );
    expect(second.file?.offers.map((o) => o.id)).toEqual(first.offers.map((o) => o.id));
    expect(second.file?.offers[0]?.sessions).toHaveLength(3);
    expect(second.report.notes.join("\n")).toContain("Kurs fortgeschrieben");
  });

  it("übernimmt bei der Fortschreibung nur vergangene Termine (verlegter Termin erscheint nicht doppelt)", () => {
    const kurs = (dates: string[]) =>
      ev({
        title: "PEKiP",
        format: "kurs",
        topics: ["pekip"],
        schedule: { kind: "dates", dates: dates.map((d) => ({ start: `${d}T09:30` })) },
      });
    const first = buildOffers(
      base({ batches: [batch("batch-1", [kurs(["2026-09-29", "2026-10-06", "2026-10-13", "2026-10-20"])])] }),
    ).file as OffersFile;
    const second = buildOffers(
      base({
        previous: first,
        horizon: { from: "2026-10-12", to: "2027-02-12" },
        generatedAt: "2026-10-12T06:00:00+02:00",
        batches: [batch("batch-1", [kurs(["2026-10-13", "2026-10-27"])])], // 20.10. auf 27.10. verlegt
      }),
    );
    expect(second.file?.offers[0]?.id).toBe(first.offers[0]?.id);
    expect(second.file?.offers[0]?.sessions.map((s) => s.start.slice(0, 10))).toEqual([
      "2026-09-29",
      "2026-10-06",
      "2026-10-13",
      "2026-10-27",
    ]);
  });

  it("verwirft vergangene Kurse statt den Build abzubrechen; fehlende Stunde beim geschätzten Ende", () => {
    const { file, report } = buildOffers(
      base({
        horizon: { from: "2026-10-05", to: "2027-04-05" },
        batches: [
          batch("batch-1", [
            ev({
              title: "Alter Kurs",
              format: "kurs",
              schedule: { kind: "dates", dates: [{ start: "2026-06-01T10:00" }] },
            }),
            ev({
              title: "Frühschoppen",
              format: "einmalig",
              registrationWindow: { deadline: "2027-03-28T02:15" },
              schedule: { kind: "dates", dates: [{ start: "2027-03-28T01:30" }] },
            }),
          ]),
        ],
      }),
    );
    expect(report.errors).toEqual([]);
    expect(report.notes.join("\n")).toContain("Kurs ist schon vorbei");
    expect(report.notes.join("\n")).toContain("Anmeldefrist 2027-03-28T02:15 entfällt");
    expect(file?.offers[0]?.sessions[0]).toEqual({
      start: "2027-03-28T01:30:00+01:00",
      end: "2027-03-28T03:30:00+02:00", // real 60 Minuten über die Umstellung
    });
  });

  it("vereinigt regelmäßige Termine gleicher ID und meldet Konflikte", () => {
    const mo = ev({ schedule: { kind: "dates", dates: [{ start: "2026-10-12T10:00" }] } });
    const doZusatz = ev({
      topics: ["elterncafe"],
      schedule: { kind: "dates", dates: [{ start: "2026-10-15T10:00" }] },
    });
    const merged = buildOffers(base({ batches: [batch("batch-1", [mo]), batch("batch-2", [doZusatz])] }));
    expect(merged.file?.offers).toHaveLength(1);
    expect(merged.file?.offers[0]?.sessions).toHaveLength(2);
    expect(merged.file?.offers[0]?.topics).toEqual(["krabbelgruppe", "elterncafe"]);

    const lang = "Eltern-Kind-Kurs Musikschule (Kulturwerkstatt Auf AEG, dienstags";
    const gekuerzt = buildOffers(
      base({
        batches: [
          batch("batch-1", [ev({ title: `${lang} 15:45 Uhr)` })]),
          batch("batch-2", [ev({ title: `${lang} 16:45 Uhr)` })]),
        ],
      }),
    );
    expect(gekuerzt.report.errors[0]).toContain("erst nach der Kürzung");

    const conflict = buildOffers(
      base({ batches: [batch("batch-1", [mo, ev({ ...doZusatz, cost: "kostenpflichtig" })])] }),
    );
    expect(conflict.file).toBeUndefined();
    expect(conflict.report.errors[0]).toContain("andere Merkmale");
  });

  it("entfernt Dubletten nach Rangfolge: Anbieterseite > stadt-vk > frankenkids > evtermine", () => {
    const konzert = (via?: string, title = "Babykonzert im Advent") =>
      ev({
        ...(via ? { via } : {}),
        title,
        format: "einmalig",
        topics: ["konzert"],
        schedule: { kind: "dates", dates: [{ start: "2026-12-06T10:00" }] },
      });
    const { file, report } = buildOffers(
      base({
        batches: [
          batch("aggregatoren", [konzert("frankenkids", "Adventliches Babykonzert"), konzert("stadt-vk")]),
          batch("batch-1", [konzert(undefined, "Babykonzert im Advent (Familientreff)")]),
        ],
      }),
    );
    expect(file?.offers).toHaveLength(1);
    expect(file?.offers[0]?.title).toBe("Babykonzert im Advent (Familientreff)");
    expect(report.notes.filter((n) => n.includes("Dublette"))).toHaveLength(2);

    const ohneAnbieter = buildOffers(
      base({ batches: [batch("aggregatoren", [konzert("frankenkids"), konzert("stadt-vk")])] }),
    );
    expect(ohneAnbieter.file?.offers).toHaveLength(1);
  });

  it("meldet mögliche Dubletten über Anbietergrenzen (gleicher Ort, Beginn, ähnlicher Titel)", () => {
    const shared = providers.map((p) =>
      p.id === "musikschule-beispiel" && p.role === "anbieter"
        ? { ...p, venues: p.venues.map((v) => ({ ...v, geo: { lat: 49.4521, lon: 11.0767 } })) }
        : p,
    );
    const zweimal = (providerId: string, venueId: string) =>
      ev({
        providerId,
        venueId,
        title: "Babymassage mit Hebamme",
        format: "einmalig",
        schedule: { kind: "dates", dates: [{ start: "2026-10-20T11:00" }] },
      });
    const { report } = buildOffers(
      base({
        providers: shared,
        batches: [
          batch("batch-1", [
            zweimal("familientreff-beispiel", "familientreff-beispiel-haus"),
            zweimal("musikschule-beispiel", "musikschule-beispiel-sued"),
          ]),
        ],
      }),
    );
    expect(report.notes.join("\n")).toContain("Mögliche Dublette über Anbieter");
  });

  it("übernimmt Altangebote bei Fehlern, ausgefallenem Sammelkalender und ungeprüften Anbietern", () => {
    const { file: prev } = loadFixtures();
    const { file, report } = buildOffers(
      base({
        previous: prev,
        horizon: { from: "2026-10-15", to: "2027-02-15" },
        generatedAt: "2026-10-15T06:00:00+02:00",
        sources: { evtermine: "fehler" },
        batches: [
          batch("batch-1", [], {
            "familientreff-beispiel": { status: "fehler", reason: "503", checked: [] },
            "musikschule-beispiel": ok,
            "theater-beispiel": ok,
          }),
        ],
      }),
    );
    expect(report.errors).toEqual([]);
    const providersOf = new Set(file?.offers.map((o) => o.providerId));
    expect(providersOf).toEqual(new Set(["familientreff-beispiel", "stadtbibliothek-beispiel", "gemeinde-beispiel"]));
    expect(file?.offers.some((o) => o.title === "Elterncafé am Montag")).toBe(false); // Termin vorbei
    const treff = file?.offers.find((o) => o.title === "Offener Krabbeltreff");
    expect(treff?.sessions.every((s) => s.start >= "2026-10-15")).toBe(true); // regelmäßig: nur ab from
    const pekip = file?.offers.find((o) => o.format === "kurs" && o.providerId === "familientreff-beispiel");
    expect(pekip?.sessions).toHaveLength(8); // Kurs unverändert
    expect(report.failures).toEqual([{ id: "familientreff-beispiel", reason: "503" }]);
    expect(report.notes.join("\n")).toContain("ev-kalender nicht erreichbar");
    expect(report.notes.join("\n")).toContain("in diesem Lauf nicht geprüft");
    // übernommene Angebote behalten ihre ID aus dem Vorstand (ADR 0022)
    const before = new Map(prev.offers.map((o) => [o.title, o.id]));
    for (const o of file?.offers ?? []) expect(o.id).toBe(before.get(o.title));
  });

  it("aus data/raw: Anbieter ohne Raw-Datei behalten den Vorstand, auch mit coveredBy (Plan 0032, E5)", () => {
    const { file: prev } = loadFixtures();
    const raw = (over: Partial<ProviderRaw>): ProviderRaw =>
      ProviderRaw.parse({ events: [], status: "keine-termine", checkedAt: CHECKED, sources: [], ...over });
    const hashed = { inputHash: "a".repeat(64), model: "haiku", changedAt: CHECKED };
    const { batches, notes } = batchesFromRaw(
      {
        "familientreff-beispiel": raw({ ...hashed, status: "ok", events: [RawEvent.parse(ev())] }),
        // nie extrahiert, Fehler: Vorstand bleibt
        "gemeinde-beispiel": raw({ status: "fehler", reason: "HTTP 503", failingSince: CHECKED }),
        // bearbeitet, keine Termine: Angebote entfallen
        "musikschule-beispiel": raw({ ...hashed }),
        "theater-beispiel": raw({ ...hashed, status: "ok", events: [RawEvent.parse(ev({ venueId: "abgerissen" }))] }),
        "nicht-mehr-im-katalog": raw({ ...hashed }),
      },
      providers,
    );
    expect(notes.join("\n")).toContain("nicht-mehr-im-katalog.json: kein Anbieter im Katalog");
    expect(notes.join("\n")).toContain("abgerissen nicht im Katalog");
    const { file, report } = buildOffers(
      base({
        previous: prev,
        horizon: { from: "2026-10-15", to: "2027-02-15" },
        generatedAt: "2026-10-15T06:00:00+02:00",
        batches,
        perProviderStatus: true,
      }),
    );
    expect(report.errors).toEqual([]);
    const own = (id: string) => file?.offers.filter((o) => o.providerId === id) ?? [];
    const previousOf = (id: string) => prev.offers.filter((o) => o.providerId === id);
    // stadtbibliothek-beispiel (coveredBy, ohne Raw-Datei) und gemeinde-beispiel (fehler) behalten ihren Vorstand
    for (const id of ["stadtbibliothek-beispiel", "gemeinde-beispiel"]) {
      expect(previousOf(id).length).toBeGreaterThan(0);
      expect(own(id).map((o) => o.id)).toEqual(
        previousOf(id)
          .filter((o) => o.sessions.some((s) => s.start >= "2026-10-15"))
          .map((o) => o.id),
      );
    }
    expect(report.notes.join("\n")).toContain("noch nicht bearbeitet");
    expect(own("musikschule-beispiel")).toEqual([]);
    expect(own("familientreff-beispiel").map((o) => o.title)).toContain("Offener Krabbeltreff");
    expect(own("familientreff-beispiel")[0]?.availability.checkedAt).toBe(CHECKED);
    expect(report.failures).toEqual([{ id: "gemeinde-beispiel", reason: "HTTP 503" }]);
  });

  it("aus data/raw: extrahierter Anbieter mit fehler nimmt nur seine Rohdaten, nichts zusätzlich aus dem Vorstand", () => {
    const { file: prev } = loadFixtures();
    const { batches, extracted } = batchesFromRaw(
      {
        "familientreff-beispiel": ProviderRaw.parse({
          events: [RawEvent.parse(ev())],
          inputHash: "a".repeat(64),
          model: "haiku",
          changedAt: CHECKED,
          status: "fehler",
          reason: "HTTP 503",
          failingSince: CHECKED,
          checkedAt: CHECKED,
          sources: [],
        }),
      },
      providers,
    );
    expect([...extracted]).toEqual(["familientreff-beispiel"]);
    const { file, report } = buildOffers(
      base({ previous: prev, batches, perProviderStatus: true, extracted, generatedAt: "2026-10-05T06:00:00+02:00" }),
    );
    expect(report.errors).toEqual([]);
    expect(prev.offers.filter((o) => o.providerId === "familientreff-beispiel").length).toBeGreaterThan(1);
    expect(file?.offers.filter((o) => o.providerId === "familientreff-beispiel").map((o) => o.title)).toEqual([
      "Offener Krabbeltreff",
    ]);
  });

  it("fasst einen laufenden Kurs aus zwei gleichrangigen Quellen über den Fensterschlüssel zusammen (Review m3)", () => {
    const kurs = (dates: string[]) =>
      ev({
        title: "PEKiP",
        format: "kurs",
        topics: ["pekip"],
        schedule: { kind: "dates", dates: dates.map((d) => ({ start: `${d}T09:30` })) },
      });
    const { file, report } = buildOffers(
      base({
        horizon: { from: "2026-10-12", to: "2027-02-12" },
        generatedAt: "2026-10-12T06:00:00+02:00",
        batches: [
          batch("batch-1", [kurs(["2026-09-29", "2026-10-06", "2026-10-13"]), kurs(["2026-10-13", "2026-10-20"])]),
        ],
      }),
    );
    expect(report.errors).toEqual([]);
    expect(file?.offers).toHaveLength(1);
    expect(file?.offers[0]?.sessions).toHaveLength(4);
  });

  describe("Hauptkategorie category (Plan 0037, E5, E6)", () => {
    it("a) category aus dem Rohevent landet im Angebot, auch in jedem zerlegten Einzeltermin", () => {
      const { file, report } = buildOffers(
        base({
          batches: [
            batch("batch-1", [
              ev({
                title: "Matschen im Hof",
                format: "einmalig",
                category: "kreativ",
                topics: ["kreativ"],
                schedule: { kind: "dates", dates: [{ start: "2026-10-17T10:00" }, { start: "2026-10-24T10:00" }] },
              }),
            ]),
          ],
        }),
      );
      expect(report.errors).toEqual([]);
      expect(file?.offers.map((o) => o.category)).toEqual(["kreativ", "kreativ"]);
      expect(report.derivedCategories).toBe(0);
      expect(report.notes.join("\n")).not.toContain("aus den Themen abgeleitet");
    });

    it("b) ohne category: Rückfall aus den Themen, gezählt und je Anbieter gemeldet", () => {
      const { file, report } = buildOffers(
        base({ batches: [batch("batch-1", [ev({ topics: ["konzert", "musik"] })])] }),
      );
      expect(report.errors).toEqual([]);
      expect(file?.offers[0]?.category).toBe("musik");
      expect(report.derivedCategories).toBe(1);
      expect(report.notes).toContain(
        "familientreff-beispiel: 1 Angebote ohne category – aus den Themen abgeleitet (Übergang Plan 0037)",
      );
    });

    const konzert = (category: string, topics: string[], via?: string, title = "Babykonzert im Advent") =>
      ev({
        ...(via ? { via } : {}),
        title,
        format: "einmalig",
        category,
        topics,
        schedule: { kind: "dates", dates: [{ start: "2026-12-06T10:00" }] },
      });

    it("c) gleicher Schlüssel: Die Kategorie der ranghöheren Quelle gewinnt, Themen werden vereinigt", () => {
      const { file, report } = buildOffers(
        base({
          batches: [
            batch("aggregatoren", [konzert("musik", ["musik"], "stadt-vk")]),
            batch("batch-1", [konzert("buehne", ["konzert"])]),
          ],
        }),
      );
      expect(report.errors).toEqual([]);
      expect(file?.offers).toHaveLength(1);
      expect(file?.offers[0]?.category).toBe("buehne");
      expect(file?.offers[0]?.topics).toEqual(["konzert", "musik"]);
    });

    it("c) gleicher Schlüssel und gleicher Rang: Die Kategorie des früheren Events gewinnt", () => {
      const mo = ev({
        category: "krabbel-spielgruppen",
        schedule: { kind: "dates", dates: [{ start: "2026-10-12T10:00" }] },
      });
      const doZusatz = ev({
        category: "treffs-cafes",
        topics: ["elterncafe"],
        schedule: { kind: "dates", dates: [{ start: "2026-10-15T10:00" }] },
      });
      const { file } = buildOffers(base({ batches: [batch("batch-1", [mo]), batch("batch-2", [doZusatz])] }));
      expect(file?.offers).toHaveLength(1);
      expect(file?.offers[0]?.category).toBe("krabbel-spielgruppen");
      expect(file?.offers[0]?.topics).toEqual(["krabbelgruppe", "elterncafe"]);
    });

    it("d) Dublette über den Titel: Das ranghöhere Angebot behält seine Kategorie", () => {
      const { file } = buildOffers(
        base({
          batches: [
            batch("aggregatoren", [konzert("musik", ["musik"], "frankenkids", "Adventliches Babykonzert")]),
            batch("batch-1", [konzert("buehne", ["konzert"], undefined, "Babykonzert im Advent (Familientreff)")]),
          ],
        }),
      );
      expect(file?.offers).toHaveLength(1);
      expect(file?.offers[0]?.category).toBe("buehne");
      expect(file?.offers[0]?.topics).toEqual(["konzert", "musik"]);
    });

    it("e) Übernahme aus dem Altbestand ohne category: Rückfall, gezählt; f) die Datei besteht OffersFile", () => {
      const { file: prev } = loadFixtures();
      const ohne = { ...prev, offers: prev.offers.map(({ category: _, ...o }) => o) };
      const { file, report } = buildOffers(
        base({
          previous: ohne,
          horizon: { from: "2026-10-15", to: "2027-02-15" },
          generatedAt: "2026-10-15T06:00:00+02:00",
          batches: [
            batch("batch-1", [], {
              "familientreff-beispiel": { status: "fehler", reason: "503", checked: [] },
              "musikschule-beispiel": ok,
              "theater-beispiel": ok,
            }),
          ],
        }),
      );
      expect(report.errors).toEqual([]);
      const offers = file?.offers ?? [];
      expect(offers.length).toBeGreaterThan(0);
      for (const o of offers) expect(o.category).toBe(fallbackCategory(o.topics));
      expect(report.derivedCategories).toBe(offers.length);
      expect(report.notes.join("\n")).toContain(
        "familientreff-beispiel: 3 Angebote ohne category – aus den Themen abgeleitet",
      );
      expect(OffersFile.safeParse(file).success).toBe(true);
    });
  });

  it("sortiert nach Anbieter, Titel und Beginn (Plan 0015 E13) und hält IDs über Läufe", () => {
    const events = [
      ev({ title: "Zwergentreff" }),
      ev({
        title: "Ärzteinfo",
        format: "einmalig",
        schedule: { kind: "dates", dates: [{ start: "2026-10-20T10:00" }] },
      }),
      ev({ providerId: "musikschule-beispiel", venueId: "musikschule-beispiel-sued", title: "Anfang" }),
    ];
    const first = buildOffers(base({ batches: [batch("batch-1", events)] })).file as OffersFile;
    expect(first.offers.map((o) => o.title)).toEqual(["Ärzteinfo", "Zwergentreff", "Anfang"]);
    // zweiter Lauf mit umformulierten Titeln: gleiche Termine, gleiche IDs
    const renamed = events.map((e) => ({ ...e, title: `${e.title} (neu)` }));
    const second = buildOffers(base({ previous: first, batches: [batch("batch-1", renamed)] }));
    expect(second.report.errors).toEqual([]);
    expect(second.file?.offers.map((o) => o.id).sort()).toEqual(first.offers.map((o) => o.id).sort());
  });

  it("meldet Drift, lässt fehlende Stunde und junge-Alter-Grenzen weg und prüft das Ergebnis", () => {
    const { file, report } = buildOffers(
      base({
        horizon: { from: "2026-10-05", to: "2027-04-05" },
        batches: [
          batch(
            "batch-1",
            [
              ev({ format: "einmalig", schedule: { kind: "dates", dates: [{ start: "2027-03-28T02:30" }] } }),
              ev({ title: "Theater ab 4", age: { minMonths: 48, maxMonths: 72 } }),
              ev({
                title: "Alter Kurs",
                format: "kurs",
                schedule: { kind: "dates", dates: [{ start: "2026-06-01T10:00" }] },
              }),
            ],
            { "familientreff-beispiel": { status: "ok", checked: [], drift: "Programm-PDF umgezogen" } },
          ),
        ],
      }),
    );
    expect(report.drift).toEqual([{ id: "familientreff-beispiel", drift: "Programm-PDF umgezogen" }]);
    expect(report.notes.join("\n")).toContain("gibt es in Berlin nicht");
    expect(report.notes.join("\n")).toContain("erst ab 48 Monaten");
    expect(report.errors).toEqual([]);
    expect(file?.offers).toEqual([]);
  });
});
