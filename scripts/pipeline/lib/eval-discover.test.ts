import { describe, expect, it } from "vitest";
import {
  allocate,
  DiscoverEvalSchema,
  drawStratified,
  type EvalOutcome,
  evalRegions,
  forUnderThree,
  freshRunDir,
  kennzahlen,
  matchTermine,
  modelEnv,
  quellenZahlen,
  resultsRow,
  type Stufe,
  seededRandom,
  termineOf,
  UrteileSchema,
  yieldWindow,
} from "./eval-discover.ts";

describe("seededRandom", () => {
  it("liefert bei gleichem Seed dieselbe Folge in [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
    expect(seededRandom(43)()).not.toBe(xs[0]);
  });
});

describe("allocate", () => {
  it("verteilt proportional zur Schichtgröße, Rest nach größtem Bruchteil", () => {
    expect(allocate({ gemeinde: 20, verein: 10, einzelperson: 10 }, 4)).toEqual({
      gemeinde: 2,
      verein: 1,
      einzelperson: 1,
    });
  });

  it("gibt nie mehr als die Schicht hat und lässt leere Schichten leer", () => {
    const a = allocate({ gemeinde: 1, verein: 0, sonstige: 9 }, 10);
    expect(a).toEqual({ gemeinde: 1, verein: 0, sonstige: 9 });
  });

  it("summiert genau auf n, wenn genug da ist", () => {
    const a = allocate({ a: 7, b: 5, c: 3, d: 1 }, 10);
    expect(Object.values(a).reduce((s, x) => s + x, 0)).toBe(10);
  });
});

describe("drawStratified", () => {
  const pool = [
    ...["g1", "g2", "g3", "g4", "g5", "g6"].map((id) => ({ id, art: "gemeinde" as const })),
    ...["v1", "v2", "v3"].map((id) => ({ id, art: "verein" as const })),
    { id: "e1", art: "einzelperson" as const },
  ];

  it("ist mit gleichem Seed reproduzierbar und je Schicht proportional", () => {
    const a = drawStratified(pool, 5, 7);
    expect(drawStratified(pool, 5, 7)).toEqual(a);
    expect(a).toHaveLength(5);
    expect(new Set(a).size).toBe(5);
    expect(a.filter((id) => id.startsWith("g"))).toHaveLength(3);
  });

  it("hängt nicht von der Reihenfolge des Pools ab", () => {
    expect(drawStratified([...pool].reverse(), 5, 7)).toEqual(drawStratified(pool, 5, 7));
  });
});

describe("DiscoverEvalSchema", () => {
  it("nimmt Stichprobe mit alt und notiz, lehnt unbekannte Art ab", () => {
    const ok = {
      seed: 1,
      stichproben: {
        nuernberg: [
          { id: "a", alt: true },
          { id: "b", notiz: "gezogen" },
        ],
      },
      arten: { a: "verein", b: "gemeinde" },
    };
    expect(DiscoverEvalSchema.parse(ok).stichproben["nuernberg"]).toHaveLength(2);
    expect(() => DiscoverEvalSchema.parse({ ...ok, arten: { a: "zirkus" } })).toThrow();
  });
});

describe("Auswertung des Entdecken-Evals (Plan 0050, E6)", () => {
  const at = (start: string, lat = 49.45, lon = 11.07) => ({ start, lat, lon });
  const window = { from: "2026-10-29T08:00:00+01:00", to: "2026-12-24T08:00:00+01:00" };

  it("matchTermine: 1:1 über Beginn und Ort ≤ 100 m, nur Referenztermine im Fenster", () => {
    const ref = [
      at("2026-11-02T10:00:00+01:00"),
      at("2026-11-09T10:00:00+01:00"),
      at("2026-11-16T10:00:00+01:00"),
      // außerhalb des Fensters: zählt nicht
      at("2027-01-11T10:00:00+01:00"),
    ];
    const found = [
      // gleicher Beginn in anderer Schreibweise, 50 m daneben
      at("2026-11-02T09:00:00Z", 49.4504, 11.07),
      // zweimal derselbe Termin: nur einer trifft (1:1)
      at("2026-11-09T10:00:00+01:00"),
      at("2026-11-09T10:00:00+01:00"),
      // 500 m entfernt: anderer Ort
      at("2026-11-16T10:00:00+01:00", 49.455, 11.07),
    ];
    expect(matchTermine(found, ref, window)).toEqual({ treffer: 2, referenz: 3 });
    expect(matchTermine([], [], window)).toEqual({ treffer: 0, referenz: 0 });
  });

  it("termineOf: Termine eines Anbieters mit Lage des Orts, nur 0–3 Jahre", () => {
    const entry = {
      venues: [
        { id: "saal", geo: { lat: 49.45, lon: 11.07 } },
        { id: "halle", geo: { lat: 49.46, lon: 11.08 } },
      ],
    };
    const offer = (venueId: string, starts: string[], minMonths?: number) => ({
      providerId: "p",
      venueId,
      sessions: starts.map((start) => ({ start })),
      ...(minMonths === undefined ? {} : { age: { minMonths } }),
    });
    expect(
      termineOf(
        [
          offer("saal", ["2026-11-02T10:00:00+01:00"]),
          offer("halle", ["2026-11-03T10:00:00+01:00"], 12),
          offer("halle", ["2026-11-04T10:00:00+01:00"], 48),
          { ...offer("saal", ["2026-11-05T10:00:00+01:00"]), providerId: "anderer" },
        ],
        "p",
        entry,
      ),
    ).toEqual([at("2026-11-02T10:00:00+01:00"), at("2026-11-03T10:00:00+01:00", 49.46, 11.08)]);
  });

  it("kennzahlen: Stufen kumulativ, alt und neu getrennt, Ertrag gemittelt ohne Referenz 0 und ohne Ziel 4", () => {
    const o = (id: string, stufe: Stufe | undefined, extra: Partial<EvalOutcome> = {}): EvalOutcome => ({
      id,
      name: id,
      ergebnis: stufe === "beweis" ? "aufgenommen" : stufe ? "verworfen" : "nicht gefunden",
      ...(stufe ? { stufe } : {}),
      quellen: [],
      ...extra,
    });
    const k = kennzahlen([
      o("a", "beweis", { alt: true, ertrag: { treffer: 3, referenz: 4 } }),
      o("b", "beweis", { ertrag: { treffer: 1, referenz: 2 } }),
      o("c", "beweis", { ertrag: { treffer: 0, referenz: 0 } }),
      o("d", "beweis", { ziel4: false }),
      o("e", "orte", { alt: true }),
      o("f", "abgerufen"),
      o("g", "gefunden", { alt: true }),
      o("h", undefined),
    ]);
    expect(k.alle).toEqual({
      n: 8,
      gefunden: 7,
      vorfilter: 6,
      abgerufen: 6,
      aufnehmen: 5,
      orte: 5,
      wiedergefunden: 4,
      ertrag: 0.625,
      ertragN: 2,
    });
    expect(k.alt).toMatchObject({ n: 3, gefunden: 3, vorfilter: 2, wiedergefunden: 1, ertrag: 0.75 });
    expect(k.neu).toMatchObject({ n: 5, gefunden: 4, wiedergefunden: 3 });
    expect(kennzahlen([]).alle.ertrag).toBeUndefined();
  });

  it("quellenZahlen: je Art der Quelle, wie viele Anbieter sie lieferte", () => {
    const base = { name: "x", ergebnis: "verworfen" as const };
    expect(
      quellenZahlen([
        { ...base, id: "a", quellen: ["suche", "verzeichnis"] },
        { ...base, id: "b", quellen: ["suche"] },
        { ...base, id: "c", quellen: [] },
      ]),
    ).toEqual({ suche: 2, verzeichnis: 1 });
  });

  it("modelEnv: Eval setzt Opus high für alle fünf Variablen, Option vor Umgebung vor Eval-Standard", () => {
    expect(modelEnv({}, { eval: true })).toEqual({
      LLM_MODEL_DISCOVER: "opus",
      LLM_EFFORT_DISCOVER: "high",
      LLM_MODEL_EXTRACT: "opus",
      LLM_MODEL_FALLBACK: "opus",
      LLM_EFFORT_EXTRACT: "high",
    });
    expect(
      modelEnv({ LLM_MODEL_DISCOVER: "sonnet", LLM_EFFORT_EXTRACT: "medium" }, { eval: true, effort: "xhigh" }),
    ).toEqual({
      LLM_MODEL_DISCOVER: "sonnet",
      LLM_EFFORT_DISCOVER: "xhigh",
      LLM_MODEL_EXTRACT: "opus",
      LLM_MODEL_FALLBACK: "opus",
      LLM_EFFORT_EXTRACT: "medium",
    });
    // ohne Eval nur die Optionen
    expect(modelEnv({}, { eval: false, model: "sonnet" })).toEqual({ LLM_MODEL_DISCOVER: "sonnet" });
  });

  it("evalRegions: Reihenfolge von REGION_IDS, Fürth vor Nürnberg (ADR 0029)", () => {
    expect(evalRegions("nuernberg")).toEqual(["fuerth", "nuernberg"]);
    expect(evalRegions("gibts-nicht")).toEqual([]);
  });

  it("yieldWindow: Berliner Kalendertage, über die Zeitumstellung genau 8 Wochen", () => {
    expect(yieldWindow("2026-10-11")).toEqual({
      from: "2026-10-11T00:00:00+02:00",
      to: "2026-12-06T00:00:00+01:00",
    });
  });

  it("forUnderThree: ohne Alter oder ab höchstens 36 Monaten", () => {
    expect(forUnderThree({})).toBe(true);
    expect(forUnderThree({ age: { minMonths: 36 } })).toBe(true);
    expect(forUnderThree({ age: { minMonths: 37 } })).toBe(false);
  });

  it("freshRunDir: eigenes Laufverzeichnis, bei Bedarf -2, -3", () => {
    const taken = new Set(["runs/d/discover", "runs/d/discover-2"]);
    expect(freshRunDir("runs/d/discover", (p) => taken.has(p))).toBe("runs/d/discover-3");
    expect(freshRunDir("runs/e/discover", () => false)).toBe("runs/e/discover");
  });

  it("UrteileSchema: je URL passend, falsch oder Dublette mit Datum", () => {
    expect(
      UrteileSchema.parse({ urteile: { "https://a.example/": { urteil: "passend", datum: "2026-10-29" } } }),
    ).toBeTruthy();
    expect(() =>
      UrteileSchema.parse({ urteile: { "https://a.example/": { urteil: "vielleicht", datum: "2026-10-29" } } }),
    ).toThrow();
  });

  it("resultsRow: eine Zeile für evals/results.md mit Stufen als „alle (alt/neu)“", () => {
    const k = kennzahlen([
      {
        id: "a",
        name: "a",
        alt: true,
        ergebnis: "aufgenommen",
        stufe: "beweis",
        quellen: ["suche"],
        ertrag: { treffer: 1, referenz: 1 },
      },
      { id: "b", name: "b", ergebnis: "nicht gefunden", quellen: [] },
    ]);
    const row = resultsRow({
      date: "2026-10-29",
      modelle: "opus/high",
      gueltig: true,
      kennzahlen: k,
      quellen: { suche: 1 },
      klaerfaelle: 2,
      dubletten: 1,
      falsch: 0,
      unbeurteilt: 1,
      neu: ["krabbelzwerge"],
      aufrufe: 12,
      kostenUsd: 1.234,
      dauerMin: 42,
      jeAnbieter: "a aufgenommen; b nicht gefunden",
    });
    expect(row).toBe(
      "| 2026-10-29 | opus/high | ja | 2 (1/1) | 1 (1/0) | 1 | 1 (1/0) | 1 (1/0) | 1 (1/0) | 1 (1/0) | 1 (1/0) | " +
        "100 % (1) | suche 1 | 2 | 1 | 0 (1 unbeurteilt) | 1 (krabbelzwerge) | 12 | $1.23 | 42 Min. | " +
        "a aufgenommen; b nicht gefunden |",
    );
  });
});
