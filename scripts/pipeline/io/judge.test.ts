import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import type { RawEvent } from "../lib/raw.ts";
import { createJudge, type JudgeInput } from "./judge.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const BIN = join(ROOT, "tests/fixtures/fake-claude.mjs");
const scratch = mkdtempSync(join(tmpdir(), "zp-judge-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const found = loadFixtures().providers.find((p) => p.id === "familientreff-beispiel");
if (found?.role !== "anbieter") throw new Error("Fixture familientreff-beispiel fehlt");
const provider = found;

const PAGE = "https://example.org/familientreff/programm";
const S1 = "2026-11-04T10:00:00+01:00";
const event: RawEvent = {
  providerId: provider.id,
  venueId: "familientreff-beispiel-haus",
  title: "Krabbeltreff am Mittwoch",
  summary: "Spielen und Austausch für Familien mit Babys.",
  category: "krabbel-spielgruppen",
  topics: ["krabbelgruppe"],
  format: "regelmaessig",
  registration: "ohne-anmeldung",
  cost: "kostenlos",
  url: PAGE,
  sourceUrl: PAGE,
  availability: { status: "ohne-anmeldung" },
  schedule: { kind: "weekly", weekdays: ["WE"], start: "10:00", end: "11:30", from: "2026-10-07", skipHolidays: true },
};

let n = 0;
/** Steuerzeile für die Fake-CLI (wie in `io/extract.test.ts`): Antwort aus einer Datei, Protokoll in einer zweiten. */
function control(reply: unknown) {
  const id = n++;
  const replyFile = join(scratch, `reply-${id}.json`);
  const record = join(scratch, `call-${id}.json`);
  writeFileSync(replyFile, JSON.stringify(reply));
  return {
    line: `FAKE reply ${record} ${replyFile}`,
    seen: () => JSON.parse(readFileSync(record, "utf8")) as { args: string[]; stdin: string },
  };
}

const env = { PATH: process.env["PATH"] ?? "", HOME: scratch, CLAUDE_CODE_OAUTH_TOKEN: "tok" };
const input = (text: string): JudgeInput => ({
  providerId: provider.id,
  unit: `seite:${PAGE}`,
  text,
  excerpt: provider,
  lost: [{ id: "aaaaaaaa", title: "Krabbeltreff", venueId: "familientreff-beispiel-haus", starts: [S1] }],
  fresh: [{ index: 0, event, starts: [S1], taken: false }],
  pageChanged: false,
});

describe("createJudge (Fake-CLI)", () => {
  it("ein Aufruf mit Prompt-Datei, Schema und Modell; Urteile und CallRecord", async () => {
    const c = control({ verdicts: [{ id: "aaaaaaaa", kind: "gleich", index: 0, start: S1 }] });
    const judge = createJudge({ model: "opus", effort: "high", bin: BIN, env });
    const r = await judge(input(`## Seite 1: ${PAGE} (html)\n## TEXT\n${c.line}`), new AbortController().signal);
    expect(r.outcome).toEqual({
      kind: "ok",
      verdicts: [{ id: "aaaaaaaa", kind: "gleich", index: 0, start: S1 }],
    });
    expect(r.calls).toEqual([
      expect.objectContaining({ step: "judge", model: "opus", unit: `seite:${PAGE}`, result: "ok", turns: 2 }),
    ]);
    const seen = c.seen();
    expect(seen.args[seen.args.indexOf("--system-prompt-file") + 1]).toMatch(/scripts\/pipeline\/prompt\/judge\.md$/);
    expect(seen.args.slice(seen.args.indexOf("--model"), seen.args.indexOf("--model") + 4)).toEqual([
      "--model",
      "opus",
      "--effort",
      "high",
    ]);
    expect(seen.args[seen.args.indexOf("--tools") + 1]).toBe("");
    expect(JSON.parse(seen.args[seen.args.indexOf("--json-schema") + 1] ?? "")).toHaveProperty("properties.verdicts");
    expect(seen.stdin).toContain("## Verlorene Angebote (1)");
    expect(seen.stdin).toContain("Seite seit dem alten Stand: unverändert");
  });

  it("Unsinn des Modells wird unklar, kein Fehler", async () => {
    const c = control({ verdicts: [{ id: "aaaaaaaa", kind: "gleich", index: 5, start: S1 }] });
    const r = await createJudge({ model: "opus", bin: BIN, env })(
      input(`## Seite 1: ${PAGE} (html)\n## TEXT\n${c.line}`),
      new AbortController().signal,
    );
    expect(r.outcome).toEqual({
      kind: "ok",
      verdicts: [{ id: "aaaaaaaa", kind: "unklar", reason: "gleich: Event 5 gibt es nicht" }],
    });
  });

  it("Limit der CLI → abort", async () => {
    const record = join(scratch, "call-429.json");
    const r = await createJudge({ model: "opus", bin: BIN, env })(
      input(`## TEXT\nFAKE 429 ${record}`),
      new AbortController().signal,
    );
    expect(r.outcome).toEqual({ kind: "abort", abort: "limit" });
    expect(r.calls.map((c) => [c.step, c.result])).toEqual([["judge", "abort"]]);
  });

  it("Modell aus LLM_MODEL_JUDGE ist Standard Opus (ohne Option)", async () => {
    const c = control({ verdicts: [{ id: "aaaaaaaa", kind: "unklar" }] });
    const before = process.env["LLM_MODEL_JUDGE"];
    delete process.env["LLM_MODEL_JUDGE"];
    try {
      const r = await createJudge({ bin: BIN, env })(input(`## TEXT\n${c.line}`), new AbortController().signal);
      expect(r.calls[0]?.model).toBe("opus");
      expect(c.seen().args[c.seen().args.indexOf("--model") + 1]).toBe("opus");
    } finally {
      if (before !== undefined) process.env["LLM_MODEL_JUDGE"] = before;
    }
  });
});
