import { describe, expect, it } from "vitest";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import {
  checkExtraction,
  type ExtractContext,
  extractMessage,
  extractResponseSchema,
  inputsFromFetch,
  type ModelReply,
  runExtraction,
} from "./extract.ts";

const { providers } = loadFixtures();
const provider = providers.find((p) => p.id === "familientreff-beispiel");
if (!provider) throw new Error("Fixture familientreff-beispiel fehlt");

const PAGE = "https://example.org/familientreff/programm";
const ctx: ExtractContext = {
  provider,
  allowedUrls: [PAGE, "https://example.org/kandidat/1"],
  horizon: { from: "2026-10-05", to: "2027-10-05" },
  freeDays: { "2026-11-04": "Herbstferien" },
};

const treff = {
  venueId: "familientreff-beispiel-haus",
  title: "Offener Krabbeltreff",
  summary: "Spielen und Austausch für Familien mit Babys, Kaffee steht bereit.",
  topics: ["krabbelgruppe", "elterncafe"],
  format: "regelmaessig",
  registration: "ohne-anmeldung",
  cost: "kostenlos",
  url: "https://example.org/familientreff/krabbeltreff",
  sourceUrl: PAGE,
  availability: { status: "ohne-anmeldung" },
  schedule: { kind: "weekly", weekdays: ["WE"], start: "10:00", end: "11:30", from: "2026-10-07", skipHolidays: true },
};
const errorsOf = (r: ReturnType<typeof checkExtraction>) => (r.ok ? [] : r.errors);

describe("checkExtraction", () => {
  it("gültige Antwort: providerId setzt der Code", () => {
    const r = checkExtraction({ events: [treff] }, ctx);
    expect(r.ok && r.events).toEqual([{ ...treff, providerId: "familientreff-beispiel" }]);
  });

  it("leere Liste ist gültig (keine Termine)", () => {
    expect(checkExtraction({ events: [] }, ctx)).toMatchObject({ ok: true, events: [] });
  });

  it("sourceUrl muss eine abgerufene Seite oder ein Kandidat sein (Schutz gegen Prompt-Injection)", () => {
    expect(errorsOf(checkExtraction({ events: [{ ...treff, sourceUrl: "https://boese.example/x" }] }, ctx))).toEqual([
      "events.0 („Offener Krabbeltreff“).sourceUrl: https://boese.example/x ist keine abgerufene Seite",
    ]);
  });

  it("sourceUrl: Schrägstrich am Ende und Fragment sind egal", () => {
    expect(checkExtraction({ events: [{ ...treff, sourceUrl: `${PAGE}/#kurse` }] }, ctx).ok).toBe(true);
    expect(checkExtraction({ events: [{ ...treff, sourceUrl: "https://example.org/kandidat/1/" }] }, ctx).ok).toBe(
      true,
    );
  });

  it("sourceUrl, die keine URL ist, wird abgelehnt", () => {
    expect(errorsOf(checkExtraction({ events: [{ ...treff, sourceUrl: "Seite 1" }] }, ctx))).toEqual([
      "events.0 („Offener Krabbeltreff“).sourceUrl: Seite 1 ist keine abgerufene Seite",
    ]);
  });

  it("providerId und via setzt nie das Modell", () => {
    expect(errorsOf(checkExtraction({ events: [{ ...treff, providerId: "x", via: "stadt-vk" }] }, ctx))).toEqual([
      "events.0 („Offener Krabbeltreff“): providerId setzt der Code, nicht die Antwort",
      "events.0 („Offener Krabbeltreff“): via setzt der Code, nicht die Antwort",
    ]);
  });

  it("Meldungen aus validateRaw: fremder Ort, Schemafehler", () => {
    expect(errorsOf(checkExtraction({ events: [{ ...treff, venueId: "anderswo" }] }, ctx))).toEqual([
      "events.0 („Offener Krabbeltreff“): Ort anderswo gehört nicht zu familientreff-beispiel (Orte: familientreff-beispiel-haus)",
    ]);
    expect(errorsOf(checkExtraction({ events: [{ ...treff, format: "dauernd" }] }, ctx))[0]).toMatch(
      /^events\.0 \(„Offener Krabbeltreff“\)\.format: /,
    );
  });

  it("keine Antwortform", () => {
    expect(errorsOf(checkExtraction("Hallo", ctx))).toEqual(["Antwort ist kein Objekt mit events"]);
  });
});

describe("extractResponseSchema", () => {
  it("aus Zod abgeleitet: events ohne providerId und via, strikt", () => {
    const schema = extractResponseSchema() as {
      properties: { events: { items: { properties: Record<string, unknown>; additionalProperties: boolean } } };
    };
    const item = schema.properties.events.items;
    expect(Object.keys(item.properties)).toContain("schedule");
    expect(Object.keys(item.properties)).not.toContain("providerId");
    expect(Object.keys(item.properties)).not.toContain("via");
    expect(item.additionalProperties).toBe(false);
  });

  it("ohne $schema (die CLI lehnt Draft 2020-12 als Meta-Schema ab)", () => {
    expect(extractResponseSchema()).not.toHaveProperty("$schema");
  });
});

describe("extractMessage", () => {
  it("Datum, Horizont, Katalogauszug ohne Notizen, dann der Text", () => {
    const msg = extractMessage({ provider: { ...provider, notes: ["intern"] }, text: "## Seite 1: …", ctx });
    expect(msg).toMatch(/^Heute: 2026-10-05\nHorizont: 2026-10-05 bis 2027-10-05\n/);
    expect(msg).toContain('"id": "familientreff-beispiel-haus"');
    expect(msg).not.toContain("intern");
    expect(msg).not.toContain("publicId");
    expect(msg.endsWith("## Seite 1: …")).toBe(true);
  });
});

const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 1, cacheCreationTokens: 2, webSearchRequests: 0 };
const reply = (over: Partial<ModelReply>): ModelReply => ({
  output: null,
  usage,
  costUsd: 0.01,
  turns: 2,
  durationMs: 100,
  abort: null,
  truncated: false,
  error: null,
  ...over,
});
const ok = reply({ output: { events: [treff] } });
const invalid = reply({ output: { events: [{ ...treff, sourceUrl: "https://boese.example/x" }] } });

/** Fake-Aufrufer: liefert die Antworten der Reihe nach und merkt sich Modell und Nachricht. */
function fake(...replies: ModelReply[]) {
  const seen: Array<{ model: string; user: string }> = [];
  return {
    seen,
    call: async (model: string, user: string) => {
      seen.push({ model, user });
      const next = replies.shift();
      if (!next) throw new Error("kein weiterer Aufruf erwartet");
      return next;
    },
  };
}
const run = (f: ReturnType<typeof fake>) =>
  runExtraction({
    providerId: provider.id,
    model: "haiku",
    fallbackModel: "sonnet",
    user: "EINGABE",
    ctx,
    call: f.call,
  });

describe("inputsFromFetch", () => {
  const cand = {
    source: "stadt-vk",
    sourceId: "1",
    title: "Krabbelgruppe",
    description: "",
    detailUrl: "https://example.org/kandidat/1",
    cancelled: false,
    soldOut: false,
    waitlist: false,
    weekly: true,
    occurrences: [{ start: "2026-10-07T10:00" }],
  };
  it("Kandidaten aus dem Abschnitt der Eingabe, erlaubte URLs aus Seiten und detailUrl", () => {
    const text = `## Seite 1: ${PAGE} (html)\n## TEXT\nKrabbeln\n\n## Kandidaten (1)\n${JSON.stringify(cand)}`;
    const r = inputsFromFetch(text, [
      { url: PAGE, ok: true },
      { url: "https://example.org/kaputt", ok: false },
    ]);
    expect(r.candidates).toEqual([cand]);
    expect(r.allowedUrls).toEqual([PAGE, "https://example.org/kandidat/1"]);
  });

  it("kaputte oder fremde Zeilen im Kandidaten-Abschnitt werden übergangen", () => {
    const text = `## Kandidaten (3)\n{kaputt\n{"title": "ohne Pflichtfelder"}\n${JSON.stringify(cand)}`;
    expect(inputsFromFetch(text, []).candidates).toEqual([cand]);
  });

  it("ohne Kandidaten-Abschnitt", () => {
    expect(inputsFromFetch("## Seite 1: x", [{ url: PAGE, ok: true }])).toEqual({
      candidates: [],
      allowedUrls: [PAGE],
    });
  });
});

describe("runExtraction", () => {
  it("gültig im ersten Versuch: ein Aufruf", async () => {
    const f = fake(ok);
    const r = await run(f);
    expect(r.outcome).toEqual({ kind: "ok", events: [{ ...treff, providerId: provider.id }], model: "haiku" });
    expect(r.calls).toEqual([
      {
        step: "extract",
        providerId: provider.id,
        model: "haiku",
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 1,
        cacheCreationTokens: 2,
        webSearchRequests: 0,
        turns: 2,
        durationMs: 100,
        costUsd: 0.01,
        result: "ok",
      },
    ]);
  });

  it("ungültig → eine Wiederholung mit den Meldungen und der vorigen Antwort", async () => {
    const f = fake(invalid, ok);
    const r = await run(f);
    expect(r.outcome).toMatchObject({ kind: "ok", model: "haiku" });
    expect(r.calls.map((c) => [c.step, c.model, c.result])).toEqual([
      ["extract", "haiku", "invalid"],
      ["extract", "haiku", "ok"],
    ]);
    expect(f.seen[1]?.user).toMatch(/^EINGABE\n\n## Korrektur\n/);
    expect(f.seen[1]?.user).toContain("ist keine abgerufene Seite");
    expect(f.seen[1]?.user).toContain("https://boese.example/x");
  });

  it("zweimal ungültig → ein Versuch mit dem Fallback-Modell, frische Eingabe", async () => {
    const f = fake(invalid, invalid, ok);
    const r = await run(f);
    expect(r.outcome).toMatchObject({ kind: "ok", model: "sonnet" });
    expect(r.calls.map((c) => [c.step, c.model, c.result])).toEqual([
      ["extract", "haiku", "invalid"],
      ["extract", "haiku", "invalid"],
      ["fallback", "sonnet", "ok"],
    ]);
    expect(f.seen[2]?.user).toBe("EINGABE");
  });

  it("auch der Fallback ungültig → fehler mit den Meldungen", async () => {
    const r = await run(fake(invalid, invalid, invalid));
    expect(r.outcome.kind).toBe("fehler");
    expect(r.outcome.kind === "fehler" && r.outcome.reason).toMatch(/^ungültig nach Wiederholung und Fallback: /);
    expect(r.calls).toHaveLength(3);
  });

  it("technischer Fehler → ohne Wiederholung zum Fallback", async () => {
    const f = fake(reply({ error: "keine JSON-Ausgabe der CLI" }), ok);
    const r = await run(f);
    expect(r.outcome).toMatchObject({ kind: "ok", model: "sonnet" });
    expect(r.calls.map((c) => c.result)).toEqual(["error", "ok"]);
  });

  it("technischer Fehler auch im Fallback → fehler mit dem Grund", async () => {
    const r = await run(fake(reply({ error: "a" }), reply({ error: "Zeitüberschreitung" })));
    expect(r.outcome).toEqual({ kind: "fehler", reason: "Fehler im Fallback (sonnet): Zeitüberschreitung" });
  });

  it("abgeschnitten → fehler ohne Wiederholung und ohne Fallback", async () => {
    const r = await run(fake(reply({ truncated: true })));
    expect(r.outcome).toEqual({ kind: "fehler", reason: "Ausgabe abgeschnitten (haiku)" });
    expect(r.calls.map((c) => c.result)).toEqual(["truncated"]);
  });

  it("abgeschnitten in der Wiederholung → fehler, kein Fallback", async () => {
    const r = await run(fake(invalid, reply({ truncated: true })));
    expect(r.outcome.kind).toBe("fehler");
    expect(r.calls).toHaveLength(2);
  });

  it("abort wird sofort durchgereicht, auch im Fallback", async () => {
    const auth = await run(fake(reply({ abort: "auth" })));
    expect(auth.outcome).toEqual({ kind: "abort", abort: "auth" });
    expect(auth.calls.map((c) => c.result)).toEqual(["abort"]);
    const limit = await run(fake(invalid, invalid, reply({ abort: "limit" })));
    expect(limit.outcome).toEqual({ kind: "abort", abort: "limit" });
  });

  it("ohne eigenes Fallback-Modell (gleich dem ersten) kein dritter Aufruf", async () => {
    const f = fake(invalid, invalid);
    const r = await runExtraction({
      providerId: provider.id,
      model: "sonnet",
      fallbackModel: "sonnet",
      user: "EINGABE",
      ctx,
      call: f.call,
    });
    expect(r.outcome.kind).toBe("fehler");
    expect(r.calls).toHaveLength(2);
  });
});
