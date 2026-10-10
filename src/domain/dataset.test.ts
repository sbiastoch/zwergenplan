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
      region: "nuernberg",
      adapter: "frankenkids",
      name: "Sammelkalender (fiktiv)",
      url: "https://example.org/kalender",
      programme: [{ url: "https://example.org/kalender/json", kind: "json-api", use: "termine" }],
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
          const { venues: _v, age: _a, ...source } = p[0] ?? {};
          p[0] = { ...source, role: "aggregator", adapter: "frankenkids" };
        }),
      ),
    ).toContain("ist kein Anbieter (aggregator)");
  });

  // Plan 0030: Der Katalog beschreibt Quellen, die Angebote Inhalte; jede Rolle nur mit ihren Feldern.
  it.each([
    [
      "Facette am Anbieter",
      (p: Array<Record<string, unknown>>) => Object.assign(p[0] as object, { topics: ["pekip"] }),
      "topics",
    ],
    [
      "Facette costs",
      (p: Array<Record<string, unknown>>) => Object.assign(p[0] as object, { costs: ["kostenlos"] }),
      "costs",
    ],
    [
      "Orte am Sammelkalender",
      (p: Array<Record<string, unknown>>) => Object.assign(p.at(-1) as object, { venues: [] }),
      "venues",
    ],
    [
      "Alter am Sammelkalender",
      (p: Array<Record<string, unknown>>) =>
        Object.assign(p.at(-1) as object, { age: { minMonths: 0, maxMonths: 36 } }),
      "age",
    ],
    [
      "Platzhalter in availability.how",
      (p: Array<Record<string, unknown>>) =>
        Object.assign(p[0] as object, { availability: { shown: "nein", how: "-" } }),
      "Platzhalter",
    ],
    [
      "Notiz als String",
      (p: Array<Record<string, unknown>>) => Object.assign(p[0] as object, { notes: "a | b" }),
      "notes",
    ],
    ["leere Notizliste", (p: Array<Record<string, unknown>>) => Object.assign(p[0] as object, { notes: [] }), "notes"],
    ["leere Notiz", (p: Array<Record<string, unknown>>) => Object.assign(p[0] as object, { notes: [""] }), "notes"],
    [
      "Notiz nur aus Leerzeichen",
      (p: Array<Record<string, unknown>>) => Object.assign(p[0] as object, { notes: [" "] }),
      "notes",
    ],
  ])("Katalog: %s → Fehler", (_name, fn, expected) => {
    expect(errorsOf(mutate((_o, p) => fn(p)))).toContain(expected);
  });

  // Plan 0031, Phase a: Region und ausführbare Programmeinträge
  type Cat = Array<Record<string, unknown>>;
  const prog = (p: Cat, i: number) => (p[i] as { programme: Array<Record<string, unknown>> }).programme[0] ?? {};
  const venue0 = (p: Cat) => (p[0] as { venues: Array<Record<string, unknown>> }).venues[0] ?? {};
  it.each([
    ["ohne Region", (p: Cat) => delete (p[0] as Record<string, unknown>)["region"], "region"],
    ["unbekannte Region", (p: Cat) => Object.assign(p[0] as object, { region: "duesseldorf" }), "region"],
    [
      "Ort außerhalb der Region",
      (p: Cat) => Object.assign(venue0(p), { geo: { lat: 51.2277, lon: 6.7735 } }),
      "außerhalb der Region nuernberg",
    ],
    ["ring am Ort", (p: Cat) => Object.assign(venue0(p), { ring: "innen" }), "ring"],
    [
      "fremder Platzhalter in der URL",
      (p: Cat) => Object.assign(prog(p, 0), { url: "https://example.org/?d={heute}" }),
      "{von}",
    ],
    [
      "fremder Platzhalter im Body",
      (p: Cat) => Object.assign(prog(p, 0), { request: { method: "POST", body: '{"from":"{start}"}' } }),
      "{von}",
    ],
    ["Datum im hint", (p: Cat) => Object.assign(prog(p, 0), { hint: "nächster Termin 08.11." }), "Datum"],
    [
      "Body kein JSON",
      (p: Cat) => Object.assign(prog(p, 0), { request: { method: "POST", body: "von={von}" } }),
      "JSON",
    ],
    ["Datum im hint am Ort", (p: Cat) => Object.assign(venue0(p), { hint: "Termine ab 2026-11-01" }), "Datum"],
    ["request ohne body", (p: Cat) => Object.assign(prog(p, 0), { request: { method: "POST" } }), "body"],
    ["blocked ohne since", (p: Cat) => Object.assign(prog(p, 0), { blocked: { reason: "Login" } }), "since"],
  ])("Katalog 0031: %s → Fehler", (_name, fn, expected) => {
    expect(errorsOf(mutate((_o, p) => fn(p)))).toContain(expected);
  });

  // Plan 0031, Phase c: verengt
  it.each([
    ["kind: js", (p: Cat) => Object.assign(prog(p, 0), { kind: "js" }), "kind"],
    ["note am Programmeintrag", (p: Cat) => Object.assign(prog(p, 0), { note: "alt" }), "note"],
    ["Programmeintrag ohne use", (p: Cat) => delete prog(p, 0)["use"], "use"],
    ["nur Infoseiten", (p: Cat) => Object.assign(prog(p, 0), { use: "info" }), "Terminseite"],
    [
      "nur gesperrte Terminseite",
      (p: Cat) => Object.assign(prog(p, 0), { blocked: { reason: "Login", since: "2026-10-04" } }),
      "Terminseite",
    ],
    ["Sammelkalender ohne adapter", (p: Cat) => delete (p.at(-1) as Record<string, unknown>)["adapter"], "adapter"],
    [
      "Platzhalter beim Sammelkalender mit adapter",
      (p: Cat) => Object.assign(prog(p, p.length - 1), { url: "https://example.org/sammelkalender?von={von}" }),
      "keine Platzhalter",
    ],
    [
      "skipCrawl zusammen mit coveredBy",
      (p: Cat) => {
        Object.assign(p[0] as object, { skipCrawl: { reason: "keine Termine online", since: "2026-10-10" } });
        Object.assign(p[0] as object, { coveredBy: "sammelkalender-beispiel" });
      },
      "schließen sich aus",
    ],
  ])("Katalog 0031 Phase c: %s → Fehler", (_name, fn, expected) => {
    expect(errorsOf(mutate((_o, p) => fn(p)))).toContain(expected);
  });

  it("Katalog 0031: skipCrawl setzt die Terminseiten-Regel begründet aus (Nutzerentscheid)", () => {
    const r = mutate((_o, p) => {
      Object.assign(prog(p, 0), { use: "info" });
      Object.assign(p[0] as object, { skipCrawl: { reason: "kein Kursplan online", since: "2026-10-10" } });
    });
    expect(errorsOf(r)).toBe("");
  });

  it("Katalog 0031: Platzhalter, render, use, request, blocked und hint sind gültig", () => {
    const r = mutate((_o, p) =>
      Object.assign(prog(p, 0), {
        url: "https://example.org/programm?von={von}&bis={bis}",
        render: "browser",
        use: "termine",
        hint: "nur Gruppen ab 0 und ab 1",
        request: {
          method: "POST",
          headers: { Origin: "https://example.org" },
          body: '{"query":"query { courses(options:{limit:50}) { items { id start } } }","variables":{"from":"{von}","to":"{bis}"}}',
        },
      }),
    );
    expect(errorsOf(r)).toBe("");
    expect(
      errorsOf(mutate((_o, p) => Object.assign(venue0(p), { hint: "Babymassage freitags, Krabbelgruppe dienstags" }))),
    ).toBe("");
    expect(errorsOf(r)).toBe("");
  });

  it("Katalog 0031: coveredBy auf einen evtermine-Kalender verlangt eine vid in den Programm-URLs", () => {
    const kalender = {
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
    const withCover = (url: string) =>
      mutate((_o, p) => {
        p.push(structuredClone(kalender));
        Object.assign(p[0] as object, { coveredBy: "ev-kalender" });
        Object.assign(prog(p, 0), { url });
      });
    expect(errorsOf(withCover("https://example.org/programm"))).toContain("vid=");
    expect(errorsOf(withCover("https://www.evangelische-termine.de/veranstaltungen?vid=124"))).toBe("");
  });

  it("Katalog: Notizen als Liste, availability.how mit Text", () => {
    expect(
      errorsOf(
        mutate((_o, p) =>
          Object.assign(p[0] as object, {
            notes: ["Anmeldestart: Mitte August", "Anmeldeschluss: eine Woche vorher"],
            availability: { shown: "nein", how: "keine Angabe" },
          }),
        ),
      ),
    ).toBe("");
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
