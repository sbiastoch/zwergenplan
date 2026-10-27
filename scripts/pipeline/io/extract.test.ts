import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import { CATEGORIES } from "../../../src/domain/topics.ts";
import { createExtractor, EXTRACT_KEY_PARTS, effortOf, modelKey } from "./extract.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const BIN = join(ROOT, "tests/fixtures/fake-claude.mjs");
const scratch = mkdtempSync(join(tmpdir(), "zp-extract-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const { providers } = loadFixtures();
const provider = providers.find((p) => p.id === "familientreff-beispiel");
if (!provider) throw new Error("Fixture familientreff-beispiel fehlt");

const PAGE = "https://example.org/familientreff/programm";
const event = (title: string, weekday: string) => ({
  venueId: "familientreff-beispiel-haus",
  title,
  summary: "Spielen und Austausch für Familien mit Babys.",
  category: "krabbel-spielgruppen",
  topics: ["krabbelgruppe"],
  format: "regelmaessig",
  registration: "ohne-anmeldung",
  cost: "kostenlos",
  url: PAGE,
  sourceUrl: PAGE,
  availability: { status: "ohne-anmeldung" },
  schedule: {
    kind: "weekly",
    weekdays: [weekday],
    start: "10:00",
    end: "11:30",
    from: "2026-10-07",
    skipHolidays: true,
  },
});

let n = 0;
/** Steuerzeile für die Fake-CLI: Antwort aus einer Datei, Protokoll des Aufrufs in einer zweiten. */
function control(events: unknown[]) {
  const id = n++;
  const reply = join(scratch, `reply-${id}.json`);
  const record = join(scratch, `call-${id}.json`);
  writeFileSync(reply, JSON.stringify({ events }));
  return {
    line: `FAKE reply ${record} ${reply}`,
    seen: () => JSON.parse(readFileSync(record, "utf8")) as { args: string[]; stdin: string },
  };
}

const extractor = (partMaxChars?: number, effort?: "high") =>
  createExtractor({
    model: "haiku",
    ...(effort ? { effort } : {}),
    fallbackModel: "sonnet",
    bin: BIN,
    env: { PATH: process.env["PATH"] ?? "", HOME: scratch, CLAUDE_CODE_OAUTH_TOKEN: "tok" },
    freeDays: async () => ({}),
    ...(partMaxChars ? { partMaxChars } : {}),
  });
const input = (text: string) => ({
  provider,
  text,
  pageUrls: [PAGE, `${PAGE}/2`],
  candidates: [],
  allowedUrls: [PAGE, `${PAGE}/2`],
  today: "2026-10-05",
});

describe("Prompt (Plan 0037, E8)", () => {
  it("die Kategorietabelle unter category nennt genau die 12 IDs aus CATEGORIES, jede einmal", () => {
    const lines = EXTRACT_KEY_PARTS.prompt.split("\n").map((l) => l.trim());
    const head = lines.findIndex((l) => /^\|\s*`category`\s*\|/.test(l));
    expect(head, "Tabellenkopf „| `category` | … |“ fehlt im Prompt").toBeGreaterThanOrEqual(0);
    const rows: string[] = [];
    for (const l of lines.slice(head + 2)) {
      const m = /^\|\s*`([^`]+)`\s*\|/.exec(l);
      if (!m?.[1]) break;
      rows.push(m[1]);
    }
    expect([...rows].sort()).toEqual([...CATEGORIES].sort());
    expect(rows).toHaveLength(CATEGORIES.length);
  });
});

describe("createExtractor (Fake-CLI)", () => {
  it("ein Aufruf mit Prompt-Datei und Schema, Events mit providerId, Aufruf mit Verbrauch", async () => {
    const c = control([event("Krabbeltreff", "WE")]);
    const r = await extractor()(input(`## Seite 1: ${PAGE} (html)\n## TEXT\n${c.line}`), new AbortController().signal);
    expect(r.outcome).toMatchObject({
      kind: "ok",
      model: "haiku",
      events: [{ title: "Krabbeltreff", providerId: provider.id }],
    });
    expect(r.calls).toEqual([
      expect.objectContaining({ step: "extract", model: "haiku", result: "ok", costUsd: 0.0015, turns: 2 }),
    ]);
    expect(r.calls[0]).not.toHaveProperty("part");
    const seen = c.seen();
    expect(seen.args[seen.args.indexOf("--system-prompt-file") + 1]).toMatch(/scripts\/pipeline\/prompt\/extract\.md$/);
    expect(JSON.parse(seen.args[seen.args.indexOf("--json-schema") + 1] ?? "")).toHaveProperty("properties.events");
    expect(seen.stdin).toMatch(/^Heute: 2026-10-05\nHorizont: 2026-10-05 bis 2027-10-05\n/);
  });

  it("strong: nur das Fallback-Modell, Aufrufe heißen fallback (Plan 0032, Einbruch → …)", async () => {
    const c = control([event("Krabbeltreff", "WE")]);
    const text = `## Seite 1: ${PAGE} (html)\n## TEXT\n${c.line}`;
    const r = await extractor()({ ...input(text), strong: true }, new AbortController().signal);
    expect(r.outcome).toMatchObject({ kind: "ok", model: "sonnet" });
    expect(r.calls.map((x) => [x.step, x.model])).toEqual([["fallback", "sonnet"]]);
    const seen = c.seen();
    expect(seen.args[seen.args.indexOf("--model") + 1]).toBe("sonnet");
  });

  it("Effort gilt für Haupt- und Fallback-Modell", async () => {
    const c = control([event("Krabbeltreff", "WE")]);
    const text = `## Seite 1: ${PAGE} (html)\n## TEXT\n${c.line}`;
    await extractor(undefined, "high")({ ...input(text), strong: true }, new AbortController().signal);
    const seen = c.seen();
    expect(seen.args.slice(seen.args.indexOf("--model"), seen.args.indexOf("--model") + 4)).toEqual([
      "--model",
      "sonnet",
      "--effort",
      "high",
    ]);
  });

  it("über der Schwelle: ein Aufruf je Seite, Events vereinigt", async () => {
    const a = control([event("Krabbeltreff", "WE")]);
    const b = control([event("Babymassage", "TH")]);
    const pad = "x".repeat(300);
    const text = [`## Seite 1: ${PAGE} (html)`, a.line, pad, `## Seite 2: ${PAGE}/2 (html)`, b.line, pad].join("\n");
    const r = await extractor(500)(input(text), new AbortController().signal);
    expect(r.outcome.kind === "ok" && r.outcome.events.map((e) => e.title)).toEqual(["Krabbeltreff", "Babymassage"]);
    expect(r.calls.map((c) => c.part)).toEqual(["1/2", "2/2"]);
    expect(a.seen().stdin).toContain("Teil 1 von 2: ");
    expect(b.seen().stdin).toContain("Teil 2 von 2: ");
    expect(b.seen().stdin).not.toContain("Krabbeltreff");
  });
});

describe("Effort (Plan 0048, Nachtrag 2)", () => {
  it("LLM_EFFORT_EXTRACT: leer heißt Standard der CLI, sonst eine der Stufen", () => {
    expect(effortOf({})).toBeUndefined();
    expect(effortOf({ LLM_EFFORT_EXTRACT: "" })).toBeUndefined();
    expect(effortOf({ LLM_EFFORT_EXTRACT: "xhigh" })).toBe("xhigh");
    expect(() => effortOf({ LLM_EFFORT_EXTRACT: "hoch" })).toThrow(/LLM_EFFORT_EXTRACT/);
  });

  it("Cache-Schlüssel: ohne Effort unverändert, mit Effort Modell/Effort", () => {
    expect(modelKey("opus", undefined)).toBe("opus");
    expect(modelKey("opus", "high")).toBe("opus/high");
  });
});
