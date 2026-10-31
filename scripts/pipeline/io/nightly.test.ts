import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { validateDataset } from "../../../src/domain/dataset.ts";
import type { Provider } from "../../../src/domain/schema.ts";
import { JUDGE_BRAKES } from "../lib/cost.ts";
import type { CallRecord, ExtractOutcome, Extractor, ExtractResult } from "../lib/extract.ts";
import type { PageOutcome } from "../lib/fetch.ts";
import type { Judge, JudgeInput, JudgeResult, Verdict } from "../lib/judge.ts";
import { isV2, type ProviderRaw, providerStatus, RawEvent } from "../lib/raw.ts";
import type { FetchPlan } from "../lib/select.ts";
import { watchFindings } from "../lib/watch.ts";
import { type FetchResult, unitInputs } from "./fetch-inputs.ts";
import { readCatalog, readPreviousOffers, readRaw, readRawDir } from "./files.ts";
import { runBuildOnly, runNightly } from "./nightly.ts";

const FIXTURES = new URL("../../../tests/fixtures/", import.meta.url);
const TODAY = "2026-10-06";
/** eingefrorene Uhr passend zu TODAY: Übernahme-Grenze und generatedAt hängen nicht vom Tagesdatum ab */
const NOW = () => "2026-10-06T03:00:00+02:00";
const KEY_PARTS = { prompt: "Prompt", schema: "{}", model: "haiku" };

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempData() {
  const root = mkdtempSync(join(tmpdir(), "zp-nightly-"));
  dirs.push(root);
  const dataDir = join(root, "data");
  mkdirSync(dataDir);
  copyFileSync(new URL("providers.yaml", FIXTURES), join(dataDir, "providers.yaml"));
  copyFileSync(new URL("offers.json", FIXTURES), join(dataDir, "offers.json"));
  return { dataDir, runDir: join(root, "runs", TODAY) };
}

/**
 * Abruf ohne Netz: jede Seite liefert „Programm <url>“; `fails` (Anbieter-ID oder Seiten-URL) fallen aus, mit 404
 * dauerhaft, sonst 503. Die Einheiten entstehen wie im echten Abruf (`unitInputs`).
 */
const fakeFetch =
  (fails: readonly string[] = [], text: string | ((url: string) => string) = "Programm", status = 503) =>
  async (plan: FetchPlan, catalog: readonly Provider[]): Promise<FetchResult> => {
    const out: FetchResult = { providers: {}, texts: {}, adapters: {}, inputs: {} };
    for (const p of plan.providers) {
      const owner = catalog.find((c) => c.id === p.id);
      if (owner?.role !== "anbieter") continue;
      const outcomes: PageOutcome[] = p.pages.map((t) =>
        fails.includes(p.id) || fails.includes(t.url)
          ? {
              url: t.url,
              art: "html",
              ok: false,
              reason: `HTTP ${status}`,
              ms: 1,
              klasse: status === 404 ? "dauerhaft" : "voruebergehend",
            }
          : {
              url: t.url,
              art: "html",
              ok: true,
              text: typeof text === "string" ? `${text} ${t.url}` : text(t.url),
              ms: 1,
            },
      );
      const failed = outcomes.some((o) => !o.ok);
      const okPages = outcomes.flatMap((o) => (o.ok ? [{ url: o.url, text: o.text }] : []));
      out.providers[p.id] = { status: failed ? "fehler" : "ok", chars: 0, candidates: 0, pages: [] };
      out.texts[p.id] = `${text} ${p.id}`;
      out.inputs[p.id] = {
        status: failed ? "fehler" : okPages.length > 0 ? "ok" : "leer",
        ...(failed ? { reason: `HTTP ${status}` } : {}),
        text: `${text} ${p.id}`,
        pages: okPages,
        candidates: [],
        allowedUrls: okPages.map((pg) => pg.url),
        via: p.via,
        adapterIssues: {},
        ...unitInputs(owner, outcomes, []),
      };
    }
    return out;
  };

/** Zustand einer Einheit bzw. des Anbieters (V1) */
const unitOf = (raw: ProviderRaw | undefined, unit?: string) =>
  raw && isV2(raw) ? (unit ? raw.units[unit] : Object.values(raw.units)[0]) : raw;

const treff = RawEvent.parse({
  providerId: "familientreff-beispiel",
  venueId: "familientreff-beispiel-haus",
  title: "Offener Krabbeltreff",
  summary: "Spielen und Austausch für Familien mit Babys.",
  topics: ["krabbelgruppe"],
  format: "regelmaessig",
  registration: "ohne-anmeldung",
  cost: "kostenlos",
  url: "https://example.org/familientreff/krabbeltreff",
  sourceUrl: "https://example.org/familientreff/programm",
  availability: { status: "ohne-anmeldung" },
  schedule: {
    kind: "weekly",
    weekdays: ["WE"],
    start: "10:00",
    end: "11:30",
    from: "2026-10-07",
    until: "2026-12-16",
    skipHolidays: true,
  },
});

const treffs = [1, 2, 3].map((k) => ({
  ...treff,
  title: `${treff.title} ${k}`,
  schedule: { ...treff.schedule, start: `1${k}:00`, end: `1${k}:45` },
}));

/** Fake-Extraktor: zählt Aufrufe; Familientreff bekommt drei Treffs (genug für die Umstellung), alle anderen keine Termine. */
function fakeExtractor(outcomeFor?: (id: string) => ExtractOutcome | undefined) {
  const seen: string[] = [];
  const extractor: Extractor = async (input): Promise<ExtractResult> => {
    seen.push(input.provider.id);
    const outcome = outcomeFor?.(input.provider.id) ?? {
      kind: "ok",
      events: input.provider.id === "familientreff-beispiel" ? treffs : [],
      model: "haiku",
    };
    const call = {
      step: "extract" as const,
      providerId: input.provider.id,
      model: "haiku",
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      webSearchRequests: 0,
      turns: 2,
      durationMs: 5,
      costUsd: 0.001,
      result:
        outcome.kind === "ok" ? ("ok" as const) : outcome.kind === "abort" ? ("abort" as const) : ("error" as const),
    };
    return { outcome, calls: [call] };
  };
  return { extractor, seen };
}

const options = (dirsOf: ReturnType<typeof tempData>, extractor: Extractor) => ({
  ...dirsOf,
  extractor,
  keyParts: KEY_PARTS,
  budgetMin: 50,
  today: TODAY,
  now: NOW,
  concurrency: 1,
  fetch: fakeFetch(),
  freeDays: async () => ({}),
});

describe("runNightly (Plan 0032, E5/E6)", () => {
  it("extrahiert, schreibt data/raw (V2) und offers.json; die zweite Nacht mit gleicher Eingabe ruft kein Modell", async () => {
    const dirsOf = tempData();
    const { extractor, seen } = fakeExtractor();
    const first = await runNightly({ ...options(dirsOf, extractor), fetch: fakeFetch(["gemeinde-beispiel"]) });
    expect(seen.length).toBeGreaterThan(0);
    expect(first.calls).toHaveLength(seen.length);
    expect(first.results["familientreff-beispiel"]).toBe("extrahiert");
    expect(first.results["musikschule-beispiel"]).toBe("extrahiert");
    // ohne Rohdatei, mit Angeboten im Vorstand: umgestellt wird nur ganz (E7)
    // Ausfall bleibt sichtbar (Ampel), der Grund der ausstehenden Umstellung steht in migrations
    expect(first.results["gemeinde-beispiel"]).toBe("ausgefallen");
    expect(first.migrations?.["gemeinde-beispiel"]).toMatch(/^ohne gültiges Ergebnis: seite:/);
    expect(first.units?.["familientreff-beispiel"]).toEqual({
      "seite:https://example.org/familientreff/programm": "extrahiert",
    });
    expect(first.build.errors).toEqual([]);
    expect(first.build.written).toBe(join(dirsOf.dataDir, "offers.json"));
    const rawDir = join(dirsOf.dataDir, "raw");
    const ft = readRaw(rawDir, "familientreff-beispiel");
    expect(ft && isV2(ft)).toBe(true);
    expect(unitOf(ft)?.events).toHaveLength(3);
    expect(unitOf(readRaw(rawDir, "musikschule-beispiel"))).toMatchObject({ status: "keine-termine", model: "haiku" });
    expect(readRaw(rawDir, "gemeinde-beispiel")).toBeUndefined();
    const offers = JSON.parse(readFileSync(join(dirsOf.dataDir, "offers.json"), "utf8"));
    expect(offers.horizon).toEqual({ from: TODAY, to: "2027-10-06" });
    // gemeinde-beispiel (nicht umgestellt) behält seinen Vorstand
    expect(offers.offers.some((o: { providerId: string }) => o.providerId === "gemeinde-beispiel")).toBe(true);
    expect(existsSync(join(dirsOf.runDir, "nightly.json"))).toBe(true);
    expect(existsSync(join(dirsOf.runDir, "fetch", "hashes.json"))).toBe(true);

    const second = fakeExtractor();
    const again = await runNightly({ ...options(dirsOf, second.extractor), fetch: fakeFetch(["gemeinde-beispiel"]) });
    expect(second.seen).toEqual([]);
    expect(again.calls).toEqual([]);
    expect(again.results["familientreff-beispiel"]).toBe("unveraendert");
    expect(again.results["musikschule-beispiel"]).toBe("unveraendert");
    expect(again.cached).toBeGreaterThan(0);
  });

  it("Anbieter mit coveredBy und Terminseite: kein Absturz, nur die Einheit kandidaten (Arch-Review 2, B1)", async () => {
    const dirsOf = tempData();
    const file = join(dirsOf.dataDir, "providers.yaml");
    const entries = parse(readFileSync(file, "utf8")) as Array<{ id: string; coveredBy?: string }>;
    const ms = entries.find((p) => p.id === "musikschule-beispiel");
    if (ms) ms.coveredBy = "sammelkalender-beispiel";
    writeFileSync(file, stringify(entries));
    const r = await runNightly(options(dirsOf, fakeExtractor().extractor));
    expect(r.build.errors).toEqual([]);
    expect(Object.keys(r.units?.["musikschule-beispiel"] ?? {})).toEqual(["kandidaten"]);
  });

  it("geänderte URL mit Prüfhinweis: beide Hinweise stehen im Bericht (Arch-Review 3, m1)", async () => {
    const dirsOf = tempData();
    const only = ["familientreff-beispiel"];
    await runNightly({ ...options(dirsOf, fakeExtractor().extractor), only, forceMigrate: only });
    const file = join(dirsOf.dataDir, "providers.yaml");
    const entries = parse(readFileSync(file, "utf8")) as Array<{ id: string; programme: Array<{ url: string }> }>;
    const ft = entries.find((p) => p.id === "familientreff-beispiel");
    if (ft?.programme[0]) ft.programme[0].url = "https://example.org/familientreff/neu";
    writeFileSync(file, stringify(entries));
    const { extractor } = fakeExtractor((id) =>
      id === "familientreff-beispiel"
        ? { kind: "ok", events: treffs, model: "haiku", warnings: ["Kurs ist schon vorbei"] }
        : undefined,
    );
    const r = await runNightly({ ...options(dirsOf, extractor), only });
    expect(r.warnings["familientreff-beispiel"]).toEqual([
      "Kurs ist schon vorbei",
      "seite:https://example.org/familientreff/programm: entfällt (nicht mehr im Katalog)",
    ]);
  });

  it("Umstellung mit Einbruch bleibt aus; --umstellen erzwingt sie (Plan 0048, E7)", async () => {
    const dirsOf = tempData();
    const one = (id: string): ExtractOutcome | undefined =>
      id === "familientreff-beispiel" ? { kind: "ok", events: [treff], model: "haiku" } : undefined;
    const r = await runNightly({ ...options(dirsOf, fakeExtractor(one).extractor), only: ["familientreff-beispiel"] });
    expect(r.results["familientreff-beispiel"]).toBe("umstellung-ausstehend");
    expect(r.migrations?.["familientreff-beispiel"]).toBe("Einbruch (4 → 1 Angebote)");
    const rawDir = join(dirsOf.dataDir, "raw");
    expect(readRaw(rawDir, "familientreff-beispiel")).toBeUndefined();
    const forced = await runNightly({
      ...options(dirsOf, fakeExtractor(one).extractor),
      only: ["familientreff-beispiel"],
      forceMigrate: ["familientreff-beispiel"],
    });
    expect(forced.results["familientreff-beispiel"]).toBe("extrahiert");
    expect(unitOf(readRaw(rawDir, "familientreff-beispiel"))?.events).toHaveLength(1);
  });

  it("Hinweise der Prüfung je Anbieter stehen im Bericht (nightly.json)", async () => {
    const dirsOf = tempData();
    const { extractor } = fakeExtractor((id) =>
      id === "musikschule-beispiel"
        ? { kind: "ok", events: [], model: "haiku", warnings: ["Kurs ist schon vorbei"] }
        : undefined,
    );
    const r = await runNightly(options(dirsOf, extractor));
    expect(r.warnings).toEqual({ "musikschule-beispiel": ["Kurs ist schon vorbei"] });
    const report = JSON.parse(readFileSync(join(dirsOf.runDir, "nightly.json"), "utf8"));
    expect(report.warnings).toEqual(r.warnings);
  });

  it("schreibt build.derivedCategories nach nightly.json (Übergang Plan 0037, E5)", async () => {
    const dirsOf = tempData();
    // Rohevent ohne category (Zustand vor Stufe A): gemeinde-beispiel bekommt es und der Build leitet die Kategorie ab
    const ohneCategory = { ...treff, providerId: "gemeinde-beispiel", venueId: "gemeinde-beispiel-gemeindehaus" };
    const { extractor } = fakeExtractor((id) =>
      id === "gemeinde-beispiel" ? { kind: "ok", events: [ohneCategory], model: "haiku" } : undefined,
    );
    const r = await runNightly(options(dirsOf, extractor));
    expect(r.build.derivedCategories).toBeGreaterThan(0);
    const report = JSON.parse(readFileSync(join(dirsOf.runDir, "nightly.json"), "utf8"));
    expect(report.build.derivedCategories).toBe(r.build.derivedCategories);
    expect(report.build.notes.join("\n")).toContain("aus den Themen abgeleitet");
  });

  it("der erste abort beendet den Lauf geordnet: Rest bleibt unverändert, build läuft trotzdem", async () => {
    const dirsOf = tempData();
    const { extractor, seen } = fakeExtractor(() => ({ kind: "abort", abort: "limit" }));
    const r = await runNightly(options(dirsOf, extractor));
    expect(seen).toHaveLength(1);
    expect(r.abort).toBe("limit");
    const states = Object.values(r.results);
    expect(states.filter((s) => s === "abort")).toHaveLength(1);
    expect(states).toContain("offen");
    // kein Zustand für den abgebrochenen Anbieter
    expect(readRaw(join(dirsOf.dataDir, "raw"), seen[0] ?? "")).toBeUndefined();
    expect(r.build.errors).toEqual([]);
    expect(r.build.written).toBeDefined();
  });

  it("Zeitbudget erreicht: kein Anbieter bearbeitet, build übernimmt den Vorstand", async () => {
    const dirsOf = tempData();
    const { extractor, seen } = fakeExtractor();
    const r = await runNightly({ ...options(dirsOf, extractor), budgetMin: 0 });
    expect(seen).toEqual([]);
    expect(r.budgetHit).toBe(true);
    expect(new Set(Object.values(r.results))).toEqual(new Set(["offen"]));
    expect(existsSync(join(dirsOf.dataDir, "raw"))).toBe(false);
    const before = JSON.parse(readFileSync(new URL("offers.json", FIXTURES), "utf8"));
    const after = JSON.parse(readFileSync(join(dirsOf.dataDir, "offers.json"), "utf8"));
    expect(new Set(after.offers.map((o: { id: string }) => o.id))).toEqual(
      new Set(
        before.offers
          .filter((o: { sessions: Array<{ start: string }> }) => o.sessions.some((s) => s.start >= TODAY))
          .map((o: { id: string }) => o.id),
      ),
    );
  });

  it("--dry-run schreibt nach runs/<datum>/raw und offers.json dort, data/ bleibt unberührt", async () => {
    const dirsOf = tempData();
    const offersBefore = readFileSync(join(dirsOf.dataDir, "offers.json"), "utf8");
    const { extractor } = fakeExtractor();
    const r = await runNightly({ ...options(dirsOf, extractor), dryRun: true });
    expect(existsSync(join(dirsOf.dataDir, "raw"))).toBe(false);
    expect(readFileSync(join(dirsOf.dataDir, "offers.json"), "utf8")).toBe(offersBefore);
    expect(readdirSync(join(dirsOf.runDir, "raw"))).toContain("familientreff-beispiel.json");
    expect(r.build.written).toBe(join(dirsOf.runDir, "offers.json"));
    const dry = JSON.parse(readFileSync(join(dirsOf.runDir, "offers.json"), "utf8"));
    expect(dry.offers.some((o: { title: string }) => o.title === "Offener Krabbeltreff 1")).toBe(true);
  });

  it("räumt den Zustand von Anbietern weg, die nicht mehr im Katalog stehen (Rücknahme, E7)", async () => {
    const dirsOf = tempData();
    const { extractor } = fakeExtractor();
    await runNightly(options(dirsOf, extractor));
    const rawDir = join(dirsOf.dataDir, "raw");
    copyFileSync(join(rawDir, "musikschule-beispiel.json"), join(rawDir, "zurueckgenommen.json"));
    const r = await runNightly(options(dirsOf, fakeExtractor().extractor));
    expect(r.removed).toEqual(["zurueckgenommen"]);
    expect(existsSync(join(rawDir, "zurueckgenommen.json"))).toBe(false);
    expect(r.build.errors).toEqual([]);
  });

  it("wirft der Extraktor nach dem Abbruch (AbortError), zählt der Anbieter als abgebrochen, nicht als fehler", async () => {
    const dirsOf = tempData();
    let n = 0;
    const extractor: Extractor = async (input, signal) => {
      n++;
      if (n === 1) {
        await new Promise((r) => setTimeout(r, 20));
        return { outcome: { kind: "abort", abort: "auth" }, calls: [] };
      }
      await new Promise((_, reject) =>
        signal.addEventListener("abort", () =>
          reject(new DOMException(`abgebrochen ${input.provider.id}`, "AbortError")),
        ),
      );
      throw new Error("unerreichbar");
    };
    const r = await runNightly({ ...options(dirsOf, extractor), concurrency: 2 });
    expect(r.abort).toBe("auth");
    expect(Object.values(r.results)).toContain("abgebrochen");
    expect(Object.values(r.results)).not.toContain("fehler");
  });

  it("Bremse MAX_CALLS erreicht: geordnetes Ende wie beim Zeitbudget, Fertiges bleibt, build läuft (E8)", async () => {
    const dirsOf = tempData();
    const { extractor, seen } = fakeExtractor();
    const r = await runNightly({ ...options(dirsOf, extractor), brakes: { maxCalls: 1, maxTokens: 1_000_000 } });
    expect(seen).toHaveLength(1);
    expect(r.brake).toBe("aufrufe");
    expect(Object.values(r.results).filter((s) => s === "offen").length).toBeGreaterThan(0);
    expect(readRaw(join(dirsOf.dataDir, "raw"), seen[0] ?? "")).toBeDefined();
    expect(r.build.written).toBeDefined();
  });

  it("reißt der letzte Anbieter die Bremse, ist sie trotzdem erreicht", async () => {
    const dirsOf = tempData();
    const { extractor, seen } = fakeExtractor();
    const r = await runNightly({
      ...options(dirsOf, extractor),
      only: ["musikschule-beispiel"],
      brakes: { maxCalls: 1, maxTokens: 1_000_000 },
    });
    expect(seen).toEqual(["musikschule-beispiel"]);
    expect(r.brake).toBe("aufrufe");
  });

  it("Bremse MAX_TOKENS zählt Tokens ein und aus, als Opus-Gegenwert", async () => {
    const dirsOf = tempData();
    const { extractor, seen } = fakeExtractor();
    // ein Haiku-Aufruf: 110 Tokens × 0,2 = 22 Opus-gleichwertige Tokens
    const r = await runNightly({ ...options(dirsOf, extractor), brakes: { maxCalls: 100, maxTokens: 22 } });
    expect(seen).toHaveLength(1);
    expect(r.brake).toBe("tokens");
  });

  it("schreibt kosten.jsonl je Aufruf, den Abruf-Bericht und eine Zeile in data/kosten.csv; Vorstand im Bericht", async () => {
    const dirsOf = tempData();
    const { extractor, seen } = fakeExtractor();
    const r = await runNightly(options(dirsOf, extractor));
    const jsonl = readFileSync(join(dirsOf.runDir, "kosten.jsonl"), "utf8").trimEnd().split("\n");
    expect(jsonl).toHaveLength(seen.length);
    expect(JSON.parse(jsonl[0] ?? "")).toMatchObject({ run: "nacht", date: TODAY, step: "extract", costUsd: 0.001 });
    expect(existsSync(join(dirsOf.runDir, "fetch", "report.md"))).toBe(true);
    const csv = readFileSync(join(dirsOf.dataDir, "kosten.csv"), "utf8").trimEnd().split("\n");
    expect(csv[0]).toMatch(/^datum,lauf,region,aufrufe,/);
    expect(csv[1]).toBe(
      `${TODAY},nacht,alle,${seen.length},${seen.length * 100},${seen.length * 10},${(seen.length * 0.001).toFixed(4)},,0,${seen.length}`,
    );
    expect(r.previous).toEqual({ offers: 9, sessions: 31 });
    // zweite Nacht hängt an
    await runNightly(options(dirsOf, fakeExtractor().extractor));
    expect(readFileSync(join(dirsOf.dataDir, "kosten.csv"), "utf8").trimEnd().split("\n")).toHaveLength(3);
  });

  it("--dry-run schreibt kosten.csv nach runs/<datum>, nicht nach data/", async () => {
    const dirsOf = tempData();
    await runNightly({ ...options(dirsOf, fakeExtractor().extractor), dryRun: true });
    expect(existsSync(join(dirsOf.dataDir, "kosten.csv"))).toBe(false);
    expect(existsSync(join(dirsOf.runDir, "kosten.csv"))).toBe(true);
  });

  it("--only bearbeitet nur die genannten Anbieter", async () => {
    const dirsOf = tempData();
    const { extractor, seen } = fakeExtractor();
    const r = await runNightly({ ...options(dirsOf, extractor), only: ["familientreff-beispiel"] });
    expect(Object.keys(r.results)).toEqual(["familientreff-beispiel"]);
    expect(seen).toEqual(["familientreff-beispiel"]);
  });
});

describe("runNightly: Seitenausfall kostet nur die Seite (Plan 0048, Ziel 1)", () => {
  const A = "https://example.org/familientreff/programm";
  const B = "https://example.org/familientreff/kurse";
  const massage = RawEvent.parse({
    ...treff,
    title: "Babymassage",
    sourceUrl: B,
    schedule: { ...treff.schedule, weekdays: ["FR"], until: "2027-03-26" },
  });
  const neu = RawEvent.parse({
    ...treff,
    title: "Neuer Eltern-Kind-Kurs",
    schedule: { ...treff.schedule, weekdays: ["MO"] },
  });

  /** Katalog mit zweiter Seite B für den Familientreff */
  function twoPages() {
    const dirsOf = tempData();
    const file = join(dirsOf.dataDir, "providers.yaml");
    const entries = parse(readFileSync(file, "utf8")) as Array<{ id: string; programme: object[] }>;
    const ft = entries.find((p) => p.id === "familientreff-beispiel");
    ft?.programme.push({ url: B, kind: "html", use: "termine" });
    writeFileSync(file, stringify(entries));
    return dirsOf;
  }
  /** eine Nacht am Tag `day`; Seite A liefert `a`, B liefert Babymassage; `fails` fallen mit 404 aus */
  async function night(dirsOf: ReturnType<typeof tempData>, day: string, a: RawEvent[], fails: string[] = []) {
    const seen: string[] = [];
    const extractor: Extractor = async (input) => {
      seen.push(input.unit ?? "");
      const events = input.unit === `seite:${A}` ? [...treffs, ...a] : [massage];
      return {
        outcome: { kind: "ok", events, model: "haiku" },
        calls: [
          {
            step: "extract",
            providerId: input.provider.id,
            model: "haiku",
            inputTokens: 1,
            outputTokens: 1,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            webSearchRequests: 0,
            turns: 1,
            durationMs: 1,
            costUsd: 0,
            result: "ok",
          },
        ],
      };
    };
    const r = await runNightly({
      ...options(dirsOf, extractor),
      only: ["familientreff-beispiel"],
      // Seite A mit neuem Kurs hat einen anderen Text, sonst bliebe sie unverändert
      fetch: fakeFetch(fails, (url) => `Programm ${url}${url === A && a.length > 0 ? " mit neuem Kurs" : ""}`, 404),
      today: day,
      now: () => `${day}T03:00:00+02:00`,
      forceMigrate: ["familientreff-beispiel"],
    });
    const offers = readPreviousOffers(join(dirsOf.dataDir, "offers.json"))?.offers ?? [];
    const idOf = (title: string) => offers.find((o) => o.title === title)?.id;
    return { r, seen, idOf };
  }

  it("Ausfall von B: neuer Kurs von A erscheint in derselben Nacht, Bs IDs bleiben; Rückkehr vor Tag 14 hält sie", async () => {
    const dirsOf = twoPages();
    const n0 = await night(dirsOf, "2026-10-06", []);
    const massageId = n0.idOf("Babymassage");
    expect(massageId).toBeDefined();
    const n1 = await night(dirsOf, "2026-10-07", [neu], [B]);
    expect(n1.r.results["familientreff-beispiel"]).toBe("teilausfall");
    expect(n1.idOf("Neuer Eltern-Kind-Kurs")).toBeDefined();
    expect(n1.idOf("Babymassage")).toBe(massageId);
    const n2 = await night(dirsOf, "2026-10-08", [neu], [B]);
    expect(n2.seen).toEqual([]);
    expect(n2.idOf("Babymassage")).toBe(massageId);
    const back = await night(dirsOf, "2026-10-20", [neu]);
    expect(back.seen).toEqual([]); // gleicher Inhalt wie vor dem Ausfall: unverändert
    expect(back.idOf("Babymassage")).toBe(massageId);
  });

  it("B bis Tag 15 weg: Bs Angebote fehlen; Rückkehr danach extrahiert neu, die ID folgt dem Schlüssel", async () => {
    const dirsOf = twoPages();
    const n0 = await night(dirsOf, "2026-10-06", []);
    const massageId = n0.idOf("Babymassage");
    await night(dirsOf, "2026-10-07", [], [B]);
    expect((await night(dirsOf, "2026-10-20", [], [B])).idOf("Babymassage")).toBe(massageId);
    const gone = await night(dirsOf, "2026-10-21", [], [B]);
    expect(gone.r.units?.["familientreff-beispiel"]?.[`seite:${B}`]).toBe("entfernt");
    expect(gone.idOf("Babymassage")).toBeUndefined();
    const back = await night(dirsOf, "2026-10-22", []);
    expect(back.seen).toEqual([`seite:${B}`]);
    // Die Zuordnung kennt nur die Vornacht; die neue ID folgt dem Schlüssel (Titel, Ort) und ist hier wieder dieselbe
    expect(back.idOf("Babymassage")).toBe(massageId);
  });

  it("Wächter über mehrere Nächte: seite ab der zweiten Nacht, entfernt nach 14 Tagen, nach der Rückkehr nichts (E10)", async () => {
    const dirsOf = twoPages();
    const watch = (today: string) =>
      watchFindings({
        raws: readRawDir(join(dirsOf.dataDir, "raw")),
        catalog: readCatalog(join(dirsOf.dataDir, "providers.yaml")),
        discover: [],
        today,
      })
        .filter((f) => f.subject === "familientreff-beispiel")
        .map((f) => `${f.kind} ${f.page ?? ""}`);
    await night(dirsOf, "2026-10-06", []);
    expect(watch("2026-10-06")).toEqual([]);
    await night(dirsOf, "2026-10-07", [], [B]);
    expect(watch("2026-10-07")).toEqual([]);
    await night(dirsOf, "2026-10-08", [], [B]);
    expect(watch("2026-10-08")).toEqual([`seite seite:${B}`]);
    await night(dirsOf, "2026-10-21", [], [B]);
    expect(watch("2026-10-21")).toEqual([`entfernt seite:${B}`]);
    await night(dirsOf, "2026-10-22", []);
    expect(watch("2026-10-22")).toEqual([]);
  });

  it("Anbieter mit nur einer Seite, 14 Tage 404: seine Angebote fallen weg, nichts aus dem Vorstand (Arch-Review M1)", async () => {
    const dirsOf = tempData();
    await night(dirsOf, "2026-10-06", []);
    expect((await night(dirsOf, "2026-10-07", [], [A])).idOf("Offener Krabbeltreff 1")).toBeDefined();
    expect((await night(dirsOf, "2026-10-20", [], [A])).idOf("Offener Krabbeltreff 1")).toBeDefined();
    const gone = await night(dirsOf, "2026-10-21", [], [A]);
    expect(gone.r.results["familientreff-beispiel"]).toBe("fehler");
    expect(gone.idOf("Offener Krabbeltreff 1")).toBeUndefined();
    const offers = readPreviousOffers(join(dirsOf.dataDir, "offers.json"))?.offers ?? [];
    expect(offers.filter((o) => o.providerId === "familientreff-beispiel")).toEqual([]);
  });
});

describe("runNightly: zweiter Versuch auch bei gleichem Fallback-Modell (Plan 0048, E5)", () => {
  it("Einbruch mit opus/opus: zweiter Aufruf, erst danach pending", async () => {
    const dirsOf = tempData();
    const only = ["familientreff-beispiel"];
    await runNightly({ ...options(dirsOf, fakeExtractor().extractor), only, forceMigrate: only });
    const seen: boolean[] = [];
    const extractor: Extractor = async (input) => {
      seen.push(input.strong ?? false);
      return {
        outcome: { kind: "ok", events: [], model: "opus" },
        calls: [
          {
            step: input.strong ? "fallback" : "extract",
            providerId: input.provider.id,
            model: "opus",
            inputTokens: 1,
            outputTokens: 1,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            webSearchRequests: 0,
            turns: 1,
            durationMs: 1,
            costUsd: 0,
            result: "ok",
          },
        ],
      };
    };
    const r = await runNightly({
      ...options(dirsOf, extractor),
      only,
      strongRetry: true,
      fetch: fakeFetch([], "Neues Programm"),
    });
    expect(seen).toEqual([false, true]);
    expect(r.results["familientreff-beispiel"]).toBe("einbruch");
    expect(unitOf(readRaw(join(dirsOf.dataDir, "raw"), "familientreff-beispiel"))?.pending?.model).toBe("opus");
  });
});

describe("runNightly: Lücke je Einheit (Plan 0048, E13)", () => {
  it("fehlt ein Treff der Vornacht: zweiter Aufruf, gaps in nightly.json", async () => {
    const dirsOf = tempData();
    const only = ["familientreff-beispiel"];
    await runNightly({ ...options(dirsOf, fakeExtractor().extractor), only, forceMigrate: only });
    const seen: boolean[] = [];
    const extractor: Extractor = async (input) => {
      seen.push(input.strong ?? false);
      const { extractor: base } = fakeExtractor((id) =>
        id === "familientreff-beispiel" && !input.strong
          ? { kind: "ok", events: treffs.slice(0, 2), model: "opus" }
          : undefined,
      );
      return base(input, new AbortController().signal);
    };
    const r = await runNightly({
      ...options(dirsOf, extractor),
      only,
      strongRetry: true,
      fetch: fakeFetch([], "Neues Programm"),
    });
    expect(seen).toEqual([false, true]);
    expect(r.gaps?.["familientreff-beispiel"]).toEqual({
      "seite:https://example.org/familientreff/programm": { before: 1, after: 0, chosen: "second" },
    });
    expect(unitOf(readRaw(join(dirsOf.dataDir, "raw"), "familientreff-beispiel"))?.events).toHaveLength(3);
  });
});

describe("runBuildOnly (nightly --build-only, Arch-Review S5, M1)", () => {
  it("Anbieter aus dem Katalog entfernt: seine Angebote und sein Zustand fallen weg, validateDataset grün", async () => {
    const dirsOf = tempData();
    // Abruf des Theaters fällt aus: Zustand „fehler“, seine Angebote bleiben aus dem Vorstand
    await runNightly({
      ...options(dirsOf, fakeExtractor().extractor),
      fetch: fakeFetch(["theater-beispiel"]),
      forceMigrate: ["theater-beispiel"],
    });
    const rawDir = join(dirsOf.dataDir, "raw");
    const theater = readRaw(rawDir, "theater-beispiel");
    expect(theater && providerStatus(theater).status).toBe("fehler");
    const before = readPreviousOffers(join(dirsOf.dataDir, "offers.json"));
    if (!before) throw new Error("offers.json fehlt");
    expect(before.offers.some((o) => o.providerId === "theater-beispiel")).toBe(true);
    // Rücknahme von Hand: Eintrag aus dem Katalog gelöscht (wie nach der Rücknahme eines Entdecken-Commits)
    const catalogFile = join(dirsOf.dataDir, "providers.yaml");
    const entries = parse(readFileSync(catalogFile, "utf8")) as Array<{ id: string }>;
    writeFileSync(catalogFile, stringify(entries.filter((p) => p.id !== "theater-beispiel")));
    const catalog = readCatalog(catalogFile);
    expect(validateDataset(catalog, before).ok).toBe(false);

    const r = await runBuildOnly({ dataDir: dirsOf.dataDir, today: TODAY, now: NOW, freeDays: async () => ({}) });
    expect(r.removed).toEqual(["theater-beispiel"]);
    expect(r.build.errors).toEqual([]);
    expect(r.build.written).toBe(join(dirsOf.dataDir, "offers.json"));
    expect(existsSync(join(rawDir, "theater-beispiel.json"))).toBe(false);
    const after = readPreviousOffers(join(dirsOf.dataDir, "offers.json"));
    if (!after) throw new Error("offers.json fehlt");
    expect(after.offers.some((o) => o.providerId === "theater-beispiel")).toBe(false);
    expect(after.horizon).toEqual({ from: TODAY, to: "2027-10-06" });
    expect(validateDataset(catalog, after).ok).toBe(true);
    // IDs der übrigen Angebote bleiben stabil (ADR 0022)
    const ids = (offers: ReadonlyArray<{ id: string; providerId: string }>) =>
      offers
        .filter((o) => o.providerId !== "theater-beispiel")
        .map((o) => o.id)
        .sort();
    expect(ids(after.offers)).toEqual(ids(before.offers));
    // kein Modell, keine Kostenzeile über die des Nachtlaufs hinaus
    expect(readFileSync(join(dirsOf.dataDir, "kosten.csv"), "utf8").trimEnd().split("\n")).toHaveLength(2);
  });
});

describe("runNightly: ID-Gate (ADR 0041; Plan 0049, Nachtrag 2, B)", () => {
  const only = ["familientreff-beispiel"];
  const PROVIDER = "familientreff-beispiel";
  const A = "https://example.org/familientreff/programm";
  const B = "https://example.org/familientreff/kurse";
  const UNIT_A = `seite:${A}`;
  const UNIT_B = `seite:${B}`;
  /** neue Fassung der Pipeline: anderer Prompt, also anderer Schlüssel und anderes `partsHash` */
  const NEW_PARTS = { ...KEY_PARTS, prompt: "Prompt 2" };
  /**
   * Die neue Fassung formuliert um: anderer Titel und eine Viertelstunde später. So greift keine Stufe der Zuordnung
   * (Stufe 1 braucht gleiche Termine, Stufe 2 einen ähnlichen Titel), und die IDs gingen ohne Gate verloren.
   */
  const renamed = treffs.map((e, k) => ({
    ...e,
    title: `Spielgruppe Zwerge ${k + 1}`,
    schedule: { ...e.schedule, start: `1${k + 1}:15`, end: `1${k + 1}:50` },
  }));
  const massage = RawEvent.parse({
    ...treff,
    title: "Babymassage",
    sourceUrl: B,
    schedule: { ...treff.schedule, weekdays: ["FR"], until: "2027-03-26" },
  });
  const massageNeu = RawEvent.parse({
    ...massage,
    title: "Sanfte Berührung 4",
    schedule: { ...massage.schedule, start: "15:00", end: "15:45" },
  });

  const call = (step: CallRecord["step"], providerId: string, tokens = 100): CallRecord => ({
    step,
    providerId,
    model: step === "judge" ? "opus" : "haiku",
    inputTokens: tokens,
    outputTokens: 10,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    webSearchRequests: 0,
    turns: 1,
    durationMs: 1,
    costUsd: 0.01,
    result: "ok",
  });
  /** Fake-Richter: urteilt je Eingabe über `answer`; merkt sich die Eingaben */
  function fakeJudge(answer: (input: JudgeInput) => JudgeResult["outcome"], tokens = 100) {
    const seen: JudgeInput[] = [];
    const judge: Judge = async (input) => {
      seen.push(input);
      return { outcome: answer(input), calls: [call("judge", input.providerId, tokens)] };
    };
    return { judge, seen };
  }
  const lastWord = (s: string) => s.split(" ").at(-1);
  /** `gleich` je verlorenem Angebot: das freie neue Event mit derselben Nummer am Titelende */
  const sameByNumber = (input: JudgeInput): JudgeResult["outcome"] => ({
    kind: "ok",
    verdicts: input.lost.map((l): Verdict => {
      const f = input.fresh.find((x) => lastWord(x.event.title) === lastWord(l.title) && !x.taken);
      return f?.starts[0]
        ? { id: l.id, kind: "gleich", index: f.index, start: f.starts[0] }
        : { id: l.id, kind: "unklar" };
    }),
  });
  const all =
    (kind: "fehlerhaft" | "entfallen" | "unklar") =>
    (input: JudgeInput): JudgeResult["outcome"] => ({
      kind: "ok",
      verdicts: input.lost.map(
        (l): Verdict => (kind === "unklar" ? { id: l.id, kind } : { id: l.id, kind, reason: `Grund ${l.title}` }),
      ),
    });

  /** Extraktor je Einheit; zählt Aufrufe */
  function unitExtractor(eventsOf: (unit: string) => RawEvent[]) {
    const seen: string[] = [];
    const extractor: Extractor = async (input) => {
      seen.push(input.unit ?? "");
      return {
        outcome: { kind: "ok", events: eventsOf(input.unit ?? ""), model: "haiku" },
        calls: [call("extract", input.provider.id)],
      };
    };
    return { extractor, seen };
  }

  type Dirs = ReturnType<typeof tempData>;
  const idsByTitle = (dirsOf: Dirs, file = join(dirsOf.dataDir, "offers.json")) =>
    Object.fromEntries(
      (readPreviousOffers(file)?.offers ?? []).filter((o) => o.providerId === PROVIDER).map((o) => [o.title, o.id]),
    );
  function rawUnit(dirsOf: Dirs, unit = UNIT_A, dir = join(dirsOf.dataDir, "raw")) {
    const r = readRaw(dir, PROVIDER);
    return r && isV2(r) ? r.units[unit] : undefined;
  }
  const byId = (ids: Record<string, string>) => Object.entries(ids).sort(([, a], [, b]) => a.localeCompare(b));
  const expectInherited = (dirsOf: Dirs, ids: Record<string, string>, file?: string) => {
    const now = idsByTitle(dirsOf, file);
    for (const k of [1, 2, 3]) expect(now[`Spielgruppe Zwerge ${k}`]).toBe(ids[`Offener Krabbeltreff ${k}`]);
  };

  function addPageB(dirsOf: Dirs) {
    const file = join(dirsOf.dataDir, "providers.yaml");
    const entries = parse(readFileSync(file, "utf8")) as Array<{ id: string; programme: object[] }>;
    entries.find((p) => p.id === PROVIDER)?.programme.push({ url: B, kind: "html", use: "termine" });
    writeFileSync(file, stringify(entries));
  }

  /** Nacht 0 mit der alten Fassung: Treffs, mit `withB` die Babymassage auf Seite B */
  async function baseline(withB = false) {
    const dirsOf = tempData();
    if (withB) addPageB(dirsOf);
    const { extractor } = unitExtractor((u) => (u === UNIT_B ? [massage] : treffs));
    const r = await runNightly({ ...options(dirsOf, extractor), only, forceMigrate: only });
    expect(r.build.errors).toEqual([]);
    const ids = idsByTitle(dirsOf);
    expect(Object.keys(ids).sort()).toEqual([...treffs.map((t) => t.title), ...(withB ? ["Babymassage"] : [])].sort());
    return { dirsOf, ids };
  }

  /** eine Nacht, Standard: neue Fassung, Seite A formuliert um, Seite B unverändert */
  async function gateNight(
    dirsOf: Dirs,
    o: {
      events?: (unit: string) => RawEvent[];
      judge?: Judge;
      text?: (url: string) => string;
      keyParts?: typeof KEY_PARTS;
      extra?: Partial<Parameters<typeof runNightly>[0]>;
    } = {},
  ) {
    const ex = unitExtractor(o.events ?? ((u) => (u === UNIT_B ? [massage] : renamed)));
    const r = await runNightly({
      ...options(dirsOf, ex.extractor),
      only,
      keyParts: o.keyParts ?? NEW_PARTS,
      ...(o.judge ? { judge: o.judge } : {}),
      ...(o.text ? { fetch: fakeFetch([], o.text) } : {}),
      ...o.extra,
    });
    return { r, seen: ex.seen };
  }

  it("ohne Richter wie vor dem Gate: die Umformulierung kostet die IDs (Gegenprobe, dass der Fall trägt)", async () => {
    const { dirsOf, ids } = await baseline();
    const { r } = await gateNight(dirsOf);
    expect(r.idGate).toBeUndefined();
    const now = idsByTitle(dirsOf);
    expect(Object.keys(now).sort()).toEqual(renamed.map((e) => e.title).sort());
    for (const id of Object.values(ids)) expect(Object.values(now)).not.toContain(id);
    expect(rawUnit(dirsOf)?.events.map((e) => e.title)).toEqual(renamed.map((e) => e.title));
  });

  it("Prompt-Wechsel benennt um, Richter gleich: gleiche IDs in offers.json, keepIds in data/raw, Bericht uebernommen", async () => {
    const { dirsOf, ids } = await baseline();
    const j = fakeJudge(sameByNumber);
    const { r } = await gateNight(dirsOf, { judge: j.judge });
    expect(j.seen.map((x) => x.unit)).toEqual([UNIT_A]);
    expect(j.seen[0]?.lost.map((l) => l.id).sort()).toEqual(Object.values(ids).sort());
    expect(j.seen[0]?.fresh.map((f) => f.taken)).toEqual([false, false, false]);
    expectInherited(dirsOf, ids);
    const unit = rawUnit(dirsOf);
    expect(unit?.held).toBeUndefined();
    expect(unit?.events.map((e) => Object.values(e.keepIds ?? {}))).toEqual(
      [1, 2, 3].map((k) => [ids[`Offener Krabbeltreff ${k}`]]),
    );
    expect(r.idGate).toEqual([
      {
        provider: PROVIDER,
        unit: UNIT_A,
        outcome: "uebernommen",
        ids: byId(ids).map(([title, id]) => ({ id, title, kind: "gleich" })),
      },
    ]);
    expect(r.calls.filter((c) => c.step === "judge")).toHaveLength(1);
    const report = JSON.parse(readFileSync(join(dirsOf.runDir, "nightly.json"), "utf8"));
    expect(report.idGate).toEqual(r.idGate);
    // --build-only ist deterministisch: keepIds stehen in data/raw
    const now = idsByTitle(dirsOf);
    await runBuildOnly({ dataDir: dirsOf.dataDir, today: TODAY, now: NOW, freeDays: async () => ({}) });
    expect(idsByTitle(dirsOf)).toEqual(now);
    // die nächste Nacht mit derselben Fassung und Seite: unverändert, kein Richter, IDs bleiben
    const j2 = fakeJudge(all("unklar"));
    const again = await gateNight(dirsOf, { judge: j2.judge });
    expect(again.seen).toEqual([]);
    expect(j2.seen).toEqual([]);
    expect(idsByTitle(dirsOf)).toEqual(now);
  });

  it.each(["fehlerhaft", "entfallen"] as const)("Richter %s: IDs fallen weg, Grund im Bericht", async (kind) => {
    const { dirsOf, ids } = await baseline();
    const { r } = await gateNight(dirsOf, { judge: fakeJudge(all(kind)).judge });
    const now = idsByTitle(dirsOf);
    expect(Object.keys(now).sort()).toEqual(renamed.map((e) => e.title).sort());
    for (const id of Object.values(ids)) expect(Object.values(now)).not.toContain(id);
    expect(r.idGate?.[0]).toMatchObject({ outcome: "uebernommen", unit: UNIT_A });
    expect(r.idGate?.[0]?.ids.map((x) => [x.id, x.kind, x.reason])).toEqual(
      byId(ids).map(([title, id]) => [id, kind, `Grund ${title}`]),
    );
    expect(rawUnit(dirsOf)?.events.some((e) => e.keepIds)).toBe(false);
  });

  it("Richter unklar: Einheit gehalten, IDs bleiben, Wächter ids; zweite Nacht gleiche Eingabe ohne Extraktion und Richter", async () => {
    const { dirsOf, ids } = await baseline();
    const before = rawUnit(dirsOf);
    const { r } = await gateNight(dirsOf, { judge: fakeJudge(all("unklar")).judge });
    expect(idsByTitle(dirsOf)).toEqual(ids);
    const held = rawUnit(dirsOf);
    expect(held?.events).toEqual(before?.events);
    expect(held?.inputHash).toBe(before?.inputHash);
    expect(held?.partsHash).toBe(before?.partsHash);
    expect(held?.held).toMatchObject({ reason: "unklar", since: NOW(), model: "haiku" });
    expect(held?.held?.events.map((e) => e.title)).toEqual(renamed.map((e) => e.title));
    expect([...(held?.held?.lost ?? [])].sort()).toEqual(Object.values(ids).sort());
    expect(r.units?.[PROVIDER]?.[UNIT_A]).toBe("gehalten");
    expect(r.idGate).toEqual([expect.objectContaining({ outcome: "gehalten", held: "unklar", unit: UNIT_A })]);
    const findings = watchFindings({
      raws: readRawDir(join(dirsOf.dataDir, "raw")),
      catalog: readCatalog(join(dirsOf.dataDir, "providers.yaml")),
      discover: [],
      today: TODAY,
    }).filter((f) => f.subject === PROVIDER);
    expect(findings.map((f) => f.kind)).toContain("ids");

    const j2 = fakeJudge(all("unklar"));
    const second = await gateNight(dirsOf, { judge: j2.judge });
    expect(second.seen).toEqual([]);
    expect(j2.seen).toEqual([]);
    expect(second.r.units?.[PROVIDER]?.[UNIT_A]).toBe("gehalten");
    expect(second.r.idGate).toBeUndefined();
    expect(idsByTitle(dirsOf)).toEqual(ids);
    expect(rawUnit(dirsOf)?.held?.since).toBe(NOW());
  });

  it("gehalten, am nächsten Tag ändert sich eine Zeile der Seite: neu extrahiert, wieder gerichtet, IDs bleiben (Review N2, B1)", async () => {
    const { dirsOf, ids } = await baseline();
    await gateNight(dirsOf, { judge: fakeJudge(all("unklar")).judge });
    const j = fakeJudge(all("unklar"));
    const n2 = await gateNight(dirsOf, {
      judge: j.judge,
      text: (url) => `Programm ${url} (noch 2 Plätze frei)`,
      extra: { today: "2026-10-07", now: () => "2026-10-07T03:00:00+02:00" },
    });
    expect(n2.seen).toEqual([UNIT_A]);
    expect(j.seen).toHaveLength(1);
    expect(idsByTitle(dirsOf)).toEqual(ids);
    const unit = rawUnit(dirsOf);
    expect(unit?.events.map((e) => e.title)).toEqual(treffs.map((e) => e.title));
    // `since` bleibt der Beginn des Haltens; der neue Schlüssel steht in `held`
    expect(unit?.held?.since).toBe(NOW());
    expect(unit?.held?.inputHash).not.toBe(unit?.inputHash);
    // mit gleich am dritten Tag: übernommen, die IDs wandern mit
    await gateNight(dirsOf, {
      judge: fakeJudge(sameByNumber).judge,
      text: (url) => `Programm ${url} (noch 1 Platz frei)`,
      extra: { today: "2026-10-08", now: () => "2026-10-08T03:00:00+02:00" },
    });
    expectInherited(dirsOf, ids);
    expect(rawUnit(dirsOf)?.held).toBeUndefined();
  });

  it.each([
    ["fehler", (): JudgeResult["outcome"] => ({ kind: "fehler", reason: "Richter kaputt" })],
    ["abort", (): JudgeResult["outcome"] => ({ kind: "abort", abort: "limit" })],
  ] as const)(
    "Richter liefert %s: gehalten mit grenze; nächste Nacht ohne Extraktion erneut gerichtet",
    async (_, outcome) => {
      const { dirsOf, ids } = await baseline();
      const { r } = await gateNight(dirsOf, { judge: fakeJudge(outcome).judge });
      expect(idsByTitle(dirsOf)).toEqual(ids);
      expect(rawUnit(dirsOf)?.held?.reason).toBe("grenze");
      expect(r.idGate).toEqual([expect.objectContaining({ outcome: "gehalten", held: "grenze" })]);
      const j = fakeJudge(sameByNumber);
      const n2 = await gateNight(dirsOf, { judge: j.judge });
      expect(n2.seen).toEqual([]);
      expect(j.seen).toHaveLength(1);
      expect(n2.r.units?.[PROVIDER]?.[UNIT_A]).toBe("gehalten-uebernommen");
      expectInherited(dirsOf, ids);
      expect(rawUnit(dirsOf)?.held).toBeUndefined();
    },
  );

  it("Richter wirft: gehalten mit grenze, der Lauf baut trotzdem", async () => {
    const { dirsOf, ids } = await baseline();
    const judge: Judge = async () => {
      throw new Error("CLI nicht gefunden");
    };
    const { r } = await gateNight(dirsOf, { judge });
    expect(r.build.errors).toEqual([]);
    expect(idsByTitle(dirsOf)).toEqual(ids);
    expect(rawUnit(dirsOf)?.held?.reason).toBe("grenze");
    expect(r.idGate?.[0]).toMatchObject({ outcome: "gehalten", held: "grenze" });
    expect(r.idGate?.[0]?.note).toContain("CLI nicht gefunden");
  });

  it("Grenze des Richters (JUDGE_BRAKES) erreicht: die nächste Einheit wird ohne Aufruf gehalten", async () => {
    const { dirsOf, ids } = await baseline(true);
    // der erste Aufruf (Einheiten nach Kennung: erst Seite B) verbraucht das ganze Token-Budget des Richters
    const j = fakeJudge(sameByNumber, JUDGE_BRAKES.maxTokens * 10);
    const { r } = await gateNight(dirsOf, { judge: j.judge, events: (u) => (u === UNIT_B ? [massageNeu] : renamed) });
    expect(j.seen.map((x) => x.unit)).toEqual([UNIT_B]);
    // Babymassage → „Sanfte Berührung 4“: anderer Titel, keine Nummer → unklar; Seite A ohne Aufruf: grenze
    const now = idsByTitle(dirsOf);
    expect(now).toEqual(ids);
    expect(rawUnit(dirsOf, UNIT_A)?.held?.reason).toBe("grenze");
    expect(rawUnit(dirsOf, UNIT_B)?.held?.reason).toBe("unklar");
    expect(r.idGate?.map((e) => [e.unit, e.outcome, e.held])).toEqual([
      [UNIT_B, "gehalten", "unklar"],
      [UNIT_A, "gehalten", "grenze"],
    ]);
    expect(r.calls.filter((c) => c.step === "judge")).toHaveLength(1);
    // die Grenze des Richters ist nicht die Bremse des Nachtlaufs
    expect(r.brake).toBeUndefined();
  });

  it("Hinnehmen (accepted): gehaltenes Ergebnis ohne Richter übernommen, Bericht hingenommen", async () => {
    const { dirsOf, ids } = await baseline();
    await gateNight(dirsOf, { judge: fakeJudge(all("unklar")).judge });
    const j = fakeJudge(all("unklar"));
    const asked: Array<[string, string]> = [];
    const { r, seen } = await gateNight(dirsOf, {
      judge: j.judge,
      extra: {
        accepted: (p, since) => {
          asked.push([p, since]);
          return { grund: "Umformulierung geprüft" };
        },
      },
    });
    expect(seen).toEqual([]);
    expect(j.seen).toEqual([]);
    expect(asked[0]).toEqual([PROVIDER, NOW()]);
    const now = idsByTitle(dirsOf);
    expect(Object.keys(now).sort()).toEqual(renamed.map((e) => e.title).sort());
    for (const id of Object.values(ids)) expect(Object.values(now)).not.toContain(id);
    expect(r.idGate).toEqual([
      expect.objectContaining({ outcome: "hingenommen", unit: UNIT_A, note: "Umformulierung geprüft" }),
    ]);
    expect(r.idGate?.[0]?.ids.map((x) => x.id)).toEqual(byId(ids).map(([, id]) => id));
    expect(rawUnit(dirsOf)?.held).toBeUndefined();
  });

  it("Hinnehmen deckt nur die hingenommenen Verluste: kostet die neue Extraktion einer geänderten Seite mehr, wird gerichtet", async () => {
    const { dirsOf, ids } = await baseline();
    // neue Fassung: Treff 3 bleibt, 1 und 2 werden umformuliert → unklar, gehalten mit lost = [1, 2]
    const partly = [renamed[0], renamed[1], treffs[2]].flatMap((e) => (e ? [e] : []));
    await gateNight(dirsOf, { judge: fakeJudge(all("unklar")).judge, events: () => partly });
    expect([...(rawUnit(dirsOf)?.held?.lost ?? [])].sort()).toEqual(
      [ids["Offener Krabbeltreff 1"], ids["Offener Krabbeltreff 2"]].sort(),
    );
    // der Mensch nimmt hin; zugleich ändert sich die Seite, und die neue Extraktion formuliert auch Treff 3 um
    const j = fakeJudge(all("unklar"));
    const { r } = await gateNight(dirsOf, {
      judge: j.judge,
      text: (url) => `Programm ${url} neu`,
      extra: { accepted: () => ({ grund: "1 und 2 geprüft" }) },
    });
    // Treff 3 hat niemand hingenommen: Er geht vor den Richter, und der sagt unklar
    expect(j.seen).toHaveLength(1);
    expect(idsByTitle(dirsOf)["Offener Krabbeltreff 3"]).toBe(ids["Offener Krabbeltreff 3"]);
    expect(r.idGate?.[0]).toMatchObject({ outcome: "gehalten", held: "unklar" });
  });

  it("Halten einer Einheit kostet keine ID, die in (a) eine andere gated Einheit hielt (Nachprüfung nach dem Urteil)", async () => {
    const { dirsOf, ids } = await baseline(true);
    // neue Fassung: Seite A formuliert um und nennt jetzt auch die Babymassage; Seite B nennt stattdessen ein Elterncafé
    const cafe = RawEvent.parse({
      ...massage,
      title: "Elterncafé",
      schedule: { ...massage.schedule, weekdays: ["TU"] },
    });
    const j = fakeJudge(all("unklar"));
    const { r } = await gateNight(dirsOf, {
      judge: j.judge,
      events: (u) => (u === UNIT_B ? [cafe] : [...renamed, massage]),
    });
    // gerichtet wird nur A (B verliert in (a) nichts: A hält die ID der Babymassage); A wird gehalten
    expect(j.seen.map((x) => x.unit)).toEqual([UNIT_A]);
    expect(rawUnit(dirsOf, UNIT_A)?.held?.reason).toBe("unklar");
    // mit A im alten Stand fehlte die Babymassage, wenn B übernommen würde: B muss mit gehalten werden
    const now = idsByTitle(dirsOf);
    for (const [title, id] of Object.entries(ids)) expect(now[title]).toBe(id);
    expect(rawUnit(dirsOf, UNIT_B)?.held).toMatchObject({ reason: "grenze", lost: [ids["Babymassage"]] });
    expect(r.idGate?.find((e) => e.unit === UNIT_B)).toMatchObject({ outcome: "gehalten", held: "grenze" });
    expect(r.units?.[PROVIDER]?.[UNIT_B]).toBe("gehalten");
    // nächste Nacht: B wird ohne Extraktion vorgelegt; A bleibt gehalten, also fehlt die Babymassage und B wird gerichtet
    const j2 = fakeJudge(all("unklar"));
    const n2 = await gateNight(dirsOf, {
      judge: j2.judge,
      events: (u) => (u === UNIT_B ? [cafe] : [...renamed, massage]),
    });
    expect(n2.seen).toEqual([]);
    expect(j2.seen.map((x) => [x.unit, x.lost.map((l) => l.id)])).toEqual([[UNIT_B, [ids["Babymassage"]]]]);
    expect(idsByTitle(dirsOf)).toEqual(ids);
  });

  it("scheitert ein Erbe im Build (zwei Erben treffen in einem Angebot zusammen), wird die Einheit gehalten", async () => {
    const { dirsOf, ids } = await baseline();
    // neue Fassung: Treffs 1 und 2 heißen gleich und werden im Build ein regelmäßiges Angebot (Termine vereinigt)
    const twins = [0, 1].map((k) => ({ ...renamed[k], title: "Spielgruppe Zwerge" }) as RawEvent);
    const fresh = [...twins, treffs[2] as RawEvent];
    const j = fakeJudge((input) => ({
      kind: "ok",
      // je für sich plausibel: Treff 1 → Event 0, Treff 2 → Event 1
      verdicts: input.lost.map((l): Verdict => {
        const f = input.fresh[Number(lastWord(l.title)) - 1];
        return f?.starts[0]
          ? { id: l.id, kind: "gleich", index: f.index, start: f.starts[0] }
          : { id: l.id, kind: "unklar" };
      }),
    }));
    const { r } = await gateNight(dirsOf, { judge: j.judge, events: () => fresh });
    expect(j.seen[0]?.lost.map((l) => l.title).sort()).toEqual(["Offener Krabbeltreff 1", "Offener Krabbeltreff 2"]);
    // ohne Nachprüfung gingen beide IDs verloren („ID-Erbe … treffen zusammen – keins gilt“)
    expect(idsByTitle(dirsOf)).toEqual(ids);
    expect(rawUnit(dirsOf)?.held?.reason).toBe("grenze");
    expect(r.idGate).toEqual([expect.objectContaining({ unit: UNIT_A, outcome: "gehalten", held: "grenze" })]);
    expect(r.idGate?.[0]?.note).toMatch(/^Nachprüfung/);
  });

  it("Einzeltermine: je Termin ein Angebot, je Termin ein Urteil gleich@Beginn, jede ID bleibt", async () => {
    const dirsOf = tempData();
    const concert = (title: string, at: string) =>
      RawEvent.parse({
        ...treff,
        title,
        format: "einmalig",
        registration: "mit-anmeldung",
        schedule: {
          kind: "dates",
          dates: ["2026-10-10", "2026-10-17", "2026-10-24"].map((d) => ({ start: `${d}T${at}`, end: `${d}T11:30` })),
        },
      });
    const old = concert("Konzert für Babys", "10:00");
    await runNightly({
      ...options(dirsOf, unitExtractor(() => [old]).extractor),
      only,
      forceMigrate: only,
    });
    const before = (readPreviousOffers(join(dirsOf.dataDir, "offers.json"))?.offers ?? []).filter(
      (o) => o.providerId === PROVIDER,
    );
    expect(before).toHaveLength(3);
    const j = fakeJudge((input) => ({
      kind: "ok",
      // je verlorenem Termin der neue Beginn am selben Tag
      verdicts: input.lost.map((l): Verdict => {
        const day = l.starts[0]?.slice(0, 10);
        const start = input.fresh[0]?.starts.find((s) => s.slice(0, 10) === day);
        return start ? { id: l.id, kind: "gleich", index: 0, start } : { id: l.id, kind: "unklar" };
      }),
    }));
    const { r } = await gateNight(dirsOf, { judge: j.judge, events: () => [concert("Musik im Kinderwagen", "10:30")] });
    expect(j.seen[0]?.lost).toHaveLength(3);
    expect(j.seen[0]?.fresh[0]?.starts).toHaveLength(3);
    expect(r.idGate?.[0]?.outcome).toBe("uebernommen");
    const after = (readPreviousOffers(join(dirsOf.dataDir, "offers.json"))?.offers ?? []).filter(
      (o) => o.providerId === PROVIDER,
    );
    const dayToId = (offers: typeof after) =>
      Object.fromEntries(offers.map((o) => [o.sessions[0]?.start.slice(0, 10), o.id]));
    expect(after.every((o) => o.title === "Musik im Kinderwagen")).toBe(true);
    expect(dayToId(after)).toEqual(dayToId(before));
  });

  /**
   * Verlust über eine Einheit ohne neue Fassung: Nacht 0 mit Babymassage auf A und Treffs auf B; danach gilt B als
   * andere Fassung (Vorstand ohne partsHash), A bleibt in seiner. Beide Seiten ändern sich: A formuliert die Massage um
   * (gleiche Termine), B nennt zusätzlich ein Angebot mit denselben Terminen. In (b) erbt As Massage die ID über
   * Stufe 1 (gleiche Termine); in (a) passen zwei Entwürfe gleich gut, keiner bekommt sie. Ursprung in (b) ist A.
   */
  async function crossNight(treffsB: readonly RawEvent[]) {
    const dirsOf = tempData();
    addPageB(dirsOf);
    await runNightly({
      ...options(dirsOf, unitExtractor((u) => (u === UNIT_A ? [massage] : treffs)).extractor),
      only,
      forceMigrate: only,
    });
    const ids = idsByTitle(dirsOf);
    expect(ids["Babymassage"]).toBeDefined();
    const rawFile = join(dirsOf.dataDir, "raw", `${PROVIDER}.json`);
    const stored = JSON.parse(readFileSync(rawFile, "utf8"));
    delete stored.units[UNIT_B].partsHash;
    writeFileSync(rawFile, JSON.stringify(stored));
    const massageA = RawEvent.parse({ ...massage, title: "Sanfte Berührung für Babys" });
    const rundeB = RawEvent.parse({ ...massage, title: "Kinderwagen-Runde" });
    const j = fakeJudge(sameByNumber);
    const { r } = await gateNight(dirsOf, {
      judge: j.judge,
      keyParts: KEY_PARTS,
      text: (url) => `Programm ${url} geändert`,
      events: (u) => (u === UNIT_A ? [massageA] : [...treffsB, rundeB]),
    });
    return { dirsOf, ids, r, j };
  }

  it("Verlust mit Ursprung in einer nicht gated Einheit: die gated Einheit wird ohne Richter gehalten (crossUnit), ID bleibt", async () => {
    const { dirsOf, ids, r, j } = await crossNight(treffs);
    expect(j.seen).toEqual([]);
    expect(rawUnit(dirsOf, UNIT_B)?.held).toMatchObject({ reason: "unklar", lost: [ids["Babymassage"]] });
    expect(rawUnit(dirsOf, UNIT_A)?.held).toBeUndefined();
    expect(rawUnit(dirsOf, UNIT_A)?.events.map((e) => e.title)).toEqual(["Sanfte Berührung für Babys"]);
    expect(r.idGate).toEqual([
      expect.objectContaining({
        unit: UNIT_B,
        outcome: "gehalten",
        held: "unklar",
        note: expect.stringMatching(/^Verlust über eine Einheit ohne neue Fassung/),
      }),
    ]);
    const now = idsByTitle(dirsOf);
    expect(now["Sanfte Berührung für Babys"]).toBe(ids["Babymassage"]);
    for (const t of treffs) expect(now[t.title]).toBe(ids[t.title]);
    expect(now["Kinderwagen-Runde"]).toBeUndefined();
  });

  it("Stand (b) scheitert an einem Datenfehler eines nicht gated Anbieters: gated Einheiten gehalten (grenze), offers.json bleibt", async () => {
    const { dirsOf, ids } = await baseline();
    // Musikschule (nicht in diesem Lauf, also nicht gated): zwei regelmäßige Events gleichen Titels und Orts mit
    // anderen Merkmalen; der Build meldet das als Fehler
    const ms = "musikschule-beispiel";
    const garden = (cost: "kostenlos" | "kostenpflichtig") =>
      RawEvent.parse({
        ...treff,
        providerId: ms,
        venueId: "musikschule-beispiel-sued",
        title: "Musikgarten",
        cost,
        sourceUrl: "https://example.org/musikschule/kurse",
      });
    const unitState = {
      events: [garden("kostenlos"), garden("kostenpflichtig")],
      inputHash: "h-ms",
      model: "haiku",
      status: "ok",
      checkedAt: NOW(),
      changedAt: NOW(),
    };
    writeFileSync(
      join(dirsOf.dataDir, "raw", `${ms}.json`),
      JSON.stringify({ version: 2, units: { "seite:https://example.org/musikschule/kurse": unitState } }),
    );
    const offersBefore = readFileSync(join(dirsOf.dataDir, "offers.json"), "utf8");
    const j = fakeJudge(sameByNumber);
    const { r } = await gateNight(dirsOf, { judge: j.judge });
    expect(r.build.errors.join("\n")).toMatch(/Musikgarten/);
    expect(r.build.written).toBeUndefined();
    expect(readFileSync(join(dirsOf.dataDir, "offers.json"), "utf8")).toBe(offersBefore);
    expect(j.seen).toEqual([]);
    expect(rawUnit(dirsOf)?.held?.reason).toBe("grenze");
    expect(rawUnit(dirsOf)?.events.map((e) => e.title)).toEqual(treffs.map((e) => e.title));
    expect(r.idGate).toEqual([
      expect.objectContaining({
        unit: UNIT_A,
        outcome: "gehalten",
        held: "grenze",
        note: expect.stringMatching(/^Vergleichsstand \(b\) gescheitert/),
      }),
    ]);
    // nach der Korrektur des Datenfehlers: das gehaltene Ergebnis wird ohne Extraktion gerichtet, IDs wandern mit
    writeFileSync(
      join(dirsOf.dataDir, "raw", `${ms}.json`),
      JSON.stringify({
        version: 2,
        units: { "seite:https://example.org/musikschule/kurse": { ...unitState, events: [garden("kostenlos")] } },
      }),
    );
    const j2 = fakeJudge(sameByNumber);
    const n2 = await gateNight(dirsOf, { judge: j2.judge });
    expect(n2.seen).toEqual([]);
    expect(j2.seen).toHaveLength(1);
    expect(n2.r.build.errors).toEqual([]);
    expectInherited(dirsOf, ids);
  });

  it("ein Richter ohne Urteil zu einer verlorenen ID übernimmt nicht (fehlendes Urteil = unklar)", async () => {
    const { dirsOf, ids } = await baseline();
    const { r } = await gateNight(dirsOf, { judge: fakeJudge(() => ({ kind: "ok", verdicts: [] })).judge });
    expect(idsByTitle(dirsOf)).toEqual(ids);
    expect(rawUnit(dirsOf)?.held?.reason).toBe("unklar");
    expect(r.idGate?.[0]?.ids.every((x) => x.kind === "unklar" && x.reason === "kein Urteil")).toBe(true);
  });

  it("neue Einheit (zusätzliche Programmseite): nicht gated, die übrige Einheit mit geändertem Auszug schon", async () => {
    const { dirsOf, ids } = await baseline();
    addPageB(dirsOf);
    const j = fakeJudge(all("unklar"));
    // alte Fassung von Prompt, Schema und Modell: Nur der Auszug ändert sich (Anhängen durch den Seitenfinder)
    const { r, seen } = await gateNight(dirsOf, { judge: j.judge, keyParts: KEY_PARTS });
    expect([...seen].sort()).toEqual([UNIT_A, UNIT_B].sort());
    expect(j.seen.map((x) => x.unit)).toEqual([UNIT_A]);
    const now = idsByTitle(dirsOf);
    expect(now["Babymassage"]).toBeDefined();
    for (const t of treffs) expect(now[t.title]).toBe(ids[t.title]);
    expect(rawUnit(dirsOf, UNIT_B)?.held).toBeUndefined();
    expect(rawUnit(dirsOf, UNIT_B)?.events.map((e) => e.title)).toEqual(["Babymassage"]);
    expect(rawUnit(dirsOf, UNIT_A)?.held?.reason).toBe("unklar");
    expect(r.idGate?.map((e) => e.unit)).toEqual([UNIT_A]);
  });

  it("Trockenlauf: Gate schreibt ins Overlay, data/raw und data/offers.json bleiben", async () => {
    const { dirsOf, ids } = await baseline();
    const rawFile = join(dirsOf.dataDir, "raw", `${PROVIDER}.json`);
    const rawBefore = readFileSync(rawFile, "utf8");
    const offersBefore = readFileSync(join(dirsOf.dataDir, "offers.json"), "utf8");
    const { r } = await gateNight(dirsOf, { judge: fakeJudge(sameByNumber).judge, extra: { dryRun: true } });
    expect(readFileSync(rawFile, "utf8")).toBe(rawBefore);
    expect(readFileSync(join(dirsOf.dataDir, "offers.json"), "utf8")).toBe(offersBefore);
    expect(r.idGate?.[0]?.outcome).toBe("uebernommen");
    expectInherited(dirsOf, ids, join(dirsOf.runDir, "offers.json"));
    expect(rawUnit(dirsOf, UNIT_A, join(dirsOf.runDir, "raw"))?.events.every((e) => e.keepIds)).toBe(true);
  });

  it("Trockenlauf mit unklar: Overlay hält die Einheit, IDs im Trockenergebnis bleiben", async () => {
    const { dirsOf, ids } = await baseline();
    await gateNight(dirsOf, { judge: fakeJudge(all("unklar")).judge, extra: { dryRun: true } });
    expect(idsByTitle(dirsOf, join(dirsOf.runDir, "offers.json"))).toEqual(ids);
    expect(rawUnit(dirsOf, UNIT_A, join(dirsOf.runDir, "raw"))?.held?.reason).toBe("unklar");
    expect(rawUnit(dirsOf)?.held).toBeUndefined();
  });

  it("erste Nacht nach dem Deploy: Vorstand ohne partsHash, Seite unverändert → kein Aufruf, partsHash nachgetragen", async () => {
    const { dirsOf, ids } = await baseline();
    const rawFile = join(dirsOf.dataDir, "raw", `${PROVIDER}.json`);
    const raw = JSON.parse(readFileSync(rawFile, "utf8"));
    const parts = raw.units[UNIT_A].partsHash;
    expect(parts).toBeDefined();
    delete raw.units[UNIT_A].partsHash;
    writeFileSync(rawFile, JSON.stringify(raw));
    const j = fakeJudge(all("unklar"));
    const { r, seen } = await gateNight(dirsOf, { judge: j.judge, keyParts: KEY_PARTS });
    expect(seen).toEqual([]);
    expect(j.seen).toEqual([]);
    expect(r.idGate).toBeUndefined();
    expect(rawUnit(dirsOf)?.partsHash).toBe(parts);
    expect(idsByTitle(dirsOf)).toEqual(ids);
  });

  it("erste Nacht nach dem Deploy, Seite geändert: fehlendes partsHash zählt als andere Fassung (gerichtet)", async () => {
    const { dirsOf, ids } = await baseline();
    const rawFile = join(dirsOf.dataDir, "raw", `${PROVIDER}.json`);
    const raw = JSON.parse(readFileSync(rawFile, "utf8"));
    delete raw.units[UNIT_A].partsHash;
    writeFileSync(rawFile, JSON.stringify(raw));
    const j = fakeJudge(all("unklar"));
    await gateNight(dirsOf, { judge: j.judge, keyParts: KEY_PARTS, text: (url) => `Programm ${url} neu` });
    expect(j.seen).toHaveLength(1);
    expect(idsByTitle(dirsOf)).toEqual(ids);
  });

  it("gleiche Fassung, Seite geändert: kein Gate, Verluste wie bisher erlaubt (ADR 0022)", async () => {
    const { dirsOf } = await baseline();
    const j = fakeJudge(all("unklar"));
    const { r } = await gateNight(dirsOf, {
      judge: j.judge,
      keyParts: KEY_PARTS,
      text: (url) => `Programm ${url} neu`,
    });
    expect(j.seen).toEqual([]);
    expect(r.idGate).toBeUndefined();
    expect(Object.keys(idsByTitle(dirsOf)).sort()).toEqual(renamed.map((e) => e.title).sort());
  });
});
