import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Anbieter } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import type { CallRecord, ExtractInput, ExtractOutcome, Extractor } from "../lib/extract.ts";
import { isV2, type ProviderRaw, RawEvent, type UnitState } from "../lib/raw.ts";
import type { FetchedProvider, FetchedUnit } from "../lib/refresh.ts";
import { readRaw, writeRaw } from "./files.ts";
import { refreshProvider } from "./refresh.ts";

const scratch = mkdtempSync(join(tmpdir(), "zp-refresh-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const PAGE = "https://example.org/familientreff/programm";
const pageUrl = (k: number) => (k === 0 ? PAGE : `${PAGE}/${k}`);
const unitId = (k: number) => `seite:${pageUrl(k)}`;
/** Der Fixture-Anbieter mit `pages` Terminseiten */
const providerWith = (pages: number): Anbieter => {
  const p = loadFixtures().providers.find((x) => x.id === "familientreff-beispiel");
  if (p?.role !== "anbieter") throw new Error("Fixture familientreff-beispiel fehlt");
  return {
    ...p,
    programme: Array.from({ length: pages }, (_, k) => ({
      url: pageUrl(k),
      kind: "html" as const,
      use: "termine" as const,
    })),
  };
};
const provider = providerWith(1);
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
const events = (n: number, prefix = "Treff") => Array.from({ length: n }, (_, i) => ev(`${prefix} ${i + 1}`));
const unit = (k: number, over: Partial<FetchedUnit> = {}): FetchedUnit => ({
  id: unitId(k),
  status: "ok",
  pages: [{ url: pageUrl(k), text: `Neues Programm ${k}` }],
  candidates: [],
  text: `## Seite 1: ${pageUrl(k)} (html)\nNeues Programm ${k}`,
  allowedUrls: [pageUrl(k)],
  ...over,
});
const fetchedWith = (units: FetchedUnit[]): FetchedProvider => ({
  status: "ok",
  text: units.map((u) => u.text).join("\n\n"),
  pages: units.flatMap((u) => u.pages),
  candidates: [],
  allowedUrls: units.flatMap((u) => u.allowedUrls),
  via: "seiten",
  adapterIssues: {},
  units,
  beilagen: {},
});
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
const state = (n: number, over: Partial<UnitState> = {}): UnitState => ({
  events: events(n),
  inputHash: "alt",
  model: "haiku",
  status: "ok",
  checkedAt: "2026-10-11T03:00:00+02:00",
  changedAt: "2026-10-05T03:00:00+02:00",
  ...over,
});

/** Falscher Extraktor: Antwort je nach `strong`, Aufrufe werden mitgeschrieben. */
function fake(normal: ExtractOutcome, strong: ExtractOutcome, models = { normal: "haiku", strong: "sonnet" }) {
  const seen: ExtractInput[] = [];
  const extractor: Extractor = async (input) => {
    seen.push(input);
    return input.strong
      ? { outcome: strong, calls: [call("fallback", models.strong)] }
      : { outcome: normal, calls: [call("extract", models.normal)] };
  };
  return { extractor, seen };
}

let n = 0;
/** Eigenes Verzeichnis je Fall, Vorzustand `prev` (Standard: V2 mit einer Einheit und 4 Events). */
async function run(
  f: { extractor: Extractor },
  opts: Partial<Parameters<typeof refreshProvider>[0]> = { mayRetry: () => true },
  prev: ProviderRaw | undefined = { version: 2, units: { [unitId(0)]: state(4) } },
) {
  const dir = join(scratch, `raw-${n++}`);
  if (prev) writeRaw(dir, provider.id, prev);
  const r = await refreshProvider({
    provider,
    fetched: fetchedWith([unit(0)]),
    extractor: f.extractor,
    signal: new AbortController().signal,
    keyParts: { prompt: "P", schema: "{}", model: "haiku" },
    freeDays: {},
    ...opts,
    today: "2026-10-12",
    now: "2026-10-12T03:00:00+02:00",
    rawDir: dir,
  });
  const raw = readRaw(dir, provider.id);
  return { r, raw, u: (k = 0) => (raw && isV2(raw) ? raw.units[unitId(k)] : undefined) };
}

const ok = (count: number, model: string, prefix?: string): ExtractOutcome => ({
  kind: "ok",
  events: events(count, prefix),
  model,
});

describe("refreshProvider: Einbruch → ein Versuch mit dem Fallback-Modell (Plan 0032)", () => {
  it("Einbruch mit Haiku, voll mit dem Fallback-Modell: übernommen, beide Aufrufe gezählt, mit Einheit", async () => {
    const f = fake(ok(0, "haiku"), ok(4, "sonnet"));
    const { r, u } = await run(f);
    expect(f.seen.map((i) => i.strong ?? false)).toEqual([false, true]);
    expect(r).toMatchObject({ kind: "done", result: "extrahiert", called: true });
    expect(r.calls.map((c) => [c.step, c.model, c.unit])).toEqual([
      ["extract", "haiku", unitId(0)],
      ["fallback", "sonnet", unitId(0)],
    ]);
    expect(u()).toMatchObject({ model: "sonnet", status: "ok" });
    expect(u()?.pending).toBeUndefined();
  });

  it("gleiches Modell für beide (Plan 0048, E5): Einbruch → zweiter Aufruf, erst danach pending", async () => {
    const f = fake(ok(0, "opus"), ok(1, "opus"), { normal: "opus", strong: "opus" });
    const { r, u } = await run(f);
    expect(f.seen.map((i) => i.strong ?? false)).toEqual([false, true]);
    expect(r).toMatchObject({ kind: "done", result: "einbruch" });
    expect(u()?.pending?.events).toHaveLength(1);
  });

  it("auch das Fallback-Modell bricht ein: Bestand bleibt, pending vom Fallback-Modell", async () => {
    const { r, u } = await run(fake(ok(0, "haiku"), ok(1, "sonnet")));
    expect(r).toMatchObject({ kind: "done", result: "einbruch" });
    expect(u()?.events).toHaveLength(4);
    expect(u()?.pending?.model).toBe("sonnet");
  });

  it("zweiter Versuch fehler: Bestand bleibt ohne pending, damit die nächste Nacht nicht die erste Antwort übernimmt", async () => {
    const { r, u } = await run(fake(ok(0, "haiku"), { kind: "fehler", reason: "Zeitüberschreitung" }));
    expect(r).toMatchObject({ kind: "done", result: "einbruch" });
    expect(r.calls).toHaveLength(2);
    expect(u()).toMatchObject({ status: "fehler", inputHash: "alt" });
    expect(u()?.events).toHaveLength(4);
    expect(u()?.pending).toBeUndefined();
  });

  it("Bremse oder Zeitbudget vor dem zweiten Versuch: kein Aufruf, Bestand ohne pending", async () => {
    const f = fake(ok(0, "haiku"), ok(4, "sonnet"));
    const { r, u } = await run(f, { mayRetry: () => false });
    expect(f.seen).toHaveLength(1);
    expect(r).toMatchObject({ kind: "done", result: "einbruch" });
    expect(u()?.pending).toBeUndefined();
    expect(u()?.reason).toMatch(/^Einbruch nicht bestätigt \(kein zweiter Versuch/);
  });

  it("ohne mayRetry (Entdecken): Einbruch mit pending, kein zweiter Aufruf", async () => {
    const f = fake(ok(0, "haiku"), ok(4, "sonnet"));
    const { u } = await run(f, {});
    expect(f.seen).toHaveLength(1);
    expect(u()?.pending?.model).toBe("haiku");
  });

  it("Abbruch im zweiten Versuch beendet den Lauf, die Einheit bleibt unverändert", async () => {
    const { r, u } = await run(fake(ok(0, "haiku"), { kind: "abort", abort: "limit" }));
    expect(r).toMatchObject({ kind: "abort", abort: "limit" });
    expect(u()?.pending).toBeUndefined();
    expect(u()?.inputHash).toBe("alt");
  });

  it("kein Einbruch: kein zweiter Aufruf", async () => {
    const f = fake(ok(4, "haiku"), ok(4, "sonnet"));
    const { r } = await run(f);
    expect(f.seen).toHaveLength(1);
    expect(r).toMatchObject({ kind: "done", result: "extrahiert" });
  });

  it("Abbruch des Laufs im zweiten Versuch: abgebrochen, Aufrufe beider Versuche gezählt, Einheit unverändert", async () => {
    const controller = new AbortController();
    const extractor: Extractor = async (input) => {
      if (!input.strong) return { outcome: ok(0, "haiku"), calls: [call("extract", "haiku")] };
      controller.abort();
      return { outcome: { kind: "fehler", reason: "abgebrochen" }, calls: [call("fallback", "sonnet")] };
    };
    const { r, u } = await run({ extractor }, { mayRetry: () => true, signal: controller.signal });
    expect(r).toMatchObject({ kind: "abgebrochen" });
    expect(r.calls).toHaveLength(2);
    expect(u()?.inputHash).toBe("alt");
  });

  it("Wurf im zweiten Versuch: unbestätigt, die Aufrufe des ersten zählen", async () => {
    const extractor: Extractor = async (input) => {
      if (input.strong) throw new Error("kaputt");
      return { outcome: ok(0, "haiku"), calls: [call("extract", "haiku")] };
    };
    const { r, u } = await run({ extractor });
    expect(r).toMatchObject({ kind: "done", result: "einbruch" });
    expect(r.calls).toHaveLength(1);
    expect(u()?.pending).toBeUndefined();
    expect(u()?.reason).toContain("kaputt");
  });
});

describe("refreshProvider je Einheit (Plan 0048, E1, E5, E7)", () => {
  const three = providerWith(3);
  const prev3: ProviderRaw = {
    version: 2,
    units: { [unitId(0)]: state(2), [unitId(1)]: state(2), [unitId(2)]: state(2) },
  };

  it("Nachricht mit Auszug der Einheit und Kennung; Prüfung gegen den vollen Eintrag", async () => {
    const f = fake(ok(2, "haiku"), ok(2, "sonnet"));
    await run(f, { provider: three, fetched: fetchedWith([unit(0), unit(1), unit(2)]) }, prev3);
    expect(f.seen.map((i) => i.unit)).toEqual([unitId(0), unitId(1), unitId(2)]);
    expect(f.seen[0]?.provider).toBe(three);
    expect(f.seen[0]?.excerpt?.programme).toHaveLength(3);
    expect(f.seen[0]?.text).toContain("Neues Programm 0");
  });

  it("Abbruch über mayContinue nach zwei von drei Einheiten: zwei neue, eine alte, Datei gültig", async () => {
    let left = 2;
    const f = fake(ok(3, "haiku", "Neu"), ok(3, "sonnet"));
    const { r, raw, u } = await run(
      f,
      { provider: three, fetched: fetchedWith([unit(0), unit(1), unit(2)]), mayContinue: () => left-- > 0 },
      prev3,
    );
    expect(f.seen).toHaveLength(2);
    expect(r).toMatchObject({ kind: "done", result: "offen" });
    expect(r.kind === "done" && r.units).toEqual({
      [unitId(0)]: "extrahiert",
      [unitId(1)]: "extrahiert",
      [unitId(2)]: "offen",
    });
    expect(raw && isV2(raw)).toBe(true);
    expect(u(0)?.events[0]?.title).toBe("Neu 1");
    expect(u(2)).toEqual(state(2));
  });

  it("Seitenausfall kostet nur die Seite: die anderen werden extrahiert, alte Events der ausgefallenen bleiben", async () => {
    const f = fake(ok(3, "haiku", "Neu"), ok(3, "sonnet"));
    const down = unit(1, { status: "fehler", reason: "HTTP 404", klasse: "dauerhaft", pages: [], text: "" });
    const { r, u } = await run(f, { provider: three, fetched: fetchedWith([unit(0), down, unit(2)]) }, prev3);
    expect(r).toMatchObject({ kind: "done", result: "teilausfall" });
    expect(u(1)).toMatchObject({ status: "fehler", klasse: "dauerhaft", events: state(2).events });
    expect(u(0)?.events).toHaveLength(3);
  });

  it("geänderte URL: die alte Einheit bleibt, bis die neue inputHash hat; Soft-404 der neuen → pending", async () => {
    const moved: FetchedUnit = unit(5);
    const prev: ProviderRaw = { version: 2, units: { [unitId(0)]: state(4) } };
    const p = { ...provider, programme: [{ url: pageUrl(5), kind: "html" as const, use: "termine" as const }] };
    // Soft-404: die neue Seite liefert nichts → gegen die 4 Angebote der verwaisten geprüft → Einbruch
    const soft = await run(fake(ok(0, "haiku"), ok(0, "sonnet")), { provider: p, fetched: fetchedWith([moved]) }, prev);
    expect(soft.r).toMatchObject({ kind: "done", result: "einbruch" });
    expect(soft.u(0)).toEqual(state(4));
    expect(soft.u(5)?.pending).toBeDefined();
    // gelungen: neue Einheit mit inputHash, die verwaiste entfällt
    const good = await run(fake(ok(4, "haiku"), ok(4, "sonnet")), { provider: p, fetched: fetchedWith([moved]) }, prev);
    expect(good.r).toMatchObject({ kind: "done", result: "extrahiert", dropped: [unitId(0)] });
    expect(good.u(0)).toBeUndefined();
    expect(good.u(5)?.inputHash).toBeDefined();
  });

  it("gestrichene Seite ohne neue: entfällt sofort", async () => {
    const two: ProviderRaw = { version: 2, units: { [unitId(0)]: state(4), [unitId(1)]: state(2) } };
    const { u } = await run(fake(ok(4, "haiku"), ok(4, "sonnet")), {}, two);
    expect(u(1)).toBeUndefined();
  });

  describe("Umstellung vom alten Format (E7)", () => {
    const v1: ProviderRaw = { ...state(6), sources: [] };

    it("alle Einheiten gelungen: V2", async () => {
      const { r, raw } = await run(
        fake(ok(3, "haiku"), ok(3, "sonnet")),
        { provider: three, fetched: fetchedWith([unit(0), unit(1), unit(2)]) },
        v1,
      );
      expect(r).toMatchObject({ kind: "done", result: "extrahiert" });
      expect(raw && isV2(raw) && Object.keys(raw.units)).toEqual([unitId(0), unitId(1), unitId(2)]);
    });

    it("eine Einheit gescheitert: V1 unverändert, Grund im Ergebnis", async () => {
      const down = unit(1, { status: "fehler", reason: "HTTP 500", klasse: "voruebergehend", pages: [], text: "" });
      const { r, raw } = await run(
        fake(ok(3, "haiku"), ok(3, "sonnet")),
        { provider: three, fetched: fetchedWith([unit(0), down, unit(2)]) },
        v1,
      );
      expect(r).toMatchObject({ kind: "done", result: "umstellung-ausstehend" });
      expect(r.kind === "done" && r.migration).toBe(`ohne gültiges Ergebnis: ${unitId(1)} (ausgefallen)`);
      expect(raw).toEqual(v1);
    });

    it("Einbruch: V1 unverändert", async () => {
      const { r, raw } = await run(fake(ok(1, "haiku"), ok(1, "sonnet")), {}, v1);
      expect(r).toMatchObject({
        kind: "done",
        result: "umstellung-ausstehend",
        migration: "Einbruch (6 → 1 Angebote)",
      });
      expect(raw).toEqual(v1);
    });

    it("--umstellen: V2 auch mit dauerhaft scheiternder Seite; die Einheit beginnt leer mit fehler", async () => {
      const down = unit(1, { status: "fehler", reason: "HTTP 404", klasse: "dauerhaft", pages: [], text: "" });
      const { r, u } = await run(
        fake(ok(3, "haiku"), ok(3, "sonnet")),
        { provider: three, fetched: fetchedWith([unit(0), down, unit(2)]), forceMigrate: true },
        v1,
      );
      expect(r).toMatchObject({ kind: "done", result: "teilausfall" });
      expect(u(1)).toMatchObject({ events: [], status: "fehler", klasse: "dauerhaft" });
    });
  });

  it("kandidaten ohne Kandidaten und ohne Vorzustand entfällt; mit Vorzustand bleibt sie (leere Eingabe mit Einbruchschutz)", async () => {
    const empty: FetchedUnit = {
      id: "kandidaten",
      status: "leer",
      pages: [],
      candidates: [],
      text: "",
      allowedUrls: [],
    };
    const none = await run(fake(ok(4, "haiku"), ok(4, "sonnet")), { fetched: fetchedWith([unit(0), empty]) });
    expect(none.raw && isV2(none.raw) && Object.keys(none.raw.units)).toEqual([unitId(0)]);
    const had: ProviderRaw = {
      version: 2,
      units: { [unitId(0)]: state(4), kandidaten: state(2, { sources: ["evtermine"] }) },
    };
    const kept = await run(fake(ok(4, "haiku"), ok(4, "sonnet")), { fetched: fetchedWith([unit(0), empty]) }, had);
    expect(kept.r.kind === "done" && kept.r.units["kandidaten"]).toBe("einbruch");
    const raw = kept.raw;
    expect(raw && isV2(raw) && raw.units["kandidaten"]?.events).toHaveLength(2);
  });
});
