import { describe, expect, it } from "vitest";
import type { Offer, Provider } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import {
  type CaseResult,
  EvalOffer,
  hasResultFor,
  predictOffers,
  promptHash,
  RESULTS_HEADER,
  resultsRow,
  scoreCase,
  summarize,
  toEvalOffers,
  unusableRun,
} from "./eval-score.ts";
import { RawEvent } from "./raw.ts";

const { providers } = loadFixtures();
const treff = providers.find((p) => p.id === "familientreff-beispiel") as Provider;
const VENUE = "familientreff-beispiel-haus";

const offer = (over: Partial<EvalOffer> = {}): EvalOffer => ({
  title: "Offener Krabbeltreff",
  venueId: VENUE,
  format: "regelmaessig",
  registration: "ohne-anmeldung",
  cost: "kostenlos",
  category: "krabbel-spielgruppen",
  topics: ["krabbelgruppe"],
  availability: { status: "ohne-anmeldung" },
  starts: ["2026-10-14T10:00:00+02:00", "2026-10-21T10:00:00+02:00"],
  ...over,
});

const event = (over: Record<string, unknown> = {}) =>
  RawEvent.parse({
    providerId: treff.id,
    venueId: VENUE,
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
      from: "2026-10-14",
      until: "2026-11-18",
      skipHolidays: true,
    },
    ...over,
  });

describe("toEvalOffers", () => {
  it("nimmt nur Termine im Fenster (Berliner Kalendertag) und lässt Angebote ohne solche weg", () => {
    const offers = [
      {
        id: "aaaaaaaa",
        providerId: treff.id,
        venueId: VENUE,
        title: "Kurs",
        summary: "x",
        category: "babykurse",
        topics: ["pekip"],
        format: "kurs",
        registration: "mit-anmeldung",
        cost: "kostenpflichtig",
        availability: { status: "frei", checkedAt: "2026-10-04T10:00:00+02:00" },
        url: "https://example.org/a",
        sourceUrl: "https://example.org/a",
        sessions: [
          { start: "2026-10-01T10:00:00+02:00", end: "2026-10-01T11:00:00+02:00" },
          // 00:30 Ortszeit am 11.10. ist UTC noch der 10.10.
          { start: "2026-10-11T00:30:00+02:00", end: "2026-10-11T01:00:00+02:00" },
          { start: "2027-03-01T10:00:00+01:00", end: "2027-03-01T11:00:00+01:00" },
        ],
      },
      {
        id: "bbbbbbbb",
        providerId: treff.id,
        venueId: VENUE,
        title: "Vorbei",
        summary: "x",
        category: "babykurse",
        topics: ["pekip"],
        format: "einmalig",
        registration: "mit-anmeldung",
        cost: "kostenpflichtig",
        availability: { status: "frei", checkedAt: "2026-10-04T10:00:00+02:00" },
        url: "https://example.org/b",
        sourceUrl: "https://example.org/b",
        sessions: [{ start: "2026-10-05T10:00:00+02:00", end: "2026-10-05T11:00:00+02:00" }],
      },
    ] satisfies Offer[];
    expect(toEvalOffers(offers, { from: "2026-10-11", to: "2027-02-04" })).toEqual([
      {
        id: "aaaaaaaa",
        title: "Kurs",
        venueId: VENUE,
        format: "kurs",
        registration: "mit-anmeldung",
        cost: "kostenpflichtig",
        category: "babykurse",
        topics: ["pekip"],
        availability: { status: "frei" },
        starts: ["2026-10-11T00:30:00+02:00"],
      },
    ]);
  });

  it("übernimmt category aus dem Angebot (Plan 0037, E10)", () => {
    const o = {
      id: "cccccccc",
      providerId: treff.id,
      venueId: VENUE,
      title: "Babykonzert",
      summary: "x",
      category: "buehne",
      topics: ["konzert", "musik"],
      format: "einmalig",
      registration: "mit-anmeldung",
      cost: "kostenpflichtig",
      availability: { status: "frei", checkedAt: "2026-10-04T10:00:00+02:00" },
      url: "https://example.org/c",
      sourceUrl: "https://example.org/c",
      sessions: [{ start: "2026-10-12T10:00:00+02:00", end: "2026-10-12T11:00:00+02:00" }],
    } satisfies Offer;
    expect(toEvalOffers([o], { from: "2026-10-11", to: "2027-02-04" })[0]?.category).toBe("buehne");
    // Bestand vor Stufe A ohne category: Rückfall aus den Themen (Übergang Plan 0037, E10; entfällt in Stufe C).
    // Der Typ verlangt category seit Stufe B, der JSON-Umweg (implizites `any` statt `as`) baut den alten Stand nach; entfällt in Stufe C.
    const { category: _, ...ohne } = o;
    const alt: Offer = JSON.parse(JSON.stringify(ohne));
    expect(toEvalOffers([alt], { from: "2026-10-11", to: "2027-02-04" })[0]?.category).toBe("musik");
  });
});

describe("predictOffers", () => {
  it("expandiert mit der Build-Funktion und denselben freien Tagen", () => {
    const r = predictOffers({
      events: [event()],
      provider: treff,
      today: "2026-10-11",
      freeDays: { "2026-11-04": "Herbstferien" },
      window: { from: "2026-10-11", to: "2027-02-04" },
    });
    expect(r.errors).toEqual([]);
    expect(r.offers.map((o) => o.starts)).toEqual([
      [
        "2026-10-14T10:00:00+02:00",
        "2026-10-21T10:00:00+02:00",
        "2026-10-28T10:00:00+01:00",
        "2026-11-11T10:00:00+01:00",
        "2026-11-18T10:00:00+01:00",
      ],
    ]);
  });

  it("baut auch für Anbieter mit coveredBy, ohne den Sammelkalender im Katalog", () => {
    const covered = { ...treff, coveredBy: "ev-kalender" } as Provider;
    const r = predictOffers({
      events: [event()],
      provider: covered,
      today: "2026-10-11",
      freeDays: {},
      window: { from: "2026-10-11", to: "2027-02-04" },
    });
    expect(r.errors).toEqual([]);
    expect(r.offers).toHaveLength(1);
  });
});

describe("gefaltete Kategorie (Plan 0037, Nachtrag A, NA5)", () => {
  it("Soll museum, Ist buecher: beide gefaltet buehne, also ein Treffer", () => {
    const soll = EvalOffer.parse({ ...offer(), category: "museum", topics: ["museum"] });
    const ist = EvalOffer.parse({ ...offer(), category: "buecher", topics: ["vorlesen"] });
    expect(scoreCase([soll], [ist]).fields.category).toEqual({ hits: 1, total: 1 });
  });
});

describe("scoreCase", () => {
  it("volle Übereinstimmung: Recall und Präzision 1, alle Felder getroffen", () => {
    const s = scoreCase([offer()], [offer({ title: "Krabbeltreff am Mittwoch", topics: ["krabbelgruppe"] })]);
    expect(s.sessions).toEqual({ expected: 2, predicted: 2, matched: 2 });
    expect(s.offers).toEqual({ expected: 1, predicted: 1, matched: 1 });
    expect(s.fields.format).toEqual({ hits: 1, total: 1 });
    expect(s.fields.topics).toEqual({ hits: 1, total: 1 });
  });

  it("ordnet Termine 1:1 über Ort und Beginn zu (gleicher Zeitpunkt anders geschrieben zählt gleich)", () => {
    const s = scoreCase(
      [offer({ starts: ["2026-10-14T10:00:00+02:00"] })],
      [offer({ starts: ["2026-10-14T08:00:00Z"] }), offer({ title: "Doppelt", starts: ["2026-10-14T10:00:00+02:00"] })],
    );
    expect(s.sessions).toEqual({ expected: 1, predicted: 2, matched: 1 });
    expect(s.offers).toEqual({ expected: 1, predicted: 2, matched: 1 });
  });

  it("anderer Ort ist kein Treffer", () => {
    const s = scoreCase([offer()], [offer({ venueId: "anderer-ort" })]);
    expect(s.sessions.matched).toBe(0);
    expect(s.offers.matched).toBe(0);
    expect(s.fields.format).toEqual({ hits: 0, total: 0 });
  });

  it("parallele Gruppen am selben Ort und Beginn: der ähnliche Titel entscheidet die Zuordnung", () => {
    const starts = ["2026-10-14T10:00:00+02:00"];
    const expected = [
      offer({ title: "PEKiP Gruppe A (Babys 2–4 Monate)", topics: ["pekip"], format: "kurs", starts }),
      offer({ title: "Babymassage", topics: ["babymassage"], format: "kurs", starts }),
    ];
    const predicted = [
      offer({ title: "Babymassage-Kurs", topics: ["babymassage"], format: "kurs", starts }),
      offer({ title: "PEKiP (2–4 Monate)", topics: ["pekip"], format: "kurs", starts }),
    ];
    const s = scoreCase(expected, predicted);
    expect(s.offers.matched).toBe(2);
    expect(s.fields.topics).toEqual({ hits: 2, total: 2 });
  });

  it("Angebote über die meisten gemeinsamen Termine zuordnen; Feldtreffer je Paar", () => {
    const s = scoreCase(
      [offer({ availability: { status: "frei" }, topics: ["krabbelgruppe", "musik"] })],
      [
        offer({
          format: "kurs",
          availability: { status: "unbekannt" },
          cost: "kostenpflichtig",
          registration: "mit-anmeldung",
          topics: ["musik", "krabbelgruppe"],
        }),
      ],
    );
    expect(s.fields).toEqual({
      format: { hits: 0, total: 1 },
      "availability.status": { hits: 0, total: 1 },
      cost: { hits: 0, total: 1 },
      registration: { hits: 0, total: 1 },
      topics: { hits: 1, total: 1 },
      category: { hits: 1, total: 1 },
    });
  });

  it("Feldtreffer category exakt (Plan 0037, E10)", () => {
    const s = scoreCase(
      [offer({ category: "buehne", topics: ["konzert", "musik"] })],
      [offer({ category: "musik", topics: ["konzert", "musik"] })],
    );
    expect(s.fields.category).toEqual({ hits: 0, total: 1 });
  });

  it("zählt vorhergesagte Angebote, deren category zu keinem Thema passt (Plan 0037, E10)", () => {
    const later = ["2026-10-15T10:00:00+02:00"];
    const s = scoreCase([], [offer({ category: "musik", topics: ["krabbelgruppe"] }), offer({ starts: later })]);
    expect(s.categoryConflicts).toBe(1);
  });

  describe("fehlverortet (Falle fremder-ort, Plan 0049, Nachtrag 2, C)", () => {
    const fuerth = { title: "Musikfüchse Krabbelgruppe", starts: ["2026-10-14T10:00:00+02:00"] };
    it("zählt ein vorhergesagtes Angebot mit ähnlichem Titel und gemeinsamem Beginn, gleich an welchem Ort", () => {
      const p = offer({ title: "Musikfüchse – Krabbelgruppe", venueId: "anderer-ort" });
      expect(scoreCase([], [p], [fuerth]).misplaced).toBe(1);
    });
    it("gleicher Titel mit anderem Beginn ist nicht fehlverortet (derselbe Kurs am eigenen Ort)", () => {
      const p = offer({ title: "Musikfüchse Krabbelgruppe", starts: ["2026-10-15T10:00:00+02:00"] });
      expect(scoreCase([], [p], [fuerth]).misplaced).toBe(0);
    });
    it("gleicher Beginn mit fremdem Titel ist nicht fehlverortet", () => {
      expect(scoreCase([], [offer({ title: "Babyschwimmen" })], [fuerth]).misplaced).toBe(0);
    });
    it("ohne excluded 0; ein Angebot zählt einmal, auch bei mehreren Treffern", () => {
      expect(scoreCase([offer()], [offer()]).misplaced).toBe(0);
      const p = offer({ title: "Musikfüchse Krabbelgruppe" });
      expect(scoreCase([], [p], [fuerth, { ...fuerth, starts: [...fuerth.starts] }]).misplaced).toBe(1);
    });
    it("summiert über die Fälle und meldet es je Fall, wenn größer 0", () => {
      const r: CaseResult[] = [
        {
          name: "musikfuechse-2026-10-31",
          outcome: "ok",
          score: scoreCase([offer()], [offer(), offer({ title: "Musikfüchse Krabbelgruppe" })], [fuerth]),
          calls: [call()],
        },
        { name: "a-2026-10-11", outcome: "ok", score: scoreCase([offer()], [offer()]), calls: [call()] },
      ];
      const s = summarize(r);
      expect(s.misplaced).toBe(1);
      const row = resultsRow(s, r, { date: "d", model: "m", hash: "h" });
      expect(row).toContain("musikfuechse 100/50 fehlverortet 1");
      expect(row).toContain("; a 100/100");
      expect(row).not.toContain("a 100/100 fehlverortet");
    });
  });

  it("keine erwarteten Termine (Falle): jeder vorhergesagte Termin ist falsch positiv", () => {
    const s = scoreCase([], [offer()]);
    expect(s.sessions).toEqual({ expected: 0, predicted: 2, matched: 0 });
    expect(scoreCase([], []).sessions).toEqual({ expected: 0, predicted: 0, matched: 0 });
  });
});

const call = (over: Partial<CaseResult["calls"][number]> = {}): CaseResult["calls"][number] => ({
  step: "extract",
  providerId: treff.id,
  model: "haiku",
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  webSearchRequests: 0,
  turns: 2,
  durationMs: 1000,
  costUsd: 0.01,
  result: "ok",
  ...over,
});

describe("summarize und resultsRow", () => {
  const results: CaseResult[] = [
    { name: "a-2026-10-11", outcome: "ok", score: scoreCase([offer()], [offer()]), calls: [call()] },
    {
      name: "b-2026-10-11",
      outcome: "fehler",
      score: scoreCase([offer({ starts: ["2026-10-14T10:00:00+02:00"] })], []),
      calls: [call({ result: "invalid", costUsd: 0.02 }), call({ result: "invalid", costUsd: null })],
    },
    { name: "falle-2026-10-11", outcome: "ok", score: scoreCase([], [offer()]), calls: [call()] },
  ];

  it("summiert über die Fälle (Mikro-Mittel), Validierung, Kosten und Dauer", () => {
    const s = summarize(results);
    expect(s.sessions).toEqual({ expected: 3, predicted: 4, matched: 2 });
    expect(s.recall).toBeCloseTo(2 / 3);
    expect(s.precision).toBeCloseTo(2 / 4);
    expect(s.offerRecall).toBeCloseTo(1 / 2);
    expect(s.offerPrecision).toBeCloseTo(1 / 2);
    expect(s.casesValid).toBe(2);
    expect(s.cases).toBe(3);
    expect(s.callsValid).toBe(2);
    expect(s.calls).toBe(4);
    expect(s.costUsd).toBeCloseTo(0.04);
    expect(s.durationMs).toBe(4000);
    expect(s.fields.format).toEqual({ hits: 1, total: 1 });
  });

  it("ohne Nenner kein Wert", () => {
    const s = summarize([{ name: "x", outcome: "ok", score: scoreCase([], []), calls: [] }]);
    expect(s.recall).toBeNull();
    expect(s.precision).toBeNull();
  });

  it("eine Zeile für evals/results.md mit Hash, Kennzahlen und kompakt je Fall", () => {
    const row = resultsRow(summarize(results), results, { date: "2026-10-11", model: "haiku", hash: "abc123def456" });
    expect(row.startsWith("| 2026-10-11 | haiku | `abc123def456` |")).toBe(true);
    expect(row.split("|").length).toBe(RESULTS_HEADER.split("\n")[0]?.split("|").length);
    expect(row).toContain("a 100/100");
    expect(row).toContain("b fehler");
    expect(row).toContain("falle FP 2");
    expect(row).not.toContain("\n");
  });

  it("RESULTS_HEADER und resultsRow haben gleich viele Spalten; category und Kat. ohne Thema nach topics", () => {
    const header = RESULTS_HEADER.split("\n");
    const columns = (line: string | undefined) => line?.split("|").map((c) => c.trim());
    expect(columns(header[0])?.slice(14, 17)).toEqual(["topics", "category", "Kat. ohne Thema"]);
    expect(header[1]?.split("|").length).toBe(header[0]?.split("|").length);
    const row = resultsRow(summarize(results), results, { date: "2026-10-11", model: "haiku", hash: "abc123def456" });
    expect(row.split("|").length).toBe(header[0]?.split("|").length);
  });

  it("Kat. ohne Thema: Anteil der vorhergesagten Angebote, ohne vorhergesagte Angebote „–“", () => {
    const later = ["2026-10-15T10:00:00+02:00"];
    const mixed: CaseResult[] = [
      {
        name: "k-2026-10-11",
        outcome: "ok",
        score: scoreCase([], [offer({ category: "musik", topics: ["krabbelgruppe"] }), offer({ starts: later })]),
        calls: [call()],
      },
    ];
    const s = summarize(mixed);
    expect(s.categoryConflicts).toBe(1);
    const cellsOf = (row: string) => row.split("|").map((c) => c.trim());
    expect(cellsOf(resultsRow(s, mixed, { date: "d", model: "m", hash: "h" }))[16]).toBe("50 %");
    const none: CaseResult[] = [{ name: "x", outcome: "ok", score: scoreCase([], []), calls: [call()] }];
    expect(cellsOf(resultsRow(summarize(none), none, { date: "d", model: "m", hash: "h" }))[16]).toBe("–");
  });

  it("findet eine Zeile zum Prompt-Hash", () => {
    const md = `${RESULTS_HEADER}\n${resultsRow(summarize(results), results, { date: "2026-10-11", model: "haiku", hash: "abc123def456" })}\n`;
    expect(hasResultFor(md, "abc123def456")).toBe(true);
    expect(hasResultFor(md, "000000000000")).toBe(false);
  });
});

describe("unusableRun", () => {
  const ok: CaseResult = { name: "a", outcome: "ok", score: scoreCase([], []), calls: [call()] };
  const bad: CaseResult = {
    name: "b",
    outcome: "fehler",
    score: scoreCase([], []),
    calls: [call({ result: "error" })],
  };
  it("braucht alle Fälle und mindestens eine gültige Antwort", () => {
    expect(unusableRun([ok, bad], 2)).toBeUndefined();
    expect(unusableRun([ok], 2)).toBe("nur 1 von 2 Fällen bewertet");
    expect(unusableRun([bad, bad], 2)).toBe("keine einzige gültige Antwort");
  });
});

describe("promptHash", () => {
  it("hängt an Prompt und Schema, 12 Zeichen hex", () => {
    const a = promptHash({ prompt: "p", schema: "s" });
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(promptHash({ prompt: "p", schema: "s2" })).not.toBe(a);
    expect(promptHash({ prompt: "p2", schema: "s" })).not.toBe(a);
  });
});
