import { describe, expect, it } from "vitest";
import {
  appendCsvRow,
  brakeHit,
  COST_CSV_HEADER,
  type CostRow,
  costCsvRow,
  costJsonl,
  JUDGE_BRAKES,
  JUDGE_BUDGET_MIN,
  judgeBrakeHit,
  parseBrakes,
  summarizeCosts,
} from "./cost.ts";
import type { CallRecord } from "./extract.ts";

const call = (over: Partial<CallRecord> = {}): CallRecord => ({
  step: "extract",
  providerId: "a",
  model: "haiku",
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 20,
  cacheCreationTokens: 10,
  webSearchRequests: 0,
  turns: 2,
  durationMs: 1000,
  costUsd: 0.01,
  result: "ok",
  ...over,
});

describe("costJsonl (E8: eine Zeile je Aufruf)", () => {
  it("schreibt je Aufruf eine JSON-Zeile mit Lauf, Datum, Schritt samt Teil, Tokens, Dauer, costUsd und Ergebnis", () => {
    const text = costJsonl([call(), call({ providerId: "b", part: "2/3", result: "invalid", costUsd: null })], {
      run: "nacht",
      date: "2026-10-11",
    });
    const lines = text.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      run: "nacht",
      date: "2026-10-11",
      step: "extract",
      providerId: "a",
      model: "haiku",
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 20,
      cacheCreationTokens: 10,
      webSearchRequests: 0,
      turns: 2,
      durationMs: 1000,
      costUsd: 0.01,
      result: "ok",
    });
    expect(JSON.parse(lines[1] ?? "")).toMatchObject({
      providerId: "b",
      part: "2/3",
      costUsd: null,
      result: "invalid",
    });
    expect(text.endsWith("\n")).toBe(true);
  });

  it("ohne Aufrufe ist die Datei leer", () => {
    expect(costJsonl([], { run: "nacht", date: "2026-10-11" })).toBe("");
  });
});

describe("summarizeCosts (E8: Summen je Schritt und Modell, je Anbieter, Cache)", () => {
  const calls = [
    call({ providerId: "a", costUsd: 0.01 }),
    call({ providerId: "a", step: "fallback", model: "sonnet", costUsd: 0.05, result: "ok" }),
    call({ providerId: "b", part: "1/2", costUsd: 0.02 }),
    call({ providerId: "b", part: "2/2", costUsd: null, result: "invalid" }),
  ];
  const s = summarizeCosts(calls, { cached: 7 });

  it("Summen über alle Aufrufe; Tokens ein = Eingabe + Cache lesen + Cache schreiben", () => {
    expect(s.total).toEqual({ calls: 4, tokensIn: 520, tokensOut: 200, cacheRead: 80, cacheWrite: 40, costUsd: 0.08 });
  });

  it("Summen je Schritt und Modell, sortiert nach Schritt und Modell", () => {
    expect(s.byStepModel.map((r) => [r.step, r.model, r.calls, r.costUsd])).toEqual([
      ["extract", "haiku", 3, 0.03],
      ["fallback", "sonnet", 1, 0.05],
    ]);
  });

  it("je extrahiertem Anbieter: Aufrufe, Schätzung, gescheiterte Versuche; teuerste zuerst; Schnitt", () => {
    expect(s.providers).toEqual([
      { providerId: "a", calls: 2, costUsd: 0.06, failed: 0 },
      { providerId: "b", calls: 2, costUsd: 0.02, failed: 1 },
    ]);
    expect(s.perProviderUsd).toBeCloseTo(0.04);
    expect(s.cachedCalls).toBe(7);
  });

  it("ohne Aufrufe: alles 0, Schnitt 0", () => {
    const empty = summarizeCosts([], { cached: 0 });
    expect(empty.total.calls).toBe(0);
    expect(empty.perProviderUsd).toBe(0);
    expect(empty.providers).toEqual([]);
  });
});

describe("Bremsen (E8: MAX_CALLS, MAX_TOKENS)", () => {
  it("Standard Nacht: 150 Aufrufe, 3 Mio. Tokens", () => {
    expect(parseBrakes({})).toEqual({ ok: true, brakes: { maxCalls: 150, maxTokens: 3_000_000 } });
  });

  it("liest die Umgebung; leere Werte gelten als nicht gesetzt", () => {
    expect(parseBrakes({ MAX_CALLS: "10", MAX_TOKENS: "" })).toEqual({
      ok: true,
      brakes: { maxCalls: 10, maxTokens: 3_000_000 },
    });
  });

  it("ungültige Werte sind ein Fehler, keine stille Grenze", () => {
    expect(parseBrakes({ MAX_CALLS: "abc" }).ok).toBe(false);
    expect(parseBrakes({ MAX_TOKENS: "0" }).ok).toBe(false);
    expect(parseBrakes({ MAX_CALLS: "1.5" }).ok).toBe(false);
  });

  it("greift, sobald die Zahl der Aufrufe oder der Tokens (ein + aus) die Grenze erreicht", () => {
    const brakes = { maxCalls: 3, maxTokens: 1000 };
    expect(brakeHit([call(), call()], brakes)).toBeUndefined();
    expect(brakeHit([call(), call(), call()], brakes)).toBe("aufrufe");
    expect(brakeHit([call({ model: "opus", inputTokens: 920 })], brakes)).toBe("tokens");
  });

  it("zählt Tokens als Opus-Gegenwert: Sonnet 0,6, Haiku 0,2, Unbekanntes wie Opus", () => {
    const brakes = { maxCalls: 100, maxTokens: 1000 };
    // je Aufruf 1000 Tokens (ein 920 + Cache 30, aus 50)
    expect(brakeHit([call({ model: "haiku", inputTokens: 920 })], brakes)).toBeUndefined();
    expect(
      brakeHit(
        Array.from({ length: 5 }, () => call({ model: "haiku", inputTokens: 920 })),
        brakes,
      ),
    ).toBe("tokens");
    expect(brakeHit([call({ model: "claude-haiku-4-5", inputTokens: 920 })], brakes)).toBeUndefined();
    expect(brakeHit([call({ model: "sonnet", inputTokens: 920 })], brakes)).toBeUndefined();
    expect(
      brakeHit([call({ model: "sonnet", inputTokens: 920 }), call({ model: "sonnet", inputTokens: 920 })], brakes),
    ).toBe("tokens");
    expect(brakeHit([call({ model: "unbekannt", inputTokens: 920 })], brakes)).toBe("tokens");
  });
});

describe("Grenzen des Richters (Plan 0049, Nachtrag 2, B3)", () => {
  it("brakeHit zählt Richter-Aufrufe nicht mit", () => {
    const brakes = { maxCalls: 2, maxTokens: 1000 };
    const judge = call({ step: "judge", model: "opus", inputTokens: 5000 });
    expect(brakeHit([call(), judge, judge, judge], brakes)).toBeUndefined();
    expect(brakeHit([call(), call(), judge], brakes)).toBe("aufrufe");
  });

  it("judgeBrakeHit zählt nur Richter-Aufrufe, gewichtet wie brakeHit", () => {
    const brakes = { maxCalls: 2, maxTokens: 1000 };
    const judge = (over: Partial<CallRecord> = {}) => call({ step: "judge", model: "opus", ...over });
    expect(judgeBrakeHit([call(), call(), call(), judge()], brakes)).toBeUndefined();
    expect(judgeBrakeHit([judge(), judge()], brakes)).toBe("aufrufe");
    expect(judgeBrakeHit([judge({ inputTokens: 920 })], brakes)).toBe("tokens");
    expect(judgeBrakeHit([judge({ model: "haiku", inputTokens: 920 })], brakes)).toBeUndefined();
  });

  it("Standard JUDGE_BRAKES, Zeitbudget innerhalb der 40 Minuten Marge des Jobs", () => {
    expect(JUDGE_BRAKES).toEqual({ maxCalls: 60, maxTokens: 6_000_000 });
    expect(judgeBrakeHit(Array.from({ length: 59 }, () => call({ step: "judge", model: "opus" })))).toBeUndefined();
    expect(judgeBrakeHit(Array.from({ length: 60 }, () => call({ step: "judge", model: "opus" })))).toBe("aufrufe");
    expect(JUDGE_BUDGET_MIN).toBeLessThan(40);
  });
});

describe("data/kosten.csv (E8)", () => {
  const row: CostRow = {
    date: "2026-10-11",
    run: "nacht",
    region: "alle",
    calls: 12,
    tokensIn: 34_567,
    tokensOut: 8_901,
    usd: 0.123_456,
    abort: "",
    newProviders: 0,
    changedProviders: 5,
  };

  it("Kopf nach Plan, Zeile in derselben Reihenfolge, USD mit 4 Nachkommastellen", () => {
    expect(COST_CSV_HEADER).toBe(
      "datum,lauf,region,aufrufe,tokens_ein,tokens_aus,usd_schaetzung,abbruch,neue_anbieter,geaenderte_anbieter",
    );
    expect(costCsvRow(row)).toBe("2026-10-11,nacht,alle,12,34567,8901,0.1235,,0,5");
    expect(costCsvRow({ ...row, abort: "tokens" })).toContain(",tokens,");
  });

  it("legt die Datei mit Kopf an und hängt sonst nur die Zeile an", () => {
    expect(appendCsvRow(undefined, row)).toBe(`${COST_CSV_HEADER}\n${costCsvRow(row)}\n`);
    const once = appendCsvRow(undefined, row);
    expect(appendCsvRow(once, { ...row, date: "2026-10-12" })).toBe(
      `${once}${costCsvRow({ ...row, date: "2026-10-12" })}\n`,
    );
  });

  it("ergänzt einen fehlenden Zeilenumbruch am Ende", () => {
    expect(appendCsvRow(`${COST_CSV_HEADER}`, row)).toBe(`${COST_CSV_HEADER}\n${costCsvRow(row)}\n`);
  });
});
