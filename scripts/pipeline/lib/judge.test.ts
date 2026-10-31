import { describe, expect, it } from "vitest";
import type { Anbieter } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import type { ModelReply } from "./extract.ts";
import {
  decide,
  type FreshEvent,
  type JudgeInput,
  JudgeResponse,
  judgeResponseSchema,
  judgeUserMessage,
  type LostOffer,
  mergeVerdicts,
  readVerdicts,
  runJudge,
  splitJudgeInput,
  type Verdict,
} from "./judge.ts";
import type { RawEvent } from "./raw.ts";

const found = loadFixtures().providers.find((p) => p.id === "familientreff-beispiel");
if (found?.role !== "anbieter") throw new Error("Fixture familientreff-beispiel fehlt");
const provider: Anbieter = found;

const PAGE = "https://example.org/familientreff/programm";
const raw = (title: string, format: RawEvent["format"] = "regelmaessig"): RawEvent => ({
  providerId: provider.id,
  venueId: "familientreff-beispiel-haus",
  title,
  summary: "Spielen und Austausch für Familien mit Babys.",
  category: "krabbel-spielgruppen",
  topics: ["krabbelgruppe"],
  format,
  registration: "ohne-anmeldung",
  cost: "kostenlos",
  url: PAGE,
  sourceUrl: PAGE,
  availability: { status: "ohne-anmeldung" },
  schedule: { kind: "weekly", weekdays: ["WE"], start: "10:00", end: "11:30", from: "2026-10-07", skipHolidays: true },
});

const S1 = "2026-11-04T10:00:00+01:00";
const S2 = "2026-11-11T10:00:00+01:00";
const fresh: FreshEvent[] = [
  { index: 0, event: raw("Krabbeltreff am Mittwoch"), starts: [S1, S2], taken: false },
  { index: 1, event: raw("Babykonzert", "einmalig"), starts: [S1, S2], taken: false },
  { index: 2, event: raw("Stillcafé"), starts: [S1], taken: true },
];
const lost: LostOffer[] = [
  { id: "aaaaaaaa", title: "Krabbeltreff", venueId: "familientreff-beispiel-haus", starts: [S1, S2] },
  { id: "bbbbbbbb", title: "Babykonzert", venueId: "familientreff-beispiel-haus", summary: "Musik", starts: [S2] },
];
const input = (over: Partial<JudgeInput> = {}): JudgeInput => ({
  providerId: provider.id,
  unit: `seite:${PAGE}`,
  text: `## Seite 1: ${PAGE} (html)\n## TEXT\nKrabbeltreff mittwochs 10 Uhr`,
  excerpt: provider,
  lost,
  fresh,
  ...over,
});
const verdicts = (...v: unknown[]) => ({ verdicts: v });

describe("Antwortschema", () => {
  it("strikt: vier Arten, Index, Beginn und Grund optional, keine weiteren Felder", () => {
    expect(JudgeResponse.safeParse(verdicts({ id: "a", kind: "gleich", index: 0, start: S1 })).success).toBe(true);
    expect(JudgeResponse.safeParse(verdicts({ id: "a", kind: "unklar" })).success).toBe(true);
    expect(JudgeResponse.safeParse(verdicts({ id: "a", kind: "vielleicht" })).success).toBe(false);
    expect(JudgeResponse.safeParse(verdicts({ id: "a", kind: "unklar", keepIds: {} })).success).toBe(false);
    expect(JudgeResponse.safeParse({ verdicts: [], extra: 1 }).success).toBe(false);
  });

  it("JSON Schema ohne $schema, mit den vier Arten und ohne zusätzliche Felder", () => {
    const schema = judgeResponseSchema() as {
      $schema?: string;
      additionalProperties: boolean;
      properties: { verdicts: { items: { properties: { kind: { enum: string[] } }; additionalProperties: boolean } } };
    };
    expect(schema.$schema).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.verdicts.items.additionalProperties).toBe(false);
    expect(schema.properties.verdicts.items.properties.kind.enum).toEqual([
      "gleich",
      "fehlerhaft",
      "entfallen",
      "unklar",
    ]);
  });
});

describe("judgeUserMessage", () => {
  it("nennt Einheit, Seitenstand, Katalogauszug, verlorene Angebote, Events mit Index und markiert vergebene", () => {
    const m = judgeUserMessage(input({ pageChanged: true }));
    expect(m).toMatch(
      /^Anbieter: familientreff-beispiel\nEinheit: seite:https:\/\/example\.org\/familientreff\/programm\n/,
    );
    expect(m).toContain("Seite seit dem alten Stand: geändert");
    expect(m).toContain('"venues"');
    expect(m).not.toContain('"notes"');
    expect(m).toContain("## Verlorene Angebote (2)");
    expect(m).toContain(
      '{"id":"bbbbbbbb","title":"Babykonzert","venueId":"familientreff-beispiel-haus","summary":"Musik"',
    );
    expect(m).toContain("## Neue Events (3)");
    const lines = m.split("\n").filter((l) => l.startsWith('{"index":'));
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('"vergeben":"schon vergeben, kein zulässiges Ziel"');
    expect(lines[0]).not.toContain("vergeben");
    expect(lines[0]).not.toContain('"providerId"');
    // der Seitentext steht zuletzt
    expect(m.indexOf("## Seitentext")).toBeGreaterThan(m.indexOf("## Neue Events"));
    expect(m.endsWith("Krabbeltreff mittwochs 10 Uhr")).toBe(true);
  });

  it("Seitenstand unverändert bzw. unbekannt; Teilzeile nur bei Teilung", () => {
    expect(judgeUserMessage(input({ pageChanged: false }))).toContain("Seite seit dem alten Stand: unverändert");
    expect(judgeUserMessage(input())).toContain("Seite seit dem alten Stand: unbekannt");
    expect(judgeUserMessage(input())).not.toContain("Teil 1 von");
    expect(judgeUserMessage(input({ part: { index: 2, count: 3 } }))).toContain("Teil 2 von 3: ");
  });
});

describe("readVerdicts", () => {
  it("gleich, fehlerhaft, entfallen, unklar in der Reihenfolge von lost", () => {
    const r = readVerdicts(
      input(),
      verdicts(
        { id: "bbbbbbbb", kind: "entfallen", reason: "nicht mehr auf der Seite" },
        { id: "aaaaaaaa", kind: "gleich", index: 0, start: S1 },
      ),
    );
    expect(r).toEqual([
      { id: "aaaaaaaa", kind: "gleich", index: 0, start: S1 },
      { id: "bbbbbbbb", kind: "entfallen", reason: "nicht mehr auf der Seite" },
    ]);
    const f = readVerdicts(
      input(),
      verdicts(
        { id: "aaaaaaaa", kind: "fehlerhaft", reason: " Ort widerspricht hint " },
        { id: "bbbbbbbb", kind: "unklar" },
      ),
    );
    expect(f).toEqual([
      { id: "aaaaaaaa", kind: "fehlerhaft", reason: "Ort widerspricht hint" },
      { id: "bbbbbbbb", kind: "unklar" },
    ]);
    expect(readVerdicts(input(), verdicts({ id: "aaaaaaaa", kind: "unklar", reason: "zwei Kandidaten" }))[0]).toEqual({
      id: "aaaaaaaa",
      kind: "unklar",
      reason: "zwei Kandidaten",
    });
  });

  it("fehlende, doppelte und unbekannte IDs", () => {
    const r = readVerdicts(
      input(),
      verdicts(
        { id: "aaaaaaaa", kind: "unklar" },
        { id: "aaaaaaaa", kind: "gleich", index: 0, start: S1 },
        { id: "zzzzzzzz", kind: "gleich", index: 0, start: S1 },
      ),
    );
    expect(r).toEqual([
      { id: "aaaaaaaa", kind: "unklar", reason: "2 Urteile" },
      { id: "bbbbbbbb", kind: "unklar", reason: "kein Urteil" },
    ]);
  });

  it("Unsinn des Modells: keine Antwort, falsche Form, ungültiges Urteil", () => {
    for (const bad of [null, "text", 42, {}, { verdicts: "x" }])
      expect(readVerdicts(input(), bad).map((v) => v.kind)).toEqual(["unklar", "unklar"]);
    const r = readVerdicts(
      input(),
      verdicts(
        { id: "aaaaaaaa", kind: "gleich", index: "0", start: S1 },
        7,
        null,
        { id: 5 },
        { id: "bbbbbbbb", kind: "?" },
      ),
    );
    expect(r).toEqual([
      { id: "aaaaaaaa", kind: "unklar", reason: "Urteil ungültig" },
      { id: "bbbbbbbb", kind: "unklar", reason: "Urteil ungültig" },
    ]);
  });

  it("gleich: unbekannter oder vergebener Index, fehlender oder fremder Beginn → unklar", () => {
    const one = (v: object) => readVerdicts(input(), verdicts({ id: "aaaaaaaa", ...v }))[0];
    expect(one({ kind: "gleich", start: S1 })).toEqual({ id: "aaaaaaaa", kind: "unklar", reason: "gleich ohne Index" });
    expect(one({ kind: "gleich", index: 9, start: S1 })?.kind).toBe("unklar");
    expect(one({ kind: "gleich", index: 2, start: S1 })).toEqual({
      id: "aaaaaaaa",
      kind: "unklar",
      reason: "gleich: Event 2 ist schon vergeben",
    });
    expect(one({ kind: "gleich", index: 0 })).toEqual({
      id: "aaaaaaaa",
      kind: "unklar",
      reason: "gleich: Event 0 ohne Beginn",
    });
    expect(one({ kind: "gleich", index: 0, start: "2026-12-24T10:00:00+01:00" })?.kind).toBe("unklar");
  });

  it("gleich: gleicher Zeitpunkt in anderer Schreibweise zählt, weiter geht der Beginn der Eingabe; einziger Beginn darf fehlen", () => {
    const r = readVerdicts(
      input(),
      verdicts({ id: "aaaaaaaa", kind: "gleich", index: 0, start: "2026-11-04T09:00:00Z" }),
    );
    expect(r[0]).toEqual({ id: "aaaaaaaa", kind: "gleich", index: 0, start: S1 });
    const single: FreshEvent[] = [{ index: 7, event: raw("Krabbeltreff"), starts: [S2], taken: false }];
    const s = readVerdicts(input({ fresh: single }), verdicts({ id: "aaaaaaaa", kind: "gleich", index: 7 }));
    expect(s[0]).toEqual({ id: "aaaaaaaa", kind: "gleich", index: 7, start: S2 });
  });

  it("fehlerhaft/entfallen ohne Grund → unklar", () => {
    const r = readVerdicts(
      input(),
      verdicts({ id: "aaaaaaaa", kind: "fehlerhaft" }, { id: "bbbbbbbb", kind: "entfallen", reason: "  " }),
    );
    expect(r).toEqual([
      { id: "aaaaaaaa", kind: "unklar", reason: "fehlerhaft ohne Grund" },
      { id: "bbbbbbbb", kind: "unklar", reason: "entfallen ohne Grund" },
    ]);
  });

  it("zweimal dasselbe Ziel: beim Einzeltermin derselbe Beginn, sonst dasselbe Event → beide unklar", () => {
    const sameStart = readVerdicts(
      input(),
      verdicts(
        { id: "aaaaaaaa", kind: "gleich", index: 1, start: S2 },
        { id: "bbbbbbbb", kind: "gleich", index: 1, start: S2 },
      ),
    );
    expect(sameStart.map((v) => v.kind)).toEqual(["unklar", "unklar"]);
    expect(sameStart[0]).toMatchObject({ reason: "gleich: Event 1 doppelt beansprucht (aaaaaaaa, bbbbbbbb)" });
    // Einzeltermin: zwei Termine, zwei alte IDs – zulässig
    const twoStarts = readVerdicts(
      input(),
      verdicts(
        { id: "aaaaaaaa", kind: "gleich", index: 1, start: S1 },
        { id: "bbbbbbbb", kind: "gleich", index: 1, start: S2 },
      ),
    );
    expect(twoStarts.map((v) => v.kind)).toEqual(["gleich", "gleich"]);
    // regelmäßig: ein Angebot im Build, zwei alte IDs darauf – unklar, auch mit verschiedenen Beginnen
    const regular = readVerdicts(
      input(),
      verdicts(
        { id: "aaaaaaaa", kind: "gleich", index: 0, start: S1 },
        { id: "bbbbbbbb", kind: "gleich", index: 0, start: S2 },
      ),
    );
    expect(regular.map((v) => v.kind)).toEqual(["unklar", "unklar"]);
  });
});

describe("Teilung und mergeVerdicts", () => {
  it("bis zur Schwelle ein Teil ohne part; darüber an Seitengrenzen, jeder Teil mit allen lost und fresh", () => {
    expect(splitJudgeInput(input(), 10_000)).toEqual([input()]);
    const pad = "x".repeat(300);
    const text = [`## Seite 1: ${PAGE} (html)`, "eins", pad, `## Seite 2: ${PAGE}/2 (html)`, "zwei", pad].join("\n");
    const parts = splitJudgeInput(input({ text, layout: { pageUrls: [PAGE, `${PAGE}/2`], candidates: 0 } }), 500);
    expect(parts.map((p) => p.part)).toEqual([
      { index: 1, count: 2 },
      { index: 2, count: 2 },
    ]);
    expect(parts[0]?.text).toContain("eins");
    expect(parts[1]?.text).toMatch(/^## Seite 2: /);
    for (const p of parts) {
      expect(p.lost).toEqual(input().lost);
      expect(p.fresh).toEqual(fresh);
    }
  });

  const g = (id: string, index: number, start = S1): Verdict => ({ id, kind: "gleich", index, start });
  const f = (id: string, reason = "nicht da"): Verdict => ({ id, kind: "fehlerhaft", reason });
  const e = (id: string, reason = "gestrichen"): Verdict => ({ id, kind: "entfallen", reason });
  const u = (id: string, reason?: string): Verdict => ({ id, kind: "unklar", ...(reason ? { reason } : {}) });

  it("ein Teil: unverändert; gleich aus irgendeinem Teil gewinnt", () => {
    expect(mergeVerdicts([[g("a", 0), f("b")]], fresh)).toEqual([g("a", 0), f("b")]);
    expect(mergeVerdicts([[f("a")], [g("a", 0)], [u("a")]], fresh)).toEqual([g("a", 0)]);
    // regelmäßiges Event: anderer Beginn ist dasselbe Ziel, der erste gewinnt
    expect(mergeVerdicts([[g("a", 0, S1)], [g("a", 0, S2)]], fresh)).toEqual([g("a", 0, S1)]);
  });

  it("verschiedene Ziele in zwei Teilen → unklar", () => {
    expect(mergeVerdicts([[g("a", 0)], [g("a", 1)]], fresh)[0]?.kind).toBe("unklar");
    expect(mergeVerdicts([[g("a", 1, S1)], [g("a", 1, S2)]], fresh)[0]?.kind).toBe("unklar");
  });

  it("fehlerhaft/entfallen nur, wenn alle Teile es sagen; gemischt gilt fehlerhaft", () => {
    expect(mergeVerdicts([[f("a", "x")], [f("a", "y")]], fresh)).toEqual([f("a", "x; y")]);
    expect(mergeVerdicts([[e("a")], [e("a")]], fresh)).toEqual([e("a")]);
    expect(mergeVerdicts([[e("a", "x")], [f("a", "y")]], fresh)).toEqual([f("a", "x; y")]);
    expect(mergeVerdicts([[f("a")], [u("a", "steht hier, kein Event passt")]], fresh)).toEqual([
      u("a", "steht hier, kein Event passt"),
    ]);
    expect(mergeVerdicts([[f("a")], [u("a")]], fresh)).toEqual([u("a", "Teile uneins")]);
  });

  it("Ziele bleiben über die Teile eindeutig", () => {
    const r = mergeVerdicts(
      [
        [g("a", 0), f("b")],
        [f("a"), g("b", 0, S2)],
      ],
      fresh,
    );
    expect(r.map((v) => v.kind)).toEqual(["unklar", "unklar"]);
  });
});

describe("decide", () => {
  it("Übernahme genau ohne unklar; keepIds aus gleich, dropped aus fehlerhaft/entfallen", () => {
    const v: Verdict[] = [
      { id: "a", kind: "gleich", index: 1, start: S2 },
      { id: "b", kind: "fehlerhaft", reason: "x" },
      { id: "c", kind: "entfallen", reason: "y" },
    ];
    expect(decide(v)).toEqual({
      adopt: true,
      keepIds: [{ index: 1, start: S2, id: "a" }],
      dropped: [v[1], v[2]],
    });
    expect(decide([...v, { id: "d", kind: "unklar" }]).adopt).toBe(false);
    expect(decide([])).toEqual({ adopt: true, keepIds: [], dropped: [] });
  });
});

describe("runJudge", () => {
  const reply = (over: Partial<ModelReply> = {}): ModelReply => ({
    output: null,
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0 },
    costUsd: 0.01,
    turns: 1,
    durationMs: 100,
    abort: null,
    truncated: false,
    error: null,
    ...over,
  });
  const ok = verdicts({ id: "aaaaaaaa", kind: "gleich", index: 0, start: S1 }, { id: "bbbbbbbb", kind: "unklar" });
  const run = (replies: ModelReply[], over: Partial<JudgeInput> = {}, maxChars = 10_000, signal?: AbortSignal) => {
    const seen: string[] = [];
    const queue = [...replies];
    const result = runJudge({
      input: input(over),
      model: "opus",
      maxChars,
      call: async (user) => {
        seen.push(user);
        const next = queue.shift();
        if (!next) throw new Error("zu viele Aufrufe");
        return next;
      },
      ...(signal ? { signal } : {}),
    });
    return { result, seen };
  };

  it("ohne Verluste kein Aufruf", async () => {
    const { result, seen } = run([], { lost: [] });
    expect(await result).toEqual({ outcome: { kind: "ok", verdicts: [] }, calls: [] });
    expect(seen).toEqual([]);
  });

  it("ein Aufruf, Urteile, CallRecord mit step judge und Einheit", async () => {
    const { result } = run([reply({ output: ok })]);
    const r = await result;
    expect(r.outcome).toEqual({
      kind: "ok",
      verdicts: [
        { id: "aaaaaaaa", kind: "gleich", index: 0, start: S1 },
        { id: "bbbbbbbb", kind: "unklar" },
      ],
    });
    expect(r.calls).toEqual([
      expect.objectContaining({
        step: "judge",
        providerId: provider.id,
        unit: `seite:${PAGE}`,
        model: "opus",
        result: "ok",
      }),
    ]);
    expect(r.calls[0]).not.toHaveProperty("part");
  });

  it("technischer Fehler oder falsche Form: eine Wiederholung, dann fehler", async () => {
    const again = await run([reply({ error: "weg" }), reply({ output: ok })]).result;
    expect(again.outcome.kind).toBe("ok");
    expect(again.calls.map((c) => c.result)).toEqual(["error", "ok"]);
    const bad = await run([reply({ output: { x: 1 } }), reply({ error: "weg" })]).result;
    expect(bad.outcome).toEqual({ kind: "fehler", reason: "Richter (opus): weg" });
    expect(bad.calls.map((c) => c.result)).toEqual(["invalid", "error"]);
  });

  it("abgeschnitten sofort fehler, Abbruch sofort abort", async () => {
    const cut = await run([reply({ truncated: true })]).result;
    expect(cut.outcome).toEqual({ kind: "fehler", reason: "Ausgabe abgeschnitten (opus)" });
    const limit = await run([reply({ abort: "limit" })]).result;
    expect(limit.outcome).toEqual({ kind: "abort", abort: "limit" });
    expect(limit.calls.map((c) => c.result)).toEqual(["abort"]);
  });

  it("geteilt: ein Aufruf je Teil mit Teilzeile, Urteile zusammengeführt, part im CallRecord", async () => {
    const pad = "x".repeat(300);
    const text = [`## Seite 1: ${PAGE} (html)`, "eins", pad, `## Seite 2: ${PAGE}/2 (html)`, "zwei", pad].join("\n");
    const layout = { pageUrls: [PAGE, `${PAGE}/2`], candidates: 0 };
    const p1 = verdicts(
      { id: "aaaaaaaa", kind: "fehlerhaft", reason: "nicht hier" },
      { id: "bbbbbbbb", kind: "entfallen", reason: "weg" },
    );
    const p2 = verdicts(
      { id: "aaaaaaaa", kind: "gleich", index: 0, start: S2 },
      { id: "bbbbbbbb", kind: "entfallen", reason: "weg" },
    );
    const { result, seen } = run([reply({ output: p1 }), reply({ output: p2 })], { text, layout }, 500);
    const r = await result;
    expect(r.outcome).toEqual({
      kind: "ok",
      verdicts: [
        { id: "aaaaaaaa", kind: "gleich", index: 0, start: S2 },
        { id: "bbbbbbbb", kind: "entfallen", reason: "weg" },
      ],
    });
    expect(r.calls.map((c) => c.part)).toEqual(["1/2", "2/2"]);
    expect(seen[0]).toContain("Teil 1 von 2: ");
    expect(seen[1]).toContain("Teil 2 von 2: ");
  });

  it("abgebrochener Lauf endet vor dem nächsten Teil", async () => {
    const ac = new AbortController();
    ac.abort();
    const r = await run([], {}, 10_000, ac.signal).result;
    expect(r.outcome).toEqual({ kind: "fehler", reason: "Lauf abgebrochen" });
  });
});
