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
import type { ExtractOutcome, Extractor, ExtractResult } from "../lib/extract.ts";
import type { PageOutcome } from "../lib/fetch.ts";
import { isV2, type ProviderRaw, providerStatus, RawEvent } from "../lib/raw.ts";
import type { FetchPlan } from "../lib/select.ts";
import { type FetchResult, unitInputs } from "./fetch-inputs.ts";
import { readCatalog, readPreviousOffers, readRaw } from "./files.ts";
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

  it("Bremse MAX_TOKENS zählt Tokens ein und aus", async () => {
    const dirsOf = tempData();
    const { extractor, seen } = fakeExtractor();
    const r = await runNightly({ ...options(dirsOf, extractor), brakes: { maxCalls: 100, maxTokens: 110 } });
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
