import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { DISCOVER_BRAKES } from "../lib/cost.ts";
import { DiscoverState } from "../lib/discover-state.ts";
import type { CallRecord, Extractor } from "../lib/extract.ts";
import { RawEvent } from "../lib/raw.ts";
import type { FetchPlan } from "../lib/select.ts";
import { type DiscoverDeps, type DiscoverOptions, runDiscover, type StepReply } from "./discover.ts";
import { GateError } from "./discover-git.ts";
import type { FetchResult } from "./fetch-inputs.ts";

const FIXTURES = new URL("../../../tests/fixtures/", import.meta.url);
const TODAY = "2026-10-11";
const NOW = "2026-10-11T06:00:00+02:00";
const KEY_PARTS = { prompt: "Prompt", schema: "{}", model: "haiku" };
const SITE = "https://krabbelzwerge.example.net/";
const KURSE = "https://krabbelzwerge.example.net/kurse";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempData() {
  const root = mkdtempSync(join(tmpdir(), "zp-discover-"));
  dirs.push(root);
  const dataDir = join(root, "data");
  mkdirSync(dataDir);
  copyFileSync(new URL("providers.yaml", FIXTURES), join(dataDir, "providers.yaml"));
  return { dataDir, runDir: join(root, "runs", TODAY, "discover") };
}

const call = (step: CallRecord["step"], id: string, result: CallRecord["result"] = "ok"): CallRecord => ({
  step,
  providerId: id,
  model: "haiku",
  inputTokens: 100,
  outputTokens: 10,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  webSearchRequests: step === "search" ? 2 : 0,
  turns: 2,
  durationMs: 5,
  costUsd: 0.01,
  result,
});

const page = (url: string, body: string) => ({ status: 200, finalUrl: url, contentType: "text/html", body });
const HOME = `<html><body><h1>Krabbelzwerge</h1><p>Krabbelgruppe für Babys und Kleinkinder</p><a href="${KURSE}">Kurse</a></body></html>`;

const assessOk = (name: string, address = "Kernstraße 3, 90429 Nürnberg") => ({
  entscheidung: "aufnehmen",
  grund: "Krabbelgruppe mit Terminen",
  eintrag: {
    name,
    url: SITE,
    programme: [{ url: KURSE, kind: "html", use: "termine" }],
    venues: [{ name: `${name} Raum`, address }],
    availability: "unbekannt",
  },
});

/** Abruf des Ertragsbeweises ohne Netz: jede Programmseite liefert einen Text mit Babybezug */
const fakeFetchInputs = async (plan: FetchPlan): Promise<FetchResult> => {
  const out: FetchResult = { providers: {}, texts: {}, adapters: {}, inputs: {} };
  for (const p of plan.providers) {
    const pages = p.pages.map((t) => ({ url: t.url, text: "Krabbelgruppe mittwochs für Babys" }));
    out.inputs[p.id] = {
      via: p.via,
      adapterIssues: {},
      status: "ok",
      pages,
      candidates: [],
      text: "## Seite 1\nKrabbelgruppe mittwochs für Babys",
      allowedUrls: pages.map((pg) => pg.url),
    };
  }
  return out;
};

/** Fake-Extraktor: ein regelmäßiger Treff am ersten Ort des Eintrags, ohne Events für `leer` */
function fakeExtractor(empty: readonly string[] = []): Extractor {
  return async (input) => ({
    outcome: {
      kind: "ok",
      model: "haiku",
      events: empty.includes(input.provider.id)
        ? []
        : [
            RawEvent.parse({
              providerId: input.provider.id,
              venueId: input.provider.role === "anbieter" ? input.provider.venues[0]?.id : "",
              title: "Krabbelgruppe",
              summary: "Spielen für Babys.",
              topics: ["krabbelgruppe"],
              format: "regelmaessig",
              registration: "ohne-anmeldung",
              cost: "kostenlos",
              url: KURSE,
              sourceUrl: KURSE,
              availability: { status: "ohne-anmeldung" },
              schedule: {
                kind: "weekly",
                weekdays: ["WE"],
                start: "10:00",
                end: "11:30",
                from: "2026-10-14",
                until: "2026-12-16",
                skipHolidays: false,
              },
            }),
          ],
    },
    calls: [call("extract", input.provider.id)],
  });
}

interface Fakes {
  search?: Record<string, unknown>;
  assess?: Record<string, unknown>;
  searchAbort?: "auth";
  geocode?: DiscoverDeps["geocode"];
  empty?: string[];
}

function deps(f: Fakes): DiscoverDeps {
  return {
    search: async (term): Promise<StepReply> =>
      f.searchAbort
        ? { output: null, call: call("search", `suche:${term}`, "abort"), abort: f.searchAbort }
        : { output: f.search?.[term] ?? { kandidaten: [] }, call: call("search", `suche:${term}`), abort: null },
    assess: async (find): Promise<StepReply> => ({
      output: f.assess?.[find.url] ?? { entscheidung: "verwerfen", grund: "unbekannt" },
      call: call("assess", find.url),
      abort: null,
    }),
    fetchPage: async (url) => page(url, HOME),
    geocode: f.geocode ?? (async () => ({ lat: 49.449, lon: 11.06, display: "x", district: "Gostenhof" })),
    extractor: fakeExtractor(f.empty),
    fetchInputs: fakeFetchInputs,
    aggregatorCandidates: async () => [],
    freeDays: async () => ({}),
  };
}

const run = (d: ReturnType<typeof tempData>, f: Fakes, over: Partial<DiscoverOptions> = {}) =>
  runDiscover({
    ...d,
    regions: ["nuernberg"],
    today: TODAY,
    now: () => NOW,
    dryRun: true,
    maxNew: 10,
    terms: ["Krabbelgruppe"],
    brakes: DISCOVER_BRAKES,
    budgetMin: 90,
    keyParts: KEY_PARTS,
    deps: deps(f),
    ...over,
  });

const kandidaten = (...list: Array<{ name: string; url: string }>) => ({
  Krabbelgruppe: { kandidaten: list.map((k) => ({ ...k, warum: "0–3" })) },
});

describe("runDiscover (Plan 0032, E7)", () => {
  it("Trockenlauf: würde aufnehmen, verwirft mit Grund, schreibt nichts nach data/", async () => {
    const d = tempData();
    const before = readFileSync(join(d.dataDir, "providers.yaml"), "utf8");
    const r = await run(d, {
      search: kandidaten(
        { name: "Krabbelzwerge Gostenhof", url: SITE },
        { name: "Yoga Studio", url: "https://yoga.example.net/" },
        { name: "Familientreff", url: "https://example.org/familientreff/programm" },
      ),
      assess: { [SITE]: assessOk("Krabbelzwerge Gostenhof") },
    });
    const reg = r.regions[0];
    expect(reg?.adopted.map((a) => a.id)).toEqual(["krabbelzwerge-gostenhof"]);
    expect(reg?.adopted[0]?.first).toMatchObject({ title: "Krabbelgruppe", start: "2026-10-14T10:00:00+02:00" });
    expect(reg?.rejected).toEqual([{ find: expect.objectContaining({ name: "Yoga Studio" }), grund: "unbekannt" }]);
    expect(reg?.dropped[0]?.grund).toMatch(/Katalog/);
    // data/ unverändert
    expect(readFileSync(join(d.dataDir, "providers.yaml"), "utf8")).toBe(before);
    expect(existsSync(join(d.dataDir, "raw"))).toBe(false);
    expect(existsSync(join(d.dataDir, "discover"))).toBe(false);
    expect(existsSync(join(d.dataDir, "kosten.csv"))).toBe(false);
    // Trockenlauf nach runs/
    const catalog = parse(readFileSync(join(d.runDir, "providers.yaml"), "utf8")) as Array<{ id: string }>;
    expect(catalog.at(-1)?.id).toBe("krabbelzwerge-gostenhof");
    expect(existsSync(join(d.runDir, "raw", "krabbelzwerge-gostenhof.json"))).toBe(true);
    const state = DiscoverState.parse(JSON.parse(readFileSync(join(d.runDir, "nuernberg.json"), "utf8")));
    expect(state.zurueckgestellt.map((z) => z.url)).toEqual(["https://yoga.example.net/"]);
    expect(readFileSync(join(d.runDir, "kosten.csv"), "utf8")).toMatch(/\n2026-10-11,entdecken,nuernberg,4,/);
    expect(readFileSync(join(d.runDir, "kosten.jsonl"), "utf8").trim().split("\n")).toHaveLength(4);
    // Bericht als Markdown neben report.json (Inhalt prüft lib/discover.test.ts)
    expect(existsSync(join(d.runDir, "report.md"))).toBe(true);
  });

  it("live: Commit je Anbieter mit Text nach G4, Zustand und Kosten nach data/", async () => {
    const d = tempData();
    const commits: Array<{ id: string; subject: string }> = [];
    const r = await run(
      d,
      {
        search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }),
        assess: { [SITE]: assessOk("Krabbelzwerge Gostenhof") },
      },
      { dryRun: false, commit: (id, message) => commits.push({ id, subject: message.split("\n")[0] ?? "" }) },
    );
    expect(r.regions[0]?.adopted).toHaveLength(1);
    expect(commits).toEqual([
      { id: "krabbelzwerge-gostenhof", subject: "data: neuer Anbieter krabbelzwerge-gostenhof (nuernberg)" },
    ]);
    expect(readFileSync(join(d.dataDir, "providers.yaml"), "utf8")).toMatch(/id: krabbelzwerge-gostenhof/);
    expect(existsSync(join(d.dataDir, "raw", "krabbelzwerge-gostenhof.json"))).toBe(true);
    expect(existsSync(join(d.dataDir, "discover", "nuernberg.json"))).toBe(true);
    expect(readFileSync(join(d.dataDir, "kosten.csv"), "utf8")).toMatch(/entdecken,nuernberg,3,.*,1,0\n$/);
  });

  it("Ertragsbeweis extrahiert immer frisch, auch wenn ein Zustand derselben ID im Laufverzeichnis liegt", async () => {
    const d = tempData();
    const f = {
      search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }),
      assess: { [SITE]: assessOk("Krabbelzwerge Gostenhof") },
    };
    await run(d, f);
    // zweiter Lauf am selben Tag: gleicher Schlüssel, aber kein „unverändert“ aus dem alten Beweis
    const again = await run(d, f);
    expect(again.calls.filter((c) => c.step === "extract")).toHaveLength(1);
    expect(again.regions[0]?.adopted).toHaveLength(1);
  });

  it("ohne Ertrag: verworfen und zurückgestellt, kein Katalogeintrag", async () => {
    const d = tempData();
    const r = await run(d, {
      search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }),
      assess: { [SITE]: assessOk("Krabbelzwerge Gostenhof") },
      empty: ["krabbelzwerge-gostenhof"],
    });
    expect(r.regions[0]?.adopted).toEqual([]);
    expect(r.regions[0]?.rejected[0]?.grund).toBe("kein Angebot für 0–3 Jahre mit künftigem Termin");
    expect(existsSync(join(d.runDir, "providers.yaml"))).toBe(false);
    const state = DiscoverState.parse(JSON.parse(readFileSync(join(d.runDir, "nuernberg.json"), "utf8")));
    expect(state.zurueckgestellt[0]).toMatchObject({ url: SITE, wiedervorlage: "2026-12-06" });
  });

  it("G3: höchstens maxNew neue Anbieter, Rest nicht bewertet", async () => {
    const d = tempData();
    const other = "https://zwerge.example.net/";
    const r = await run(
      d,
      {
        search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }, { name: "Musikzwerge Süd", url: other }),
        assess: {
          [SITE]: assessOk("Krabbelzwerge Gostenhof"),
          [other]: { ...assessOk("Musikzwerge Süd"), eintrag: { ...assessOk("Musikzwerge Süd").eintrag, url: other } },
        },
      },
      { maxNew: 1 },
    );
    expect(r.regions[0]?.adopted.map((a) => a.id)).toEqual(["krabbelzwerge-gostenhof"]);
    expect(r.regions[0]?.hints.join()).toMatch(/G3: höchstens 1 neue Anbieter je Lauf, 1 Kandidaten nicht bewertet/);
  });

  it("G1 rot (GateError): nicht aufgenommen, Lauf geht weiter", async () => {
    const d = tempData();
    const r = await run(
      d,
      {
        search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }),
        assess: { [SITE]: assessOk("Krabbelzwerge Gostenhof") },
      },
      {
        dryRun: false,
        commit: () => {
          throw new GateError("G1 rot: check:fast");
        },
      },
    );
    expect(r.regions[0]?.adopted).toEqual([]);
    expect(r.regions[0]?.rejected[0]?.grund).toBe("G1 rot: check:fast");
  });

  it("G2 oder anderer Fehler beim Commit bricht den Lauf ab", async () => {
    const d = tempData();
    await expect(
      run(
        d,
        {
          search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }),
          assess: { [SITE]: assessOk("Krabbelzwerge Gostenhof") },
        },
        {
          dryRun: false,
          commit: () => {
            throw new Error("G2: Änderung an bestehenden Katalogeinträgen");
          },
        },
      ),
    ).rejects.toThrow(/G2/);
  });

  it("Bremse MAX_CALLS beendet geordnet", async () => {
    const d = tempData();
    const r = await run(
      d,
      {},
      { terms: ["Krabbelgruppe", "PEKiP", "Babymassage"], brakes: { maxCalls: 2, maxTokens: 1e9 } },
    );
    expect(r.calls).toHaveLength(2);
    expect(r.brake).toBe("aufrufe");
    expect(readFileSync(join(d.runDir, "kosten.csv"), "utf8")).toMatch(/,aufrufe,0,0\n$/);
  });

  it("Auth-Fehler der Websuche beendet den Lauf", async () => {
    const d = tempData();
    const r = await run(d, { searchAbort: "auth" }, { terms: ["Krabbelgruppe", "PEKiP"] });
    expect(r.abort).toBe("auth");
    expect(r.calls).toHaveLength(1);
  });

  it("Geocoder gesperrt: zurückgestellt ohne Eintrag im Zustand, Ort außerhalb: verworfen", async () => {
    const d = tempData();
    const blocked = await run(d, {
      search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }),
      assess: { [SITE]: assessOk("Krabbelzwerge Gostenhof") },
      geocode: async () => {
        throw new Error("HTTP 403 für https://nominatim.openstreetmap.org/…");
      },
    });
    expect(blocked.regions[0]?.rejected[0]?.grund).toMatch(/zurückgestellt: Geocoder \(HTTP 403/);
    const state = DiscoverState.parse(JSON.parse(readFileSync(join(d.runDir, "nuernberg.json"), "utf8")));
    expect(state.zurueckgestellt).toEqual([]);

    const far = await run(tempData(), {
      search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }),
      assess: { [SITE]: assessOk("Krabbelzwerge Gostenhof") },
      geocode: async () => ({ lat: 48.14, lon: 11.58, display: "München" }),
    });
    expect(far.regions[0]?.rejected[0]?.grund).toMatch(/außerhalb der Region/);
  });
});
