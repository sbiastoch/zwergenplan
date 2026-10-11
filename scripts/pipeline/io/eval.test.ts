import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import type { CallRecord, Extractor } from "../lib/extract.ts";
import { loadCases, runEval, writeEval } from "./eval.ts";

const { providers } = loadFixtures();
const treff = providers.find((p) => p.id === "familientreff-beispiel");
const VENUE = "familientreff-beispiel-haus";
const PAGE = "https://example.org/familientreff/programm";
const window = { from: "2026-10-11", to: "2027-02-04" };

function caseDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "eval-"));
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
    };
    const offers = starts.length
      ? [
          {
            title: "Krabbeltreff",
            venueId: VENUE,
            format: "regelmaessig",
            registration: "ohne-anmeldung",
            cost: "kostenlos",
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
