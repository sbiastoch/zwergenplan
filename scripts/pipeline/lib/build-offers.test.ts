import { describe, expect, it } from "vitest";
import { shortId } from "../../../src/domain/ids.ts";
import { OffersFile, type Provider } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import { fallbackCategory } from "../../../src/domain/topics.ts";
import {
  type BuildInput,
  batchesFromRaw,
  buildOffers,
  type Candidate,
  dropSameSourceDuplicates,
  isNewRun,
} from "./build-offers.ts";
import { ProviderRaw, RawBatch, RawEvent } from "./raw.ts";
import { checkIdContinuity, type Draft, SAME_SOURCE_SESSIONS, windowKey } from "./stable-ids.ts";

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
/** Abgleich zwischen Einheiten ohne Vorstand (Plan 0048, E12) */
const MATCH = { previous: undefined, horizon: { from: "2026-10-05", to: "2027-02-05" }, freeDays: {} };
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

  it("Geburtszeitraum im Titel ersetzt das Alter bei Kurs und Einzeltermin, nicht bei regelmäßig (Plan 0053, E3)", () => {
    const course = (title: string, over: Record<string, unknown> = {}) =>
      ev({
        title,
        format: "kurs",
        registration: "mit-anmeldung",
        age: { minMonths: 0, maxMonths: 12 },
        schedule: { kind: "dates", dates: [{ start: "2026-10-12T09:30" }, { start: "2026-10-19T09:30" }] },
        ...over,
      });
    const { file, report } = buildOffers(
      base({
        batches: [
          batch("batch-1", [
            course("PEKiP Babys geb. April–Juni 2026"),
            course("Schnupperstunde (geb. Juni–Aug. 2026)", {
              format: "einmalig",
              schedule: { kind: "dates", dates: [{ start: "2026-10-12T09:30" }, { start: "2027-01-11T09:30" }] },
            }),
            course("Musikgarten geb. 04/2021-07/2021"),
            ev({ title: "Miniclub: Kinder geb. 02-06/2026", age: { minMonths: 4, maxMonths: 9 } }),
          ]),
        ],
      }),
    );
    expect(report.errors).toEqual([]);
    const ages = Object.fromEntries((file?.offers ?? []).map((o) => [`${o.title} ${o.sessions[0]?.start}`, o.age]));
    expect(ages).toEqual({
      "PEKiP Babys geb. April–Juni 2026 2026-10-12T09:30:00+02:00": { minMonths: 3, maxMonths: 6 },
      "Schnupperstunde (geb. Juni–Aug. 2026) 2026-10-12T09:30:00+02:00": { minMonths: 1, maxMonths: 4 },
      "Schnupperstunde (geb. Juni–Aug. 2026) 2027-01-11T09:30:00+01:00": { minMonths: 4, maxMonths: 7 },
      "Miniclub: Kinder geb. 02-06/2026 2026-10-07T10:00:00+02:00": { minMonths: 4, maxMonths: 9 },
    });
    expect(report.notes.join("\n")).toContain("Musikgarten geb. 04/2021-07/2021");
  });

  it("Einzeltermine eines Jahrgangs: wächst er über 36 Monate, entfallen nur die späteren Termine (Arch-Review 0053, M1)", () => {
    // geb. 10/2023: am 12.10.2026 35–36 Monate, am 11.1.2027 38–39 Monate
    const { file, report } = buildOffers(
      base({
        batches: [
          batch("batch-1", [
            ev({
              title: "Spielstunde (geb. 10/2023)",
              format: "einmalig",
              registration: "mit-anmeldung",
              schedule: { kind: "dates", dates: [{ start: "2026-10-12T09:30" }, { start: "2027-01-11T09:30" }] },
            }),
          ]),
        ],
      }),
    );
    expect(report.errors).toEqual([]);
    expect(file?.offers.map((o) => [o.sessions[0]?.start, o.age])).toEqual([
      ["2026-10-12T09:30:00+02:00", { minMonths: 35, maxMonths: 36 }],
    ]);
    expect(report.notes.join("\n")).toContain("1 Termin(e) erst ab über 36 Monaten – entfallen");
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

  it("Geburtszeitraum bei fortgeschriebenem Kurs: Alter am wirklichen Kursbeginn (Plan 0053, E3)", () => {
    const pekip = (dates: string[]) =>
      ev({
        title: "PEKiP geb. April–Juni 2026",
        format: "kurs",
        topics: ["pekip"],
        schedule: { kind: "dates", dates: dates.map((d) => ({ start: `${d}T09:30` })) },
      });
    const first = buildOffers(
      base({ batches: [batch("batch-1", [pekip(["2026-09-29", "2026-10-06", "2026-10-13"])])] }),
    ).file as OffersFile;
    const second = buildOffers(
      base({
        previous: first,
        horizon: { from: "2026-10-12", to: "2027-02-12" },
        generatedAt: "2026-10-12T06:00:00+02:00",
        batches: [batch("batch-1", [pekip(["2026-10-13"])])],
      }),
    );
    // am 29.9.: geb. 30.6. → 2 Monate, geb. 1.4. → 5 Monate (am 13.10. wären es 3–6)
    expect(first.offers[0]?.age).toEqual({ minMonths: 2, maxMonths: 5 });
    expect(second.file?.offers[0]?.sessions).toHaveLength(3);
    expect(second.file?.offers[0]?.age).toEqual({ minMonths: 2, maxMonths: 5 });
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
      MATCH,
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
      MATCH,
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
        "familientreff-beispiel: 1 Angebot ohne category – aus den Themen abgeleitet (Übergang Plan 0037)",
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
      // Ab Stufe B verlangt der Typ `category`; ein Altbestand ohne das Feld kommt nur noch aus einer Datei vor A6.
      // Der JSON-Umweg (implizites `any` statt `as`) baut ihn nach, bis Stufe C das Netz entfernt (Plan 0037, E5).
      const ohne: OffersFile = JSON.parse(
        JSON.stringify({ ...prev, offers: prev.offers.map(({ category: _, ...o }) => o) }),
      );
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

describe("dropSameSourceDuplicates: Dubletten gleicher Quelle (Plan 0038, E1; ADR 0031)", () => {
  const FROM = "2026-10-05";
  /** n Dienstage 9:30 ab dem 03.11.2026 (Index i ab `first`); bis März ohne Zeitumstellung, also +01:00 */
  const tuesdays = (n: number, first = 0) =>
    Array.from({ length: n }, (_, k) => {
      const day = new Date(Date.UTC(2026, 10, 3 + 7 * (first + k))).toISOString().slice(0, 10);
      return { start: `${day}T09:30:00+01:00`, end: `${day}T11:00:00+01:00` };
    });
  const draft = (over: Partial<Draft> = {}): Draft => ({
    providerId: "turnverein-beispiel",
    venueId: "turnverein-beispiel-halle",
    title: "PEKiP (geb. Jan.–März 2026), dienstags 9:30",
    summary: "Spielen und Bewegen für Babys (fiktiv).",
    category: "babykurse",
    topics: ["pekip"],
    format: "kurs",
    registration: "mit-anmeldung",
    cost: "kostenpflichtig",
    sessions: tuesdays(10),
    availability: { status: "frei", checkedAt: CHECKED },
    url: "https://example.org/turnverein/pekip",
    sourceUrl: "https://example.org/turnverein",
    ...over,
  });
  const cand = (order: number, over: Partial<Draft> = {}, rank = 0): Candidate => {
    const offer = draft(over);
    return {
      offer,
      rank,
      order,
      label: `turnverein-beispiel#${order} „${offer.title}“`,
      batch: "turnverein-beispiel",
      derivedCategory: false,
    };
  };
  const none = new Set<string>();

  it("5) gleiche Quelle, gleicher Kerntitel, gleiche Termine → das frühere bleibt, Themen vereinigt", () => {
    const a = { ...cand(0, { age: { minMonths: 0, maxMonths: 12 } }), derivedCategory: true };
    const b = cand(1, {
      title: "PEKiP-Gruppe (Babys geb. Jan.–März 2026)",
      topics: ["pekip", "babymassage"],
      category: "bewegung",
      age: { minMonths: 7, maxMonths: 10 },
    });
    const { kept, notes } = dropSameSourceDuplicates([a, b], none, FROM);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.offer).toEqual({ ...a.offer, topics: ["pekip", "babymassage"] });
    expect(kept[0]?.derivedCategory).toBe(true);
    expect(notes).toEqual([`${b.label}: Dublette von ${a.label} (gleiche Quelle, gleiche Termine) – entfällt`]);
  });

  it("5) über buildOffers: zwei Fassungen aus einer Rohdatei → ein Angebot mit Hinweis", () => {
    const pekip = (title: string, topics: string[]) =>
      ev({
        providerId: "turnverein-beispiel",
        venueId: "turnverein-beispiel-halle",
        title,
        topics,
        format: "kurs",
        registration: "mit-anmeldung",
        cost: "kostenpflichtig",
        schedule: {
          kind: "weekly",
          weekdays: ["TU"],
          start: "09:30",
          end: "11:00",
          from: "2026-11-03",
          count: 8,
          skipHolidays: true,
        },
      });
    const { file, report } = buildOffers(
      base({
        batches: [
          batch("turnverein-beispiel", [
            pekip("PEKiP (geb. Jan.–März 2026), dienstags 9:30", ["pekip"]),
            pekip("PEKiP-Gruppe (Babys geb. Jan.–März 2026)", ["pekip", "babymassage"]),
          ]),
        ],
      }),
    );
    expect(report.errors).toEqual([]);
    expect(file?.offers.map((o) => [o.title, o.topics])).toEqual([
      ["PEKiP (geb. Jan.–März 2026), dienstags 9:30", ["pekip", "babymassage"]],
    ]);
    expect(report.notes.filter((n) => n.includes("gleiche Quelle, gleiche Termine"))).toEqual([
      "turnverein-beispiel#1 „PEKiP-Gruppe (Babys geb. Jan.–März 2026)“: Dublette von turnverein-beispiel#0 „PEKiP (geb. Jan.–März 2026), dienstags 9:30“ (gleiche Quelle, gleiche Termine) – entfällt",
    ]);
  });

  it("6) Fensterschlüssel im Vorstand gewinnt; Kette A ~ B ~ C → A und C; Eingabe unverändert", () => {
    const x = cand(0, { title: "Babymassage", topics: ["babymassage"] });
    const a = cand(1);
    const b = cand(2, { title: "PEKiP-Gruppe (Babys geb. Jan.–März 2026)", topics: ["pekip", "babymassage"] });
    const input = [x, a, b];
    const before = structuredClone(input);
    const vorstand = dropSameSourceDuplicates(input, new Set([windowKey(b.offer, FROM)]), FROM);
    // sortiert B, X, A; die Ausgabe steht aber in der Reihenfolge der Eingabe
    expect(vorstand.kept.map((c) => c.order)).toEqual([0, 2]);
    expect(vorstand.kept[1]?.offer.title).toBe(b.offer.title);
    expect(vorstand.notes).toEqual([
      `${a.label}: Dublette von ${b.label} (gleiche Quelle, gleiche Termine) – entfällt`,
    ]);
    expect(input).toEqual(before);

    // Jaccard A/B = B/C = 9/11 ≈ 0,82, A/C = 8/12 ≈ 0,67
    const chain = [
      cand(0, { sessions: tuesdays(10, 0) }),
      cand(1, { sessions: tuesdays(10, 1) }),
      cand(2, { sessions: tuesdays(10, 2) }),
    ];
    const chainBefore = structuredClone(chain);
    const kette = dropSameSourceDuplicates(chain, none, FROM);
    expect(kette.kept.map((c) => c.order)).toEqual([0, 2]);
    expect(kette.notes).toHaveLength(1);
    expect(kette.notes[0]).toContain("turnverein-beispiel#1");
    expect(chain).toEqual(chainBefore);
  });

  it.each<[string, Partial<Draft>, Partial<Draft>, number?]>([
    ["verschiedenem Kerntitel", { title: "Babyturnen (Di 9:30)" }, { title: "PEKiP (Babys im ersten Lebensjahr)" }],
    ["benannten Gruppen", { title: "Spielgruppe Mäuse (Di 9:30)" }, { title: "Spielgruppe Bären (Di 9:30)" }],
    ["verschiedener Gruppenkennung", { title: "PEKiP Gruppe A (Di 9:30)" }, { title: "PEKiP Gruppe B (Di 9:30)" }],
    [
      "Alter 9–15 / 12–36 Monate (Review M2)",
      { title: "Turnen (Di 9:30)", age: { minMonths: 9, maxMonths: 15 } },
      { title: "Turnen (Di 9:30)", age: { minMonths: 12, maxMonths: 36 } },
    ],
    ["verschiedenem Format", { format: "kurs" }, { format: "regelmaessig" }],
    ["verschiedenem Rang (das bleibt Schritt 4)", {}, {}, 1],
  ])("7) Parallelkurse mit gleichen Terminen bleiben beide bei %s", (_, over1, over2, rank2 = 0) => {
    const { kept, notes } = dropSameSourceDuplicates([cand(0, over1), cand(1, over2, rank2)], none, FROM);
    expect(kept.map((c) => c.order)).toEqual([0, 1]);
    expect(notes).toEqual([]);
  });

  it("8) Schwelle SAME_SOURCE_SESSIONS = 0,8 auf den Terminen ab from; laufender Kurs mit und ohne Vergangenes", () => {
    expect(SAME_SOURCE_SESSIONS).toBe(0.8);
    const pair = (n1: number, n2: number) =>
      dropSameSourceDuplicates([cand(0, { sessions: tuesdays(n1) }), cand(1, { sessions: tuesdays(n2) })], none, FROM)
        .kept.length;
    expect(pair(16, 20)).toBe(1); // 16/20 = 0,8
    expect(pair(15, 19)).toBe(2); // 15/19 ≈ 0,79
    // mit vergangenen Terminen nur 6/10; ab from (01.12.) gleich
    const laufend = [cand(0, { sessions: tuesdays(10) }), cand(1, { sessions: tuesdays(6, 4) })];
    const ab = dropSameSourceDuplicates(laufend, none, "2026-12-01");
    expect(ab.kept.map((c) => c.order)).toEqual([0]);
    expect(ab.kept[0]?.offer.sessions).toHaveLength(10);
    expect(dropSameSourceDuplicates(laufend, none, FROM).kept).toHaveLength(2);
  });

  it("17) über buildOffers: Zwillinge im Vorstand, beide Fassungen neu betitelt → eine alte ID bleibt (E1 + E2)", () => {
    const pekip = (title: string) =>
      ev({
        providerId: "turnverein-beispiel",
        venueId: "turnverein-beispiel-halle",
        title,
        topics: ["pekip"],
        format: "kurs",
        registration: "mit-anmeldung",
        cost: "kostenpflichtig",
        schedule: {
          kind: "weekly",
          weekdays: ["FR"],
          start: "09:30",
          end: "11:00",
          from: "2026-11-06",
          count: 8,
          skipHolidays: true,
        },
      });
    const status = { "turnverein-beispiel": ok }; // sonst übernähme Schritt 7 den weggefallenen Zwilling
    const once = (title: string, id: string) => {
      const [offer] =
        buildOffers(base({ batches: [batch("turnverein-beispiel", [pekip(title)], status)] })).file?.offers ?? [];
      if (offer === undefined) throw new Error(`kein Angebot für „${title}“`);
      return { ...offer, id };
    };
    // Vorstand aus der Zeit vor Schritt 4b: dasselbe Angebot zweimal, mit gleichen Terminen (Zwillinge, E2)
    const previous: OffersFile = {
      generatedAt: "2026-10-04T06:00:00+02:00",
      horizon: { from: "2026-10-04", to: "2027-02-04" },
      offers: [
        once("PEKiP Fr 9:30 (geb. Jan.–März)", "aaaaaaaa"),
        once("PEKiP-Gruppe (geb. Jan.–März, freitags)", "bbbbbbbb"),
      ],
    };
    // Beide Fassungen neu betitelt: Kein Fensterschlüssel trifft den Vorstand, also entscheidet in 4b die Reihenfolge
    // (das erste Event bleibt), und Stufe 0 greift nicht. So trifft der Entwurf beide Zwillinge in Stufe 1 gleich gut,
    // und die Rangfolge aus E2 entscheidet: höhere Titelähnlichkeit zu „PEKiP-Gruppe (Babys geb. Jan.–März)“ hat
    // bbbbbbbb (wie Test 9 in stable-ids.test.ts) – obwohl aaaaaaaa die kleinere ID wäre.
    const { file, report } = buildOffers(
      base({
        previous,
        batches: [
          batch(
            "turnverein-beispiel",
            [pekip("PEKiP-Gruppe (Babys geb. Jan.–März)"), pekip("PEKiP Fr 9:30 Uhr (geb. Jan.–März)")],
            status,
          ),
        ],
      }),
    );
    expect(report.errors).toEqual([]);
    const offers = file?.offers ?? [];
    expect(offers.map((o) => [o.id, o.title])).toEqual([["bbbbbbbb", "PEKiP-Gruppe (Babys geb. Jan.–März)"]]);
    expect(report.notes).toContain(
      "turnverein-beispiel#1 „PEKiP Fr 9:30 Uhr (geb. Jan.–März)“: Dublette von turnverein-beispiel#0 „PEKiP-Gruppe (Babys geb. Jan.–März)“ (gleiche Quelle, gleiche Termine) – entfällt",
    );
    expect(report.notes).toContain(
      "IDs: Zwilling im Vorstand – aaaaaaaa „PEKiP Fr 9:30 (geb. Jan.–März)“ fällt weg, bbbbbbbb „PEKiP-Gruppe (geb. Jan.–März, freitags)“ bleibt",
    );
    expect(report.notes).toContain(
      "IDs: Stufe 1 bbbbbbbb „PEKiP-Gruppe (geb. Jan.–März, freitags)“ → „PEKiP-Gruppe (Babys geb. Jan.–März)“",
    );
    expect(report.notes.join("\n")).not.toContain("mehrdeutig");
    // Das Netz meldet nur Anbieterwechsel einer bleibenden ID; der Wegfall eines Zwillings ist keiner
    expect(checkIdContinuity(previous, offers)).toEqual([]);
  });
});

describe("listedAt: zuerst im Zwergenplan (Plan 0043, E1)", () => {
  const LATER = "2026-10-06T06:00:00+02:00";
  const weekly = (over: Record<string, unknown> = {}) =>
    ev({
      schedule: {
        kind: "weekly",
        weekdays: ["WE"],
        start: "10:00",
        end: "11:30",
        from: "2026-10-07",
        skipHolidays: true,
      },
      ...over,
    });
  const dates = (days: string[], over: Record<string, unknown> = {}) =>
    ev({ schedule: { kind: "dates", dates: days.map((d) => ({ start: `${d}T10:00` })) }, ...over });
  const build = (events: unknown[], over: Partial<BuildInput> = {}) => {
    const { file, report } = buildOffers(base({ batches: [batch("batch-1", events)], ...over }));
    expect(report.errors).toEqual([]);
    return file as OffersFile;
  };
  const again = (previous: OffersFile, events: unknown[], over: Partial<BuildInput> = {}) =>
    build(events, { previous, generatedAt: LATER, ...over });

  it("ein neues Angebot bekommt generatedAt, eine zugeordnete ID behält das Datum des Vorgängers", () => {
    const first = build([ev()]);
    expect(first.offers[0]?.listedAt).toBe("2026-10-05T06:00:00+02:00");
    const second = again(first, [ev({ title: "Offener Krabbeltreff (neu)" }), ev({ title: "Zwergentreff" })]);
    const byTitle = new Map(second.offers.map((o) => [o.title, o]));
    expect(byTitle.get("Offener Krabbeltreff (neu)")?.id).toBe(first.offers[0]?.id);
    expect(byTitle.get("Offener Krabbeltreff (neu)")?.listedAt).toBe("2026-10-05T06:00:00+02:00");
    expect(byTitle.get("Zwergentreff")?.listedAt).toBe(LATER);
  });

  it("ein Vorgänger ohne Feld bleibt ohne (kein Nachtragen für den Bestand)", () => {
    const first = build([ev()]);
    const bare = { ...first, offers: first.offers.map(({ listedAt: _, ...o }) => o) };
    expect(again(bare, [ev()]).offers[0]?.listedAt).toBeUndefined();
  });

  it("die Übernahme aus dem Altbestand behält das Feld", () => {
    const { file: prev } = loadFixtures();
    const listed = prev.offers.filter((o) => o.listedAt !== undefined);
    expect(listed.length).toBeGreaterThan(0);
    const { file } = buildOffers(base({ previous: prev, generatedAt: LATER, batches: [batch("batch-1", [], {})] }));
    const after = new Map(file?.offers.map((o) => [o.id, o.listedAt]));
    const carried = listed.filter((o) => after.has(o.id));
    expect(carried.length).toBeGreaterThan(0);
    for (const o of carried) expect(after.get(o.id)).toBe(o.listedAt);
  });

  it("eine laufende Kursfortschreibung behält das Datum", () => {
    const kurs = (days: string[]) => dates(days, { title: "PEKiP", format: "kurs", topics: ["pekip"] });
    const first = build([kurs(["2026-09-29", "2026-10-06", "2026-10-13"])]);
    const second = again(first, [kurs(["2026-10-13"])], {
      horizon: { from: "2026-10-12", to: "2027-02-12" },
      generatedAt: "2026-10-12T06:00:00+02:00",
    });
    expect(second.offers[0]?.id).toBe(first.offers[0]?.id);
    expect(second.offers[0]?.listedAt).toBe(first.offers[0]?.listedAt);
  });

  it("wächst ein unbefristetes Angebot mit dem Horizont, bleibt das Datum (Review 4, B1)", () => {
    const first = build([weekly()]);
    const second = again(first, [weekly()], {
      horizon: { from: "2026-10-12", to: "2027-02-12" },
      generatedAt: "2026-10-12T06:00:00+02:00",
    });
    expect(second.offers[0]?.sessions.at(-1)?.start.slice(0, 10)).toBe("2027-02-10");
    expect(second.offers[0]?.listedAt).toBe(first.offers[0]?.listedAt);
  });

  it("ein angehängter Nachholtermin kurz nach dem letzten lässt das Datum stehen", () => {
    const first = build([dates(["2026-10-07", "2026-10-14", "2026-10-21"])]);
    const second = again(first, [dates(["2026-10-07", "2026-10-14", "2026-10-21", "2026-11-02"])]);
    expect(second.offers[0]?.id).toBe(first.offers[0]?.id);
    expect(second.offers[0]?.listedAt).toBe(first.offers[0]?.listedAt);
  });

  it("ein neuer Kursdurchgang unter alter ID gilt als neu: im alten Horizont und mindestens 14 Tage Pause", () => {
    const kurs = (days: string[]) => dates(days, { title: "PEKiP", format: "kurs", topics: ["pekip"] });
    const first = build([kurs(["2026-10-07", "2026-10-14", "2026-10-21"])]);
    // 21.10. → 4.11.: genau 14 Tage, im alten Horizont (bis 5.2.2027)
    const run = again(first, [kurs(["2026-10-07", "2026-10-14", "2026-10-21", "2026-11-04", "2026-11-11"])]);
    expect(run.offers[0]?.id).toBe(first.offers[0]?.id);
    expect(run.offers[0]?.listedAt).toBe(LATER);
    // 13 Tage Pause: Fortschreibung
    const close = again(first, [kurs(["2026-10-07", "2026-10-14", "2026-10-21", "2026-11-03"])]);
    expect(close.offers[0]?.listedAt).toBe(first.offers[0]?.listedAt);
  });

  it("regelmäßig: ein weiterer veröffentlichter Termin ist nie ein neuer Durchgang (Arch-Review M1, Bücherzwerge)", () => {
    // monatlich, der Anbieter nennt nur die nächsten Termine; der Januartermin kommt 35 Tage nach dem letzten dazu
    const first = build([dates(["2026-10-22", "2026-11-19", "2026-12-17"])]);
    const second = again(first, [dates(["2026-10-22", "2026-11-19", "2026-12-17", "2027-01-21"])]);
    expect(second.offers[0]?.id).toBe(first.offers[0]?.id);
    expect(second.offers[0]?.listedAt).toBe(first.offers[0]?.listedAt);
  });

  it("isNewRun: erster neuer Termin nach dem alten Horizont ist kein neuer Durchgang", () => {
    const prev = {
      format: "kurs" as const,
      sessions: [{ start: "2026-10-21T10:00:00+02:00", end: "2026-10-21T11:00:00+02:00" }],
    };
    const next = (day: string) => ({
      format: "kurs" as const,
      sessions: [...prev.sessions, { start: `${day}T10:00:00+01:00`, end: `${day}T11:00:00+01:00` }],
    });
    expect(isNewRun(prev, next("2027-02-03"), "2027-02-05")).toBe(true);
    expect(isNewRun(prev, next("2027-02-05"), "2027-02-05")).toBe(true);
    expect(isNewRun(prev, next("2027-02-06"), "2027-02-05")).toBe(false);
    expect(isNewRun(prev, prev, "2027-02-05")).toBe(false);
    expect(isNewRun({ ...prev, format: "regelmaessig" }, next("2027-02-03"), "2027-02-05")).toBe(false);
    // verlegte Uhrzeit: alle Termine „neu“, aber der erste liegt vor dem letzten alten
    const moved = { ...prev, sessions: [{ start: "2026-10-21T10:30:00+02:00", end: "2026-10-21T11:30:00+02:00" }] };
    expect(isNewRun({ ...prev, sessions: next("2026-11-30").sessions }, moved, "2027-02-05")).toBe(false);
  });

  it("das Rohformat kennt das Feld nicht: nur der Build setzt es", () => {
    expect(RawEvent.safeParse({ ...ev(), listedAt: "2026-10-05T06:00:00+02:00" }).success).toBe(false);
    expect(RawEvent.safeParse(ev()).success).toBe(true);
  });
});

describe("batchesFromRaw je Einheit (Plan 0048, E6)", () => {
  const ID = "familientreff-beispiel";
  const PAGE = "https://example.org/familientreff/programm";
  const url = (k: number) => `${PAGE}/${k}`;
  /** Katalog mit dem Fixture-Anbieter und `n` Terminseiten */
  const catalogWith = (n: number): Provider[] =>
    providers.map((p) =>
      p.id === ID && p.role === "anbieter"
        ? {
            ...p,
            programme: Array.from({ length: n }, (_, k) => ({
              url: url(k),
              kind: "html" as const,
              use: "termine" as const,
            })),
          }
        : p,
    );
  const unit = (events: unknown[], over: Record<string, unknown> = {}) => ({
    events: events.map((e) => RawEvent.parse(e)),
    inputHash: "a".repeat(64),
    model: "opus",
    changedAt: CHECKED,
    status: "ok",
    checkedAt: CHECKED,
    ...over,
  });
  const v2 = (units: Record<string, ReturnType<typeof unit>>): ProviderRaw =>
    ProviderRaw.parse({ version: 2, units: Object.fromEntries(Object.entries(units)) });
  const build = (raw: ProviderRaw, n: number, previous?: OffersFile) => {
    const catalog = catalogWith(n);
    const r = batchesFromRaw({ [ID]: raw }, catalog, { ...MATCH, previous: previous?.offers });
    const out = buildOffers(
      base({ providers: catalog, batches: r.batches, perProviderStatus: true, extracted: r.extracted, previous }),
    );
    return { ...r, ...out };
  };

  it("dasselbe regelmäßige Angebot aus zwei Einheiten mit anderem cost: kein Build-Fehler, ein Angebot", () => {
    const { report, file } = build(
      v2({ [`seite:${url(0)}`]: unit([ev()]), [`seite:${url(1)}`]: unit([ev({ cost: "kostenpflichtig" })]) }),
      2,
    );
    expect(report.errors).toEqual([]);
    expect(file?.offers.filter((o) => o.providerId === ID)).toHaveLength(1);
  });

  it("dasselbe Angebot aus einer Einheit im Fehler und einer mit ok: es bleibt die Fassung der Einheit mit ok", () => {
    const failed = { status: "fehler", reason: "HTTP 503", failingSince: CHECKED };
    const { file } = build(
      v2({
        [`seite:${url(0)}`]: unit([ev({ summary: "Alte Fassung." })], failed),
        [`seite:${url(1)}`]: unit([ev({ summary: "Neue Fassung." })]),
      }),
      2,
    );
    expect(file?.offers.filter((o) => o.providerId === ID).map((o) => o.summary)).toEqual(["Neue Fassung."]);
  });

  it("Batch je Einheit mit eigenem checkedAt; Reihenfolge mit 11 Einheiten nach Katalogindex (#02 vor #10)", () => {
    const units = Object.fromEntries(
      Array.from({ length: 11 }, (_, k) => [
        `seite:${url(k)}`,
        unit(
          [
            ev({
              title: `Treff ${k}`,
              schedule: {
                ...ev().schedule,
                start: `${String(8 + k).padStart(2, "0")}:00`,
                end: `${String(8 + k).padStart(2, "0")}:45`,
              },
            }),
          ],
          { checkedAt: `2026-10-05T05:${String(k).padStart(2, "0")}:00+02:00` },
        ),
      ]),
    );
    const { batches, file } = build(v2(units), 11);
    expect(batches.map((b) => b.name)).toEqual(
      Array.from({ length: 11 }, (_, k) => `${ID}#${String(k).padStart(2, "0")}`),
    );
    expect(file?.offers.find((o) => o.title === "Treff 7")?.availability.checkedAt).toBe("2026-10-05T05:07:00+02:00");
  });

  it("Einheit im Fehler: ihre alten Events bleiben, neue der anderen kommen, keine ID fehlt", () => {
    const { file: prev } = loadFixtures();
    const failed = {
      status: "fehler",
      reason: "HTTP 404",
      failingSince: CHECKED,
      klasse: "voruebergehend",
      klasseSince: CHECKED,
    };
    const raw = v2({
      [`seite:${url(0)}`]: unit([ev()], failed),
      [`seite:${url(1)}`]: unit([
        ev({ title: "Neuer Kurs am Freitag", schedule: { ...ev().schedule, weekdays: ["FR"] } }),
      ]),
    });
    const { file, report } = build(raw, 2, prev);
    expect(report.errors).toEqual([]);
    const titles = file?.offers.filter((o) => o.providerId === ID).map((o) => o.title);
    expect(titles).toEqual(expect.arrayContaining(["Offener Krabbeltreff", "Neuer Kurs am Freitag"]));
    const oldId = prev.offers.find((o) => o.title === "Offener Krabbeltreff")?.id;
    expect(file?.offers.find((o) => o.title === "Offener Krabbeltreff")?.id).toBe(oldId);
    expect(report.providers.ok).toContain(ID);
  });

  it("Zwillinge verschiedener Einheiten (kurs/regelmaessig) fallen vor mergeParts zusammen, mit Hinweis", () => {
    const kurs = ev({
      format: "kurs",
      schedule: {
        kind: "weekly",
        weekdays: ["WE"],
        start: "10:00",
        end: "11:30",
        from: "2026-10-07",
        count: 6,
        skipHolidays: false,
      },
    });
    const regel = ev({
      schedule: {
        kind: "weekly",
        weekdays: ["WE"],
        start: "10:00",
        end: "11:30",
        from: "2026-10-07",
        count: 6,
        skipHolidays: false,
      },
    });
    const { file, notes } = build(v2({ [`seite:${url(0)}`]: unit([kurs]), [`seite:${url(1)}`]: unit([regel]) }), 2);
    expect(file?.offers.filter((o) => o.providerId === ID)).toHaveLength(1);
    expect(notes.join("\n")).toContain("entfällt, gleich");
  });
});

describe("ID-Erbe aus keepIds (Plan 0049, Nachtrag 2, B3)", () => {
  const status = { "familientreff-beispiel": ok };
  const first = buildOffers(base({ batches: [batch("b", [ev()], status)] })).file;
  const oldId = first?.offers[0]?.id ?? "";
  const renamed = { title: "Krabbelgruppe am Mittwochvormittag", schedule: { ...ev().schedule, start: "10:15" } };

  it("ein umbenanntes Event erbt die alte ID über den Beginn eines seiner Termine", () => {
    const without = buildOffers(base({ previous: first, batches: [batch("b", [ev(renamed)], status)] }));
    expect(without.file?.offers[0]?.id).not.toBe(oldId);
    const heir = ev({ ...renamed, keepIds: { "2026-10-14T10:15:00+02:00": oldId } });
    const r = buildOffers(base({ previous: first, batches: [batch("b", [heir], status)] }));
    expect(r.file?.offers.map((o) => o.id)).toEqual([oldId]);
    expect(r.file?.offers[0]).not.toHaveProperty("keepId");
  });

  it("Einzeltermine: nur der Termin mit Eintrag erbt", () => {
    const once = (keepIds?: Record<string, string>) =>
      ev({
        format: "einmalig",
        title: "Babymassage-Schnupperstunde",
        schedule: { kind: "dates", dates: [{ start: "2026-10-08T10:00" }, { start: "2026-10-15T10:00" }] },
        ...(keepIds ? { keepIds } : {}),
      });
    const before = buildOffers(base({ batches: [batch("b", [once()], status)] })).file;
    const second = before?.offers.find((o) => o.sessions[0]?.start.startsWith("2026-10-15"))?.id ?? "";
    const r = buildOffers(
      base({
        previous: before,
        batches: [
          batch("b", [ev({ ...once({ "2026-10-15T10:00:00+02:00": second }), title: "Babymassage neu" })], status),
        ],
      }),
    );
    const byDay = (day: string) => r.file?.offers.find((o) => o.sessions[0]?.start.startsWith(day))?.id;
    expect(byDay("2026-10-15")).toBe(second);
    expect(byDay("2026-10-08")).not.toBe(second);
  });

  it("zwei verschiedene Erben beim Zusammenlegen: keins gilt, mit Notiz", () => {
    const a = ev({ keepIds: { "2026-10-07T10:00:00+02:00": "aaaaaaaa" } });
    const b = ev({ keepIds: { "2026-10-07T10:00:00+02:00": "bbbbbbbb" } });
    const r = buildOffers(base({ batches: [batch("b", [a, b], status)] }));
    expect(r.report.notes.some((n) => n.includes("ID-Erbe aaaaaaaa und bbbbbbbb treffen zusammen"))).toBe(true);
  });
});

describe("Ursprung je ID (Plan 0049, Nachtrag 2, B2)", () => {
  it("origins nennt den Batch jeder vergebenen ID, nicht den Altbestand", () => {
    const status = { "familientreff-beispiel": ok };
    const r = buildOffers(
      base({
        batches: [
          batch("familientreff-beispiel#00", [ev()], status),
          batch(
            "familientreff-beispiel#01",
            [ev({ title: "Babycafé", schedule: { ...ev().schedule, weekdays: ["FR"] } })],
            status,
          ),
        ],
      }),
    );
    const byTitle = Object.fromEntries((r.file?.offers ?? []).map((o) => [o.title, r.report.origins[o.id]]));
    expect(byTitle).toEqual({
      "Offener Krabbeltreff": "familientreff-beispiel#00",
      Babycafé: "familientreff-beispiel#01",
    });
  });
});
