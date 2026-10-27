import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import { berlinIsoDate } from "../../../src/domain/time.ts";
import { CASE_KINDS, TRAPS } from "../lib/eval-score.ts";
import type { CallRecord, Extractor } from "../lib/extract.ts";
import { loadCases, runEval, writeEval } from "./eval.ts";

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

const { providers } = loadFixtures();
const treff = providers.find((p) => p.id === "familientreff-beispiel");
const VENUE = "familientreff-beispiel-haus";
const PAGE = "https://example.org/familientreff/programm";
const window = { from: "2026-10-11", to: "2027-02-04" };

function caseDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "eval-"));
  tmpDirs.push(dir);
  const write = (name: string, starts: string[]) => {
    mkdirSync(join(dir, name));
    const input = {
      kinds: ["html"],
      traps: [],
      synthetic: true,
      origin: "Test",
      providerId: "familientreff-beispiel",
      catalog: treff,
      today: "2026-10-11",
      text: `## Seite 1: ${PAGE} (html)\n## TEXT\nKrabbeltreff mittwochs 10 Uhr`,
      candidates: [],
      allowedUrls: [PAGE],
      pageUrls: [PAGE],
    };
    const offers = starts.length
      ? [
          {
            title: "Krabbeltreff",
            venueId: VENUE,
            format: "regelmaessig",
            registration: "ohne-anmeldung",
            cost: "kostenlos",
            category: "krabbel-spielgruppen",
            topics: ["krabbelgruppe"],
            availability: { status: "ohne-anmeldung" },
            starts,
          },
        ]
      : [];
    writeFileSync(join(dir, name, "input.json"), JSON.stringify(input));
    writeFileSync(join(dir, name, "expected.json"), JSON.stringify({ basis: "Test", window, offers }));
  };
  write("a-2026-10-11", ["2026-10-14T10:00:00+02:00", "2026-10-21T10:00:00+02:00"]);
  write("b-2026-10-11", []);
  return dir;
}

const call = (result: CallRecord["result"]): CallRecord => ({
  step: "extract",
  providerId: "familientreff-beispiel",
  model: "fake",
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  webSearchRequests: 0,
  turns: 2,
  durationMs: 500,
  costUsd: 0.001,
  result,
});

const krabbeltreff = {
  providerId: "familientreff-beispiel",
  venueId: VENUE,
  title: "Krabbeltreff",
  summary: "Offener Treff.",
  category: "krabbel-spielgruppen" as const,
  topics: ["krabbelgruppe" as const],
  format: "regelmaessig" as const,
  registration: "ohne-anmeldung" as const,
  cost: "kostenlos" as const,
  url: PAGE,
  sourceUrl: PAGE,
  availability: { status: "ohne-anmeldung" as const },
  schedule: {
    kind: "weekly" as const,
    weekdays: ["WE" as const],
    start: "10:00",
    from: "2026-10-14",
    count: 2,
    skipHolidays: true,
  },
};

describe("Eval-Lauf", () => {
  it("lädt Fälle, bewertet die Antworten und hängt eine Zeile an results.md", async () => {
    const dir = caseDir();
    const cases = loadCases(undefined, dir);
    expect(cases.map((c) => c.name)).toEqual(["a-2026-10-11", "b-2026-10-11"]);
    const seen: string[] = [];
    // a: richtig; b (keine Termine erwartet): ungültig nach Wiederholung
    const extractor: Extractor = async (input) => {
      seen.push(input.provider.id);
      return input.text && seen.length === 1
        ? { outcome: { kind: "ok", events: [krabbeltreff], model: "fake" }, calls: [call("ok")] }
        : { outcome: { kind: "fehler", reason: "ungültig" }, calls: [call("invalid"), call("invalid")] };
    };
    const run = await runEval({
      cases,
      extractor,
      signal: new AbortController().signal,
      concurrency: 1,
      freeDaysFor: async () => ({}),
    });
    expect(run.abort).toBeUndefined();
    expect(run.results.map((r) => [r.name, r.outcome, r.score.sessions])).toEqual([
      ["a-2026-10-11", "ok", { expected: 2, predicted: 2, matched: 2 }],
      ["b-2026-10-11", "fehler", { expected: 0, predicted: 0, matched: 0 }],
    ]);

    const results = join(dir, "results.md");
    const row = writeEval(
      run,
      { date: "2026-10-11", model: "fake", fallback: "fake", hash: "0123456789ab", outDir: join(dir, "out") },
      results,
    );
    const md = readFileSync(results, "utf8");
    expect(md.startsWith("# Eval-Ergebnisse\n\n| Datum |")).toBe(true);
    expect(md.trimEnd().endsWith(row)).toBe(true);
    expect(row).toContain("a 100/100; b fehler");
    expect(JSON.parse(readFileSync(join(dir, "out", "summary.json"), "utf8")).summary.casesValid).toBe(1);
  });

  it("bricht bei Auth- oder Limitfehler ab, ohne weitere Fälle", async () => {
    const dir = caseDir();
    let n = 0;
    const run = await runEval({
      cases: loadCases(undefined, dir),
      extractor: async () => {
        n++;
        return { outcome: { kind: "abort", abort: "limit" }, calls: [call("abort")] };
      },
      signal: new AbortController().signal,
      concurrency: 1,
      freeDaysFor: async () => ({}),
    });
    expect(run.abort).toBe("limit");
    expect(n).toBe(1);
  });

  it("nennt unbekannte Fälle", () => {
    expect(() => loadCases(["fehlt"], caseDir())).toThrow(/unbekannte Fälle: fehlt/);
  });
});

/**
 * Die eingefrorenen Fälle selbst (Plan 0032, E9): Biome nimmt evals/cases aus, also prüft dieser Test Schema und
 * Invarianten, bevor ein bezahlter Eval-Lauf daran scheitert.
 */
describe("evals/cases", () => {
  const cases = loadCases();
  it("mindestens 12 Fälle, alle Arten und alle drei Fallen", () => {
    expect(cases.length).toBeGreaterThanOrEqual(12);
    const kinds = new Set(cases.flatMap((c) => c.input.kinds));
    for (const k of CASE_KINDS) expect(kinds, k).toContain(k);
    const traps = new Set(cases.flatMap((c) => c.input.traps));
    for (const t of TRAPS) expect(traps, t).toContain(t);
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s: Katalog, Orte und Fenster passen", (name, c) => {
    expect(name.startsWith(`${c.input.providerId}-`)).toBe(true);
    expect(c.input.catalog.id).toBe(c.input.providerId);
    expect(c.expected.window.from).toBe(c.input.today);
    const venues = c.input.catalog.role === "anbieter" ? c.input.catalog.venues.map((v) => v.id) : [];
    for (const o of c.expected.offers) {
      expect(venues, o.title).toContain(o.venueId);
      for (const s of o.starts) {
        const day = berlinIsoDate(s);
        expect(day >= c.expected.window.from && day <= c.expected.window.to, `${o.title} ${s}`).toBe(true);
      }
    }
  });
});

describe("Eval je Einheit (Plan 0048, E6)", () => {
  it("Fall mit zwei Seiten und Beilage: je Einheit extrahiert, abgeglichen, vereinigt und gewertet", async () => {
    if (treff?.role !== "anbieter") throw new Error("Fixture fehlt");
    const B = "https://example.org/familientreff/kurse";
    const PLAETZE = "https://example.org/familientreff/plaetze";
    const catalog = {
      ...treff,
      programme: [
        { url: PAGE, kind: "html" as const, use: "termine" as const },
        { url: B, kind: "html" as const, use: "termine" as const },
        { url: PLAETZE, kind: "html" as const, use: "verfuegbarkeit" as const },
      ],
    };
    const dir = mkdtempSync(join(tmpdir(), "eval-units-"));
    tmpDirs.push(dir);
    mkdirSync(join(dir, "x-2026-10-11"));
    const text = [
      `## Seite 1: ${PAGE} (html)\n## TEXT\nKrabbeltreff mittwochs`,
      `## Seite 2: ${B} (html)\n## TEXT\nKrabbeltreff als Kurs`,
      `## Seite 3: ${PLAETZE} (html)\n## TEXT\nnoch 2 Plätze`,
    ].join("\n\n");
    const input = {
      kinds: ["html"],
      traps: [],
      synthetic: true,
      origin: "Test",
      providerId: "familientreff-beispiel",
      catalog,
      today: "2026-10-11",
      text,
      candidates: [],
      allowedUrls: [PAGE, B, PLAETZE],
      pageUrls: [PAGE, B, PLAETZE],
    };
    const expected = {
      basis: "Test",
      window,
      offers: [
        {
          title: "Krabbeltreff",
          venueId: VENUE,
          format: "regelmaessig",
          registration: "ohne-anmeldung",
          cost: "kostenlos",
          category: "krabbel-spielgruppen",
          topics: ["krabbelgruppe"],
          availability: { status: "ohne-anmeldung" },
          starts: ["2026-10-14T10:00:00+02:00", "2026-10-21T10:00:00+02:00"],
        },
      ],
    };
    writeFileSync(join(dir, "x-2026-10-11", "input.json"), JSON.stringify(input));
    writeFileSync(join(dir, "x-2026-10-11", "expected.json"), JSON.stringify(expected));
    const seen: Array<{ unit: string | undefined; text: string; hints: number }> = [];
    const extractor: Extractor = async (i) => {
      seen.push({ unit: i.unit, text: i.text, hints: i.excerpt?.programme.length ?? 0 });
      // Seite B fasst denselben Treff als Kurs: Zwilling mit anderem Format
      const event = i.unit === `seite:${B}` ? { ...krabbeltreff, format: "kurs" as const, sourceUrl: B } : krabbeltreff;
      return { outcome: { kind: "ok", events: [event], model: "fake" }, calls: [call("ok")] };
    };
    const run = await runEval({
      cases: loadCases(undefined, dir),
      extractor,
      signal: new AbortController().signal,
      concurrency: 1,
      freeDaysFor: async () => ({}),
    });
    expect(seen.map((s) => s.unit)).toEqual([`seite:${PAGE}`, `seite:${B}`]);
    expect(seen[0]?.text).toBe(
      `## Seite 1: ${PAGE} (html)\n## TEXT\nKrabbeltreff mittwochs\n\n## Seite 2: ${PLAETZE} (html)\n## TEXT\nnoch 2 Plätze`,
    );
    expect(seen[1]?.text.startsWith(`## Seite 1: ${B} (html)`)).toBe(true);
    expect(seen[0]?.hints).toBe(3);
    expect(run.results[0]?.calls.map((c) => c.unit)).toEqual([`seite:${PAGE}`, `seite:${B}`]);
    expect(run.results[0]?.predicted).toHaveLength(1);
    expect(run.results[0]?.score.sessions).toEqual({ expected: 2, predicted: 2, matched: 2 });
  });
});
