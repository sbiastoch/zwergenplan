import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Provider } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import type { CallRecord, ExtractInput, ExtractOutcome, Extractor } from "../lib/extract.ts";
import { RawEvent } from "../lib/raw.ts";
import type { FetchedProvider } from "../lib/refresh.ts";
import { readRaw, writeRaw } from "./files.ts";
import { refreshProvider } from "./refresh.ts";

const scratch = mkdtempSync(join(tmpdir(), "zp-refresh-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const provider: Provider = (() => {
  const p = loadFixtures().providers.find((x) => x.id === "familientreff-beispiel");
  if (!p) throw new Error("Fixture familientreff-beispiel fehlt");
  return p;
})();
const PAGE = "https://example.org/familientreff/programm";
const ev = (title: string): RawEvent =>
  RawEvent.parse({
    providerId: provider.id,
    venueId: "familientreff-beispiel-haus",
    title,
    summary: "Spielen und Austausch für Familien mit Babys.",
    topics: ["krabbelgruppe"],
    format: "regelmaessig",
    registration: "ohne-anmeldung",
    cost: "kostenlos",
    url: PAGE,
    sourceUrl: PAGE,
    availability: { status: "ohne-anmeldung" },
    schedule: {
      kind: "weekly",
      weekdays: ["WE"],
      start: "10:00",
      end: "11:30",
      from: "2026-10-07",
      skipHolidays: true,
    },
  });
const events = (n: number) => Array.from({ length: n }, (_, i) => ev(`Treff ${i + 1}`));
const fetched: FetchedProvider = {
  status: "ok",
  pages: [{ url: PAGE, text: "Neues Programm" }],
  candidates: [],
  text: `## Seite 1: ${PAGE} (html)\nNeues Programm`,
  allowedUrls: [PAGE],
  via: "seiten",
  adapterIssues: {},
};
const call = (step: CallRecord["step"], model: string): CallRecord => ({
  step,
  providerId: provider.id,
  model,
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  webSearchRequests: 0,
  turns: 1,
  durationMs: 1,
  costUsd: 0.01,
  result: "ok",
});

/** Falscher Extraktor: Antwort je nach `strong`, Aufrufe werden mitgeschrieben. */
function fake(normal: ExtractOutcome, strong: ExtractOutcome) {
  const seen: ExtractInput[] = [];
  const extractor: Extractor = async (input) => {
    seen.push(input);
    return input.strong
      ? { outcome: strong, calls: [call("fallback", "sonnet")] }
      : { outcome: normal, calls: [call("extract", "haiku")] };
  };
  return { extractor, seen };
}

let n = 0;
/** Eigenes Verzeichnis je Fall, mit einem Vorstand von 4 Events. */
async function run(
  f: { extractor: Extractor },
  opts: { mayRetry?: () => boolean } = { mayRetry: () => true },
  signal = new AbortController().signal,
) {
  const dir = join(scratch, `raw-${n++}`);
  writeRaw(dir, provider.id, {
    events: events(4),
    inputHash: "alt",
    model: "haiku",
    status: "ok",
    checkedAt: "2026-10-11T03:00:00+02:00",
    changedAt: "2026-10-05T03:00:00+02:00",
    sources: [],
  });
  const r = await refreshProvider({
    provider,
    fetched,
    prevOfferCount: 0,
    extractor: f.extractor,
    signal,
    keyParts: { prompt: "P", schema: "{}", model: "haiku" },
    ...opts,
    today: "2026-10-12",
    now: "2026-10-12T03:00:00+02:00",
    rawDir: dir,
  });
  return { r, raw: readRaw(dir, provider.id) };
}

const ok = (n: number, model: string): ExtractOutcome => ({ kind: "ok", events: events(n), model });

describe("refreshProvider: Einbruch → ein Versuch mit dem Fallback-Modell (Plan 0032)", () => {
  it("Einbruch mit Haiku, voll mit dem Fallback-Modell: übernommen, beide Aufrufe gezählt", async () => {
    const f = fake(ok(0, "haiku"), ok(4, "sonnet"));
    const { r, raw } = await run(f);
    expect(f.seen.map((i) => i.strong ?? false)).toEqual([false, true]);
    expect(r).toMatchObject({ kind: "done", result: "extrahiert", called: true });
    expect(r.calls.map((c) => [c.step, c.model])).toEqual([
      ["extract", "haiku"],
      ["fallback", "sonnet"],
    ]);
    expect(raw).toMatchObject({ model: "sonnet", status: "ok" });
    expect(raw?.pending).toBeUndefined();
  });

  it("auch das Fallback-Modell bricht ein: Bestand bleibt, pending vom Fallback-Modell", async () => {
    const { r, raw } = await run(fake(ok(0, "haiku"), ok(1, "sonnet")));
    expect(r).toMatchObject({ kind: "done", result: "einbruch" });
    expect(raw?.events).toHaveLength(4);
    expect(raw?.pending?.model).toBe("sonnet");
  });

  it("zweiter Versuch fehler: Bestand bleibt ohne pending, damit die nächste Nacht nicht Haikus Antwort übernimmt", async () => {
    const { r, raw } = await run(fake(ok(0, "haiku"), { kind: "fehler", reason: "Zeitüberschreitung" }));
    expect(r).toMatchObject({ kind: "done", result: "einbruch" });
    expect(r.calls).toHaveLength(2);
    expect(raw).toMatchObject({ status: "fehler", inputHash: "alt" });
    expect(raw?.events).toHaveLength(4);
    expect(raw?.pending).toBeUndefined();
  });

  it("Bremse oder Zeitbudget vor dem zweiten Versuch: kein Aufruf, Bestand ohne pending", async () => {
    const f = fake(ok(0, "haiku"), ok(4, "sonnet"));
    const { r, raw } = await run(f, { mayRetry: () => false });
    expect(f.seen).toHaveLength(1);
    expect(r).toMatchObject({ kind: "done", result: "einbruch" });
    expect(raw?.pending).toBeUndefined();
    expect(raw?.reason).toMatch(/^Einbruch nicht bestätigt \(kein zweiter Versuch/);
  });

  it("ohne mayRetry (Entdecken): Einbruch wie bisher mit pending, kein zweiter Aufruf", async () => {
    const f = fake(ok(0, "haiku"), ok(4, "sonnet"));
    const { raw } = await run(f, {});
    expect(f.seen).toHaveLength(1);
    expect(raw?.pending?.model).toBe("haiku");
  });

  it("Abbruch im zweiten Versuch beendet den Lauf, der Anbieter bleibt unverändert", async () => {
    const { r, raw } = await run(fake(ok(0, "haiku"), { kind: "abort", abort: "limit" }));
    expect(r).toMatchObject({ kind: "abort", abort: "limit" });
    expect(raw?.pending).toBeUndefined();
    expect(raw?.inputHash).toBe("alt");
  });

  it("kein Einbruch: kein zweiter Aufruf", async () => {
    const f = fake(ok(4, "haiku"), ok(4, "sonnet"));
    const { r } = await run(f);
    expect(f.seen).toHaveLength(1);
    expect(r).toMatchObject({ kind: "done", result: "extrahiert" });
  });

  it("Abbruch des Laufs im zweiten Versuch: abgebrochen, Aufrufe beider Versuche gezählt, nichts geschrieben", async () => {
    const controller = new AbortController();
    const extractor: Extractor = async (input) => {
      if (!input.strong) return { outcome: ok(0, "haiku"), calls: [call("extract", "haiku")] };
      controller.abort();
      return { outcome: { kind: "fehler", reason: "abgebrochen" }, calls: [call("fallback", "sonnet")] };
    };
    const { r, raw } = await run({ extractor }, { mayRetry: () => true }, controller.signal);
    expect(r).toMatchObject({ kind: "abgebrochen" });
    expect(r.calls).toHaveLength(2);
    expect(raw?.inputHash).toBe("alt");
  });

  it("Wurf im zweiten Versuch: unbestätigt, die Aufrufe des ersten zählen", async () => {
    const extractor: Extractor = async (input) => {
      if (input.strong) throw new Error("kaputt");
      return { outcome: ok(0, "haiku"), calls: [call("extract", "haiku")] };
    };
    const { r, raw } = await run({ extractor });
    expect(r).toMatchObject({ kind: "done", result: "einbruch" });
    expect(r.calls).toHaveLength(1);
    expect(raw?.pending).toBeUndefined();
    expect(raw?.reason).toContain("kaputt");
  });
});
