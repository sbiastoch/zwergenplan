import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { Provider } from "../../../src/domain/schema.ts";
import { ProvidersFile } from "../../../src/domain/schema.ts";
import { normalizeAddress } from "../lib/address.ts";
import { DISCOVER_BRAKES } from "../lib/cost.ts";
import { type Find, postpone } from "../lib/discover.ts";
import { DiscoverState, emptyState } from "../lib/discover-state.ts";
import type { CallRecord, Extractor } from "../lib/extract.ts";
import type { PageOutcome } from "../lib/fetch.ts";
import { addKlaerfall } from "../lib/klaerfall.ts";
import { RawEvent } from "../lib/raw.ts";
import type { FetchPlan } from "../lib/select.ts";
import { type DiscoverDeps, type DiscoverOptions, runDiscover, type StepReply } from "./discover.ts";
import { GateError } from "./discover-git.ts";
import { type FetchResult, unitInputs } from "./fetch-inputs.ts";
import type { GeoOutcome, GeoResult } from "./geocode.ts";

const fixtureCatalog: Provider[] = ProvidersFile.parse(
  parse(readFileSync(new URL("../../../tests/fixtures/providers.yaml", import.meta.url), "utf8")),
);

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
const fakeFetchInputs = async (plan: FetchPlan, catalog: readonly Provider[]): Promise<FetchResult> => {
  const out: FetchResult = { providers: {}, texts: {}, adapters: {}, inputs: {} };
  for (const p of plan.providers) {
    const owner = catalog.find((c) => c.id === p.id);
    if (owner?.role !== "anbieter") continue;
    const outcomes: PageOutcome[] = p.pages.map((t) => ({
      url: t.url,
      art: "html",
      ok: true,
      text: "Krabbelgruppe mittwochs für Babys",
      ms: 1,
    }));
    const pages = outcomes.flatMap((o) => (o.ok ? [{ url: o.url, text: o.text }] : []));
    out.inputs[p.id] = {
      via: p.via,
      adapterIssues: {},
      status: "ok",
      pages,
      candidates: [],
      text: "## Seite 1\nKrabbelgruppe mittwochs für Babys",
      allowedUrls: pages.map((pg) => pg.url),
      ...unitInputs(owner, outcomes, []),
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
  /** je Adresse: Treffer, `null` = kein Treffer, Wurf = Ausfall */
  geocode?: (address: string) => Promise<GeoResult | null>;
  empty?: string[];
}

const GOSTENHOF: GeoResult = { lat: 49.449, lon: 11.06, display: "x", district: "Gostenhof", municipality: "Nürnberg" };

/** Fake des Geocoders aus einer Funktion je Adresse; `seen` hält die Orte des Katalogs, die der Lauf übergab */
function fakeGeocoder(
  geocode: Fakes["geocode"],
  seen?: { known?: ReadonlyMap<string, readonly GeoResult[]> },
): DiscoverDeps["geocoder"] {
  return (init) => {
    if (seen) seen.known = init.known;
    return {
      geocode: async (address): Promise<GeoOutcome> => {
        try {
          const g = await (geocode ?? (async () => GOSTENHOF))(address);
          return g ? { kind: "treffer", stufe: 1, geo: g } : { kind: "kein-treffer" };
        } catch (e) {
          return { kind: "ausfall", grund: e instanceof Error ? e.message : String(e) };
        }
      },
      newOrte: () => ({}),
      stats: () => ({ requests: 0, waitMs: 0 }),
    };
  };
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
    fetchPdfText: async () => {
      throw new Error("kein PDF erwartet");
    },
    geocoder: fakeGeocoder(f.geocode),
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

const find = (name: string, url: string): Find => ({ name, url, warum: "0–3", quelle: "suche:Krabbelgruppe" });

const kandidaten = (...list: Array<{ name: string; url: string }>) => ({
  Krabbelgruppe: { kandidaten: list.map((k) => ({ ...k, warum: "0–3" })) },
});

describe("runDiscover (Plan 0032, E7)", () => {
  it("PDF-Fund wird über pdftotext gelesen, nicht als HTML", async () => {
    const d = tempData();
    const flyer = "https://flyer.example.net/programm.pdf";
    const messages: string[] = [];
    const base = deps({ search: kandidaten({ name: "Familienzentrum Flyer", url: flyer }) });
    await run(
      d,
      {},
      {
        deps: {
          ...base,
          fetchPage: async (url) => ({ ...page(url, "%PDF-1.4 Binärdaten"), contentType: "application/pdf" }),
          fetchPdfText: async (url) => (url === flyer ? "Krabbelgruppe dienstags, Kernstraße 3" : ""),
          assess: async (find, message, signal) => {
            messages.push(message);
            return base.assess(find, message, signal);
          },
        },
      },
    );
    expect(messages[0]).toMatch(/## TEXT\nKrabbelgruppe dienstags, Kernstraße 3/);
    expect(messages[0]).not.toMatch(/%PDF/);
  });

  it("Bewerten bekommt die Kontaktseite derselben Website mit, ohne weiteren Modellaufruf", async () => {
    const d = tempData();
    const messages: string[] = [];
    const fetched: string[] = [];
    const base = deps({ search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }) });
    await run(
      d,
      {},
      {
        deps: {
          ...base,
          fetchPage: async (url) => {
            fetched.push(url);
            return url.endsWith("/kontakt")
              ? page(url, "<html><body><p>Kernstraße 3, 90429 Nürnberg</p></body></html>")
              : page(url, `${HOME.replace("</body>", `<a href="${SITE}kontakt">Kontakt</a></body>`)}`);
          },
          assess: async (find, message, signal) => {
            messages.push(message);
            return base.assess(find, message, signal);
          },
        },
      },
    );
    expect(fetched).toEqual([SITE, `${SITE}kontakt`]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/## WEITERE SEITE: https:\/\/krabbelzwerge\.example\.net\/kontakt\nKernstraße 3/);
  });

  it("Kontaktseite mit Fehler oder Weiterleitung auf eine andere Website: Bewerten ohne sie, Lauf geht weiter", async () => {
    const d = tempData();
    const messages: string[] = [];
    const base = deps({
      search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }),
      assess: { [SITE]: assessOk("Krabbelzwerge Gostenhof") },
    });
    const links = `<a href="${SITE}kontakt">Kontakt</a><a href="${SITE}anfahrt">Anfahrt</a>`;
    const r = await run(
      d,
      {},
      {
        deps: {
          ...base,
          fetchPage: async (url) => {
            if (url.endsWith("/kontakt")) return { ...page(url, "weg"), status: 404 };
            if (url.endsWith("/anfahrt")) return page("https://fremd.example.org/anfahrt", "<p>Fremdstraße 1</p>");
            return page(url, HOME.replace("</body>", `${links}</body>`));
          },
          assess: async (find, message, signal) => {
            messages.push(message);
            return base.assess(find, message, signal);
          },
        },
      },
    );
    expect(messages[0]).not.toMatch(/WEITERE SEITE/);
    expect(r.regions[0]?.adopted).toHaveLength(1);
  });

  it("eine nur auf der Kontaktseite verlinkte Adresse wird keine Programmseite", async () => {
    const d = tempData();
    const fremd = "https://krabbelzwerge.example.net/termine-fremd";
    const withFremd = assessOk("Krabbelzwerge Gostenhof");
    withFremd.eintrag.programme = [...withFremd.eintrag.programme, { url: fremd, kind: "html", use: "termine" }];
    const base = deps({
      search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }),
      assess: { [SITE]: withFremd },
    });
    const r = await run(
      d,
      {},
      {
        deps: {
          ...base,
          fetchPage: async (url) =>
            url.endsWith("/kontakt")
              ? page(url, `<p>Kernstraße 3, 90429 Nürnberg</p><a href="${fremd}">Termine</a>`)
              : page(url, HOME.replace("</body>", `<a href="${SITE}kontakt">Kontakt</a></body>`)),
        },
      },
    );
    expect(r.regions[0]?.hints.join()).toMatch(/nicht auf der abgerufenen Seite verlinkt: .*termine-fremd/);
    const catalogText = readFileSync(join(d.runDir, "providers.yaml"), "utf8");
    expect(catalogText).not.toMatch(/termine-fremd/);
  });

  it("zurückgenommene ID aus data/discover wird nicht neu vergeben, G2 im Trockenlauf grün", async () => {
    const d = tempData();
    mkdirSync(join(d.dataDir, "discover"));
    writeFileSync(
      join(d.dataDir, "discover", "nuernberg.json"),
      JSON.stringify({
        region: "nuernberg",
        abgelehnt: [{ id: "krabbelzwerge-gostenhof", publicId: "abcd1234", grund: "zurückgenommen", datum: TODAY }],
        zurueckgestellt: [],
      }),
    );
    const r = await run(d, {
      search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }),
      assess: { [SITE]: assessOk("Krabbelzwerge Gostenhof") },
    });
    expect(r.regions[0]?.adopted.map((a) => a.id)).toEqual(["krabbelzwerge-gostenhof-2"]);
    expect(r.gateErrors).toBeUndefined();
  });

  it("zwei Regionen: Fürth zuerst, keine Dublette, abgelehnt gilt über Regionen (Plan 0036, E2/E4)", async () => {
    const d = tempData();
    mkdirSync(join(d.dataDir, "discover"));
    writeFileSync(
      join(d.dataDir, "discover", "nuernberg.json"),
      JSON.stringify({
        region: "nuernberg",
        abgelehnt: [{ host: "spam.example.net", grund: "Werbung", datum: TODAY }],
        zurueckgestellt: [],
      }),
    );
    const FUE = "https://kleeblatt.example.net/";
    const MOE = "https://moegelzwerge.example.net/";
    const entry = (name: string, url: string, address: string) => ({
      entscheidung: "aufnehmen",
      grund: "Krabbelgruppe mit Terminen",
      eintrag: {
        name,
        url,
        programme: [{ url: `${url}kurse`, kind: "html", use: "termine" }],
        venues: [{ name: `${name} Raum`, address }],
        availability: "unbekannt",
      },
    });
    const fakes = {
      // dieselbe Suche liefert in beiden Regionen dieselben Funde
      search: kandidaten(
        { name: "Kleeblatt Fürth", url: FUE },
        { name: "Mögelzwerge", url: MOE },
        { name: "Spam", url: "https://kurse.spam.example.net/x" },
      ),
      assess: {
        [FUE]: entry("Kleeblatt Fürth", FUE, "Königstraße 1, 90762 Fürth"),
        [MOE]: entry("Mögelzwerge", MOE, "Ostendstraße 1, 90482 Nürnberg"),
      },
      geocode: async (address: string) =>
        address.includes("Fürth")
          ? { lat: 49.476, lon: 10.989, display: "x", district: "Innenstadt", municipality: "Fürth", county: "Fürth" }
          : { lat: 49.46, lon: 11.13, display: "x", district: "Mögeldorf", municipality: "Nürnberg" },
    } satisfies Fakes;
    // jede Fund-Seite verlinkt ihre Kursseite (Programmseiten nur aus den Links der Fund-Seite)
    const fetchPage: DiscoverDeps["fetchPage"] = async (url) =>
      page(url, `<html><body><p>Krabbelgruppe für Babys</p><a href="${new URL("kurse", url)}">Kurse</a></body></html>`);
    const r = await run(d, fakes, { regions: ["fuerth", "nuernberg"], deps: { ...deps(fakes), fetchPage } });
    const [fue, nbg] = r.regions;
    expect(fue?.region).toBe("fuerth");
    expect(fue?.adopted.map((a) => a.id)).toEqual(["kleeblatt-fuerth"]);
    expect(fue?.rejected).toEqual([
      {
        find: expect.objectContaining({ url: MOE }),
        grund: expect.stringMatching(/^kein Ort in der Region Fürth/),
        stufe: "aufnehmen",
      },
    ]);
    expect(fue?.dropped.map((x) => x.grund)).toEqual(["abgelehnt: Werbung"]);
    // Nürnberg: Fürther Fund steht schon im Katalog, Mögeldorf wird im selben Lauf hier aufgenommen (Review G3)
    expect(nbg?.region).toBe("nuernberg");
    expect(nbg?.adopted.map((a) => a.id)).toEqual(["moegelzwerge"]);
    expect(nbg?.dropped.map((x) => x.grund)).toEqual([expect.stringMatching(/Katalog/), "abgelehnt: Werbung"]);
    const catalog = parse(readFileSync(join(d.runDir, "providers.yaml"), "utf8")) as Array<{
      id: string;
      region: string;
    }>;
    expect(catalog.slice(-2).map((p) => [p.id, p.region])).toEqual([
      ["kleeblatt-fuerth", "fuerth"],
      ["moegelzwerge", "nuernberg"],
    ]);
    const state = DiscoverState.parse(JSON.parse(readFileSync(join(d.runDir, "fuerth.json"), "utf8")));
    expect(state.zurueckgestellt.map((z) => z.url)).toEqual([MOE]);
  });

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
    expect(reg?.rejected).toEqual([
      { find: expect.objectContaining({ name: "Yoga Studio" }), grund: "unbekannt", stufe: "abgerufen" },
    ]);
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

  it("Geocoder gesperrt: Klärfall, im Trockenlauf nicht im Zustand; Ort außerhalb: verworfen", async () => {
    const d = tempData();
    const blocked = await run(d, {
      search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }),
      assess: { [SITE]: assessOk("Krabbelzwerge Gostenhof") },
      geocode: async () => {
        throw new Error("HTTP 403 für https://nominatim.openstreetmap.org/…");
      },
    });
    expect(blocked.regions[0]?.rejected).toEqual([]);
    expect(blocked.regions[0]?.klaerfaelle[0]?.grund).toMatch(/^Geocoder-Ausfall: HTTP 403/);
    const state = DiscoverState.parse(JSON.parse(readFileSync(join(d.runDir, "nuernberg.json"), "utf8")));
    expect(state.zurueckgestellt).toEqual([]);
    expect(state.klaerfaelle).toEqual([]);

    const far = await run(tempData(), {
      search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }),
      assess: { [SITE]: assessOk("Krabbelzwerge Gostenhof") },
      geocode: async () => ({ lat: 48.14, lon: 11.58, display: "München" }),
    });
    expect(far.regions[0]?.rejected[0]?.grund).toBe(
      "kein Ort in der Region Nürnberg (außerhalb: Kernstraße 3, 90429 Nürnberg)",
    );
  });

  it("--eval: ausgeblendeter Anbieter wird wiedergefunden, Ertrag gegen die Referenz, G2 bleibt grün", async () => {
    const d = tempData();
    // Zustand und G3 zählen im Eval nicht (Plan 0050, E6): zurückgestellt, offener Klärfall, maxNew 1
    const pending = find("Krabbelzwerge Gostenhof", SITE);
    const held = addKlaerfall(
      postpone(emptyState("nuernberg"), pending, "kein Ertrag", TODAY),
      find("Offener Klärfall", "https://klaer.example.net/"),
      "Netz",
      "kandidat",
      TODAY,
    );
    mkdirSync(join(d.dataDir, "discover"));
    writeFileSync(join(d.dataDir, "discover", "nuernberg.json"), JSON.stringify(held));
    const before = readFileSync(join(d.dataDir, "providers.yaml"), "utf8");
    const turnverein = "https://example.org/turnverein";
    const tvKurse = `${turnverein}/kinderturnen`;
    const tv = assessOk("Turnverein Beispiel");
    const base = deps({
      search: kandidaten(
        { name: "Turnverein Beispiel", url: turnverein },
        { name: "Krabbelzwerge Gostenhof", url: SITE },
      ),
      assess: {
        [turnverein]: {
          ...tv,
          eintrag: { ...tv.eintrag, url: turnverein, programme: [{ url: tvKurse, kind: "html", use: "termine" }] },
        },
        [SITE]: assessOk("Krabbelzwerge Gostenhof"),
      },
    });
    const seen: { known?: ReadonlyMap<string, readonly GeoResult[]> } = {};
    // Lage des ersten Turnverein-Orts: Der Fake-Extraktor legt Referenz und Fund an denselben Termin
    const tvGeo = { lat: 49.4392, lon: 11.0442, display: "Turnhalle", municipality: "Nürnberg" };
    const r = await run(
      d,
      {},
      {
        maxNew: 1,
        eval: {
          ids: ["turnverein-beispiel", "theater-beispiel"],
          alt: ["theater-beispiel"],
          urteile: { [SITE]: { urteil: "passend", datum: TODAY } },
        },
        deps: {
          ...base,
          geocoder: fakeGeocoder(async () => tvGeo, seen),
          fetchPage: async (url) =>
            page(url, url === turnverein ? `<p>Eltern-Kind-Turnen</p><a href="${tvKurse}">Kurse</a>` : HOME),
        },
      },
    );
    expect(r.regions[0]?.adopted.map((a) => a.id)).toEqual(["turnverein-beispiel", "krabbelzwerge-gostenhof"]);
    expect(r.regions[0]?.finds).toBe(2);
    expect(r.hidden?.outcomes.map((o) => [o.id, o.ergebnis, o.alt, o.stufe])).toEqual([
      ["theater-beispiel", "nicht gefunden", true, undefined],
      ["turnverein-beispiel", "aufgenommen", undefined, "beweis"],
    ]);
    // Mittwochs 14.10. bis 2.12.: acht Termine im Fenster bis +8 Wochen, alle am selben Ort
    expect(r.hidden?.outcomes[1]?.ertrag).toEqual({ treffer: 8, referenz: 8 });
    expect(existsSync(join(d.runDir, "referenz", "turnverein-beispiel.json"))).toBe(true);
    expect(r.hidden?.extra.map((a) => [a.id, a.urteil?.urteil])).toEqual([["krabbelzwerge-gostenhof", "passend"]]);
    expect(r.calls.filter((c) => c.step === "extract")).toHaveLength(3);
    expect(JSON.parse(readFileSync(join(d.runDir, "report.json"), "utf8")).hidden.outcomes[1].ertrag).toEqual({
      treffer: 8,
      referenz: 8,
    });
    expect(r.gateErrors).toBeUndefined();
    expect(JSON.parse(readFileSync(join(d.runDir, "report.json"), "utf8")).hidden.outcomes).toHaveLength(2);
    // data/ unverändert, der Katalog des Laufs kennt den ausgeblendeten nur als neuen Eintrag
    expect(readFileSync(join(d.dataDir, "providers.yaml"), "utf8")).toBe(before);
    const ids = (parse(readFileSync(join(d.runDir, "providers.yaml"), "utf8")) as Array<{ id: string }>).map(
      (p) => p.id,
    );
    expect(ids).not.toContain("theater-beispiel");
    expect(ids.filter((id) => id === "turnverein-beispiel")).toHaveLength(1);
    // Orte der ausgeblendeten gehen durch den Geocoder, nicht über den Katalog (Plan 0050, E5; sonst mäße das Eval
    // den Geocoder nicht)
    const venues = (id: string) => {
      const p = fixtureCatalog.find((x) => x.id === id);
      return p?.role === "anbieter" ? p.venues.map((v) => normalizeAddress(v.address).text) : [];
    };
    for (const a of venues("turnverein-beispiel")) expect(seen.known?.has(a)).toBe(false);
    expect(venues("familientreff-beispiel").some((a) => seen.known?.has(a))).toBe(true);
  });

  it("--eval nur im Trockenlauf und nur mit Anbietern der Regionen", async () => {
    await expect(run(tempData(), {}, { dryRun: false, eval: { ids: ["turnverein-beispiel"] } })).rejects.toThrow(
      /Trockenlauf/,
    );
    await expect(run(tempData(), {}, { eval: { ids: ["sammelkalender-beispiel"] } })).rejects.toThrow(/kein Anbieter/);
  });

  it("Verworfene und Klärfälle tragen die letzte bestandene Stufe (Plan 0050, E6)", async () => {
    const r = await run(tempData(), {
      search: kandidaten(
        { name: "Krabbelzwerge Gostenhof", url: SITE },
        { name: "Babytreff", url: "https://babytreff.example.net/" },
      ),
      assess: { [SITE]: assessOk("Krabbelzwerge Gostenhof") },
      geocode: async () => null,
    });
    expect(r.regions[0]?.klaerfaelle.map((k) => k.stufe)).toEqual(["aufnehmen"]);
    expect(r.regions[0]?.rejected.map((k) => k.stufe)).toEqual(["abgerufen"]);
  });
});

describe("Härte: Orte und Klärfälle (Plan 0050, E5)", () => {
  const live = { dryRun: false, commit: () => undefined };
  const stateOf = (d: ReturnType<typeof tempData>) =>
    DiscoverState.parse(JSON.parse(readFileSync(join(d.dataDir, "discover", "nuernberg.json"), "utf8")));
  const twoPlaces = (name: string) => {
    const a = assessOk(name);
    return {
      ...a,
      eintrag: {
        ...a.eintrag,
        venues: [...a.eintrag.venues, { name: "Turnhalle Süd", address: "Turnhalle Süd, Nürnberg" }],
      },
    };
  };
  const one = (over: Partial<Fakes> = {}): Fakes => ({
    search: kandidaten({ name: "Krabbelzwerge Gostenhof", url: SITE }),
    assess: { [SITE]: twoPlaces("Krabbelzwerge Gostenhof") },
    ...over,
  });

  it("ein Ort ohne Treffer: aufgenommen mit dem übrigen, Hinweis, hint nennt nur den weggelassenen", async () => {
    const d = tempData();
    const r = await run(d, one({ geocode: async (a) => (a.startsWith("Turnhalle") ? null : GOSTENHOF) }));
    expect(r.regions[0]?.adopted[0]?.notes).toContain(
      "Ort ohne Treffer im Geocoder weggelassen: Turnhalle Süd, Turnhalle Süd, Nürnberg",
    );
    const entry = (parse(readFileSync(join(d.runDir, "providers.yaml"), "utf8")) as Provider[]).find(
      (p) => p.id === "krabbelzwerge-gostenhof",
    );
    expect(entry?.programme[0]?.hint).toBe("Termine an Turnhalle Süd weglassen (Ort nicht im Eintrag)");
  });

  it("Geocoder-Ausfall (429) für einen Ort: Klärfall am Lauf, kein Ort geht verloren, anzahl 0", async () => {
    const d = tempData();
    const r = await run(
      d,
      one({
        geocode: async (a) => {
          if (a.startsWith("Turnhalle")) throw new Error("HTTP 429 für https://nominatim.openstreetmap.org/");
          return GOSTENHOF;
        },
      }),
      live,
    );
    expect(r.regions[0]?.adopted).toEqual([]);
    expect(r.regions[0]?.rejected).toEqual([]);
    expect(stateOf(d).klaerfaelle).toEqual([
      expect.objectContaining({ url: SITE, anzahl: 0, grund: expect.stringMatching(/^Geocoder-Ausfall: HTTP 429/) }),
    ]);
  });

  it("kein Treffer für alle Orte: Klärfall ohne Wiedervorlage; kommt ohne Websuche wieder, ab dem dritten ausgesetzt", async () => {
    const d = tempData();
    const f = one({ geocode: async () => null });
    await run(d, f, live);
    expect(stateOf(d).zurueckgestellt).toEqual([]);
    expect(stateOf(d).klaerfaelle[0]).toMatchObject({ url: SITE, anzahl: 1 });
    // zweiter Lauf ohne Fund der Websuche: der Klärfall ist selbst eine Quelle
    const again = await run(d, { ...f, search: {} }, live);
    expect(again.regions[0]?.klaerfaelle[0]?.find.quelle).toBe("klaerfall");
    await run(d, { ...f, search: {} }, live);
    expect(stateOf(d).klaerfaelle[0]).toMatchObject({ anzahl: 3, aussetzenBis: "2026-11-15" });
    const paused = await run(d, f, live);
    expect(paused.regions[0]?.dropped[0]?.grund).toBe("Klärfall ausgesetzt bis 2026-11-15");
  });

  it("Netz, 5xx und Bot-Schutz: Klärfall; 404: verworfen mit Wiedervorlage", async () => {
    const status = (code: number) => async (url: string) => ({ ...page(url, HOME), status: code });
    const down = await run(tempData(), {}, { deps: { ...deps(one()), fetchPage: status(503) } });
    expect(down.regions[0]?.klaerfaelle[0]?.grund).toBe("Seite nicht abrufbar: HTTP 503");
    const gone = await run(tempData(), {}, { deps: { ...deps(one()), fetchPage: status(404) } });
    expect(gone.regions[0]?.rejected[0]?.grund).toBe("Seite nicht abrufbar: HTTP 404");
    expect(gone.regions[0]?.klaerfaelle).toEqual([]);
  });

  it("mögliche Dublette (ähnlicher Name, Ort ≤ 100 m): Klärfall, nicht aufgenommen", async () => {
    const twin = fixtureCatalog.find((p) => p.role === "anbieter" && p.venues.length > 0);
    if (twin?.role !== "anbieter") throw new Error("Fixture ohne Anbieter mit Ort");
    const geo = twin.venues[0]?.geo ?? { lat: 0, lon: 0 };
    const r = await run(tempData(), {
      search: kandidaten({ name: twin.name, url: SITE }),
      assess: { [SITE]: assessOk(twin.name) },
      geocode: async () => ({ ...geo, display: "x", municipality: "Nürnberg" }),
    });
    expect(r.regions[0]?.adopted).toEqual([]);
    expect(r.regions[0]?.klaerfaelle[0]?.grund).toBe(`Dublette von ${twin.id}? (ähnlicher Name, Ort ≤ 100 m)`);
    // Kennzahl „Dubletten“ im Eval hängt am Feld, nicht am Wortlaut (Arch-Review S2, m4)
    expect(r.regions[0]?.klaerfaelle[0]?.dublette).toBe(true);
  });

  it("Klärfälle gelangen im Trockenlauf nicht in den Zustand", async () => {
    const d = tempData();
    await run(d, one({ geocode: async () => null }));
    const state = DiscoverState.parse(JSON.parse(readFileSync(join(d.runDir, "nuernberg.json"), "utf8")));
    expect(state.klaerfaelle).toEqual([]);
  });

  // Arch-Review S1, M1/M2: Verdrahtung in runDiscover
  const ORT = { lat: 49.449, lon: 11.06, adresse: "Kernstraße 3, 90429 Nürnberg", stufe: 1 as const, datum: TODAY };
  const withOrte: DiscoverDeps["geocoder"] = (init) => ({
    ...fakeGeocoder(undefined)(init),
    newOrte: () => ({ "Kernstraße 3, 90429 Nürnberg": ORT }),
  });
  const seed = (d: ReturnType<typeof tempData>, url: string) => {
    const k = { url, name: "K", grund: "Geocoder ohne Treffer", seit: TODAY, zuletzt: TODAY, anzahl: 1 };
    mkdirSync(join(d.dataDir, "discover"), { recursive: true });
    writeFileSync(
      join(d.dataDir, "discover", "nuernberg.json"),
      JSON.stringify({ region: "nuernberg", abgelehnt: [], zurueckgestellt: [], klaerfaelle: [k] }),
    );
  };

  it("Treffer des Geocoders landen in orte: live in data/discover, trocken nur unter runs/", async () => {
    const live1 = tempData();
    await run(live1, {}, { ...live, deps: { ...deps(one()), geocoder: withOrte } });
    expect(stateOf(live1).orte).toEqual({ "Kernstraße 3, 90429 Nürnberg": ORT });
    const dry = tempData();
    await run(dry, {}, { deps: { ...deps(one()), geocoder: withOrte } });
    expect(existsSync(join(dry.dataDir, "discover", "nuernberg.json"))).toBe(false);
    const state = DiscoverState.parse(JSON.parse(readFileSync(join(dry.runDir, "nuernberg.json"), "utf8")));
    expect(Object.keys(state.orte)).toEqual(["Kernstraße 3, 90429 Nürnberg"]);
  });

  it("ein Klärfall endet durch Aufnahme", async () => {
    const d = tempData();
    seed(d, SITE);
    const r = await run(d, { search: {}, assess: { [SITE]: assessOk("Krabbelzwerge Gostenhof") } }, live);
    expect(r.regions[0]?.adopted).toHaveLength(1);
    expect(stateOf(d).klaerfaelle).toEqual([]);
  });

  it("ein Klärfall endet durch Verwerfung (mit Wiedervorlage)", async () => {
    const d = tempData();
    seed(d, SITE);
    await run(d, { search: {} }, live);
    expect(stateOf(d).klaerfaelle).toEqual([]);
    expect(stateOf(d).zurueckgestellt[0]?.url).toBe(SITE);
  });

  it("ein Klärfall endet, wenn ein Mensch den Anbieter aufgenommen hat (Vorfilter: bekannt)", async () => {
    const d = tempData();
    const known = fixtureCatalog.find((p) => p.role === "anbieter");
    seed(d, known?.url ?? "");
    const r = await run(d, { search: {} }, live);
    expect(r.regions[0]?.dropped.some((x) => x.bekannt)).toBe(true);
    expect(stateOf(d).klaerfaelle).toEqual([]);
  });

  it("ungültige Antwort des Bewertens: Klärfall am Kandidaten", async () => {
    const r = await run(tempData(), one({ assess: { [SITE]: { kaputt: true } } }));
    expect(r.regions[0]?.klaerfaelle[0]?.grund).toMatch(/^Bewertung ohne gültige Antwort/);
    expect(r.regions[0]?.rejected).toEqual([]);
  });

  it("vor dem Bewerten beendet (G3): live ein Klärfall am Lauf mit anzahl 0, trocken keiner", async () => {
    const d = tempData();
    await run(d, one(), { ...live, maxNew: 0 });
    expect(stateOf(d).klaerfaelle).toEqual([
      expect.objectContaining({ url: SITE, anzahl: 0, grund: "Lauf vor dem Bewerten beendet" }),
    ]);
    const dry = tempData();
    await run(dry, one(), { maxNew: 0 });
    const state = DiscoverState.parse(JSON.parse(readFileSync(join(dry.runDir, "nuernberg.json"), "utf8")));
    expect(state.klaerfaelle).toEqual([]);
  });

  it("Programmseite im Ertragsbeweis: 404 verworfen mit Wiedervorlage, 503 Klärfall", async () => {
    const failing =
      (reason: string): DiscoverDeps["fetchInputs"] =>
      async (plan, catalog) => {
        const r = await fakeFetchInputs(plan, catalog);
        for (const [id, input] of Object.entries(r.inputs)) r.inputs[id] = { ...input, status: "fehler", reason };
        return r;
      };
    const gone = tempData();
    const r404 = await run(gone, {}, { ...live, deps: { ...deps(one()), fetchInputs: failing(`${KURSE}: HTTP 404`) } });
    expect(r404.regions[0]?.rejected[0]?.grund).toBe(`Programmseite nicht abrufbar: ${KURSE}: HTTP 404`);
    expect(stateOf(gone).zurueckgestellt[0]?.url).toBe(SITE);
    const r503 = await run(tempData(), {}, { deps: { ...deps(one()), fetchInputs: failing(`${KURSE}: HTTP 503`) } });
    expect(r503.regions[0]?.klaerfaelle[0]?.grund).toBe(`Programmseite nicht abrufbar: ${KURSE}: HTTP 503`);
  });
});
