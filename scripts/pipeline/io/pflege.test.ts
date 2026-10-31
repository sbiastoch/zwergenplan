import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Anbieter, Provider } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import { type DiscoverState, emptyState } from "../lib/discover-state.ts";
import type { CallRecord, ExtractInput, Extractor } from "../lib/extract.ts";
import type { PageOutcome } from "../lib/fetch.ts";
import { extractPage } from "../lib/html-extract.ts";
import { type ProviderRawV2, RawEvent, type UnitState } from "../lib/raw.ts";
import type { CrawlFetch } from "../lib/site-crawl.ts";
import { pflegeArgsError, runPflege } from "./pflege.ts";

const scratch = mkdtempSync(join(tmpdir(), "zp-pflege-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const TODAY = "2026-10-06";
const NOW = "2026-10-06T03:00:00+02:00";
const P = "familientreff-beispiel";
const VENUE = "familientreff-beispiel-haus";
const HOME = "https://example.org/familientreff";
const URL_A = `${HOME}/programm`;
const URL_C = `${HOME}/neu`;
const A = `seite:${URL_A}`;

const { providers } = loadFixtures();
const withProgramme = (extra: Anbieter["programme"], hint?: string): Provider[] =>
  providers.map((p) =>
    p.id === P && p.role === "anbieter"
      ? {
          ...p,
          programme: [...p.programme.map((g) => (hint ? { ...g, hint } : g)), ...extra],
        }
      : p,
  );
const catalog = withProgramme([]);

const html = (body: string) => `<html><body>${body}</body></html>`;
/** Babymassage freitags, drei künftige Termine: Signal für einen Kandidaten (E1) */
const MASSAGE = html(
  "<h1>Babymassage</h1><p>Babymassage für Babys freitags 15:00 Uhr: 09.10., 16.10., 23.10., 30.10., 06.11.</p>",
);
const KRABBEL = html(
  "<h1>Krabbeltreff</h1><p>Offener Krabbeltreff für Babys mittwochs 10:00 Uhr: 07.10., 14.10., 21.10.</p>",
);

/** Fake-Website: URL → HTML; Abrufe werden mitgeschrieben */
function site(pages: Record<string, string>) {
  const log: string[] = [];
  const crawlFetch =
    () =>
    async (url: string): Promise<CrawlFetch> => {
      log.push(url);
      const body = pages[url];
      if (body === undefined) return { ok: false, url, reason: "HTTP 404", cost: 1 };
      return {
        ok: true,
        url,
        finalUrl: url,
        contentType: "text/html",
        browser: false,
        page: extractPage(body, url),
        html: body,
        cost: 1,
      };
    };
  return { log, crawlFetch };
}

const event = (over: Partial<RawEvent> = {}): RawEvent =>
  RawEvent.parse({
    providerId: P,
    venueId: VENUE,
    title: "Offener Krabbeltreff",
    summary: "Spielen und Austausch für Familien mit Babys.",
    topics: ["krabbelgruppe"],
    format: "regelmaessig",
    registration: "ohne-anmeldung",
    cost: "kostenlos",
    url: URL_A,
    sourceUrl: URL_A,
    availability: { status: "ohne-anmeldung" },
    schedule: {
      kind: "weekly",
      weekdays: ["WE"],
      start: "10:00",
      end: "11:30",
      from: "2026-10-07",
      until: "2026-11-25",
      skipHolidays: false,
    },
    ...over,
  });
const massage = (sourceUrl: string) =>
  event({
    title: "Babymassage am Freitag",
    topics: ["babymassage"],
    url: sourceUrl,
    sourceUrl,
    schedule: {
      kind: "weekly",
      weekdays: ["FR"],
      start: "15:00",
      end: "16:00",
      from: "2026-10-09",
      until: "2026-11-27",
      skipHolidays: false,
    },
  });

const call: CallRecord = {
  step: "extract",
  providerId: P,
  model: "haiku",
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  webSearchRequests: 0,
  turns: 1,
  durationMs: 1,
  costUsd: 0.01,
  result: "ok",
};
/** Fake-Extraktor: Babymassage, wenn der Text sie nennt; `sourceUrl` ist die erste erlaubte URL */
function extractor() {
  const seen: ExtractInput[] = [];
  const fn: Extractor = async (input) => {
    seen.push(input);
    const src = input.allowedUrls[0] ?? URL_C;
    const events = input.text.includes("Babymassage") ? [massage(src)] : [];
    return { outcome: { kind: "ok", events, model: "haiku" }, calls: [call] };
  };
  return { fn, seen };
}

const unit = (events: RawEvent[], over: Partial<UnitState> = {}): UnitState => ({
  events,
  inputHash: "h",
  model: "haiku",
  status: events.length > 0 ? "ok" : "keine-termine",
  checkedAt: NOW,
  changedAt: NOW,
  ...over,
});
const raw = (units: Record<string, UnitState>): ProviderRawV2 => ({ version: 2, units });

let runs = 0;
async function pflege(o: {
  pages: Record<string, string>;
  raws?: Record<string, ProviderRawV2>;
  state?: DiscoverState;
  catalog?: Provider[];
  today?: string;
  ignoreRest?: boolean;
  clock?: () => number;
  fetchTask?: (url: string) => PageOutcome;
}) {
  const s = site(o.pages);
  const x = extractor();
  const tasks: string[] = [];
  const runDir = join(scratch, `run-${runs++}`);
  const run = await runPflege({
    catalog: o.catalog ?? catalog,
    participants: [P],
    raws: o.raws ?? { [P]: raw({ [A]: unit([event()]) }) },
    previous: undefined,
    states: { nuernberg: o.state ?? emptyState("nuernberg") },
    today: o.today ?? TODAY,
    now: () => NOW,
    freeDays: {},
    keyParts: { prompt: "P", schema: "{}", model: "haiku" },
    runDir,
    ignoreRest: o.ignoreRest ?? false,
    brakes: { maxCalls: 100, maxTokens: 1_000_000 },
    budgetMin: 120,
    ...(o.clock ? { clock: o.clock } : {}),
    signal: new AbortController().signal,
    log: () => undefined,
    modell: "haiku/high",
    deps: {
      crawlFetch: s.crawlFetch,
      fetchTask: async (task) => {
        tasks.push(task.url);
        return (
          o.fetchTask?.(task.url) ?? { url: task.url, art: "html", ok: true, text: "## TEXT\nfreie Plätze", ms: 0 }
        );
      },
      extractor: x.fn,
    },
  });
  return { run, crawled: s.log, seen: x.seen, tasks, runDir };
}

const PAGES = {
  [HOME]: html(`<a href="${URL_A}">Programm</a> <a href="${URL_C}?utm_source=newsletter#termine">Babymassage</a>`),
  [URL_A]: KRABBEL,
  [`${URL_C}?utm_source=newsletter#termine`]: MASSAGE,
};

describe("runPflege, Trockenlauf (Plan 0049, S1)", () => {
  it("neue Seite → würde anhängen; Kennung kanonisch, Auszug mit allen Seiten, kein zweiter Abruf, nichts nach data/", async () => {
    const { run, crawled, seen, runDir } = await pflege({ pages: PAGES });
    expect(run.append).toEqual([
      {
        anbieter: P,
        page: { url: URL_C, kind: "html", use: "termine" },
        neu: [expect.objectContaining({ title: "Babymassage am Freitag" })],
      },
    ]);
    // Kennung im Beweis gleich der URL im Anhang (ohne utm_* und Fragment)
    expect(seen.map((s) => s.unit)).toEqual([`seite:${URL_C}`]);
    // Auszug nennt alle Seiten des Anbieters samt Kandidat (M1)
    const excerpt = seen[0]?.excerpt;
    expect(excerpt?.role === "anbieter" ? excerpt.programme.map((g) => g.url) : undefined).toEqual([URL_A, URL_C]);
    // der Beweis ruft nichts ab: Kandidat aus der Erkundung, keine anderen Seiten
    expect(crawled.filter((u) => u.startsWith(URL_C))).toHaveLength(1);
    expect(new Set(crawled).size).toBe(crawled.length);
    // nur runs/: Zustand, Bericht, Kosten; gepflegt fortgeschrieben im Zustand des Laufs
    // Bericht als Rückgabe geprüft, nicht über die Datei: Code liest keine Doku (change-class.test.ts)
    expect(run.report).toMatch(/## Würde anhängen \(1\)/);
    expect(existsSync(join(runDir, "nuernberg.json"))).toBe(true);
    expect(readFileSync(join(runDir, "kosten.jsonl"), "utf8")).toContain('"run":"pflege"');
    expect(run.states.nuernberg?.gepflegt).toEqual([{ anbieter: P, datum: TODAY }]);
    expect(run.states.nuernberg?.seiten).toMatchObject([{ url: URL_C, ergebnis: "anhaengen" }]);
  });

  it("Beilage einmal je Anbieter, auch bei zwei Kandidaten (M5)", async () => {
    const plaetze = `${HOME}/plaetze`;
    const neu2 = `${HOME}/neu2`;
    const { run, tasks } = await pflege({
      catalog: withProgramme([{ url: plaetze, kind: "html", use: "verfuegbarkeit" }]),
      pages: {
        [HOME]: html(`<a href="${URL_C}">Babymassage</a> <a href="${neu2}">Babymassage 2</a>`),
        [URL_A]: KRABBEL,
        [plaetze]: html("<p>freie Plätze</p>"),
        [URL_C]: MASSAGE,
        [neu2]: MASSAGE,
      },
    });
    expect(run.rows[0]?.kandidaten).toHaveLength(2);
    expect(tasks).toEqual([plaetze]);
  });

  it("Ziel 3 als Durchlauf: erst deckungsgleich, dann 404 der alten Seite seit zwei Tagen → würde anhängen", async () => {
    const pages = { ...PAGES, [URL_A]: MASSAGE };
    const first = await pflege({ pages, raws: { [P]: raw({ [A]: unit([massage(URL_A)]) }) } });
    expect(first.run.rows[0]?.kandidaten.map((k) => k.ergebnis)).toEqual(["deckungsgleich"]);
    const state = first.run.states.nuernberg;
    if (!state) throw new Error("Zustand fehlt");
    const gone = unit([massage(URL_A)], {
      status: "fehler",
      reason: "HTTP 404",
      klasse: "dauerhaft",
      klasseSince: "2026-10-04T03:00:00+02:00",
      failingSince: "2026-10-04T03:00:00+02:00",
    });
    const second = await pflege({ pages: { ...pages, [URL_A]: "" }, raws: { [P]: raw({ [A]: gone }) }, state });
    expect(second.run.rows[0]?.ersatzFuer).toEqual([URL_A]);
    expect(second.run.append.map((a) => a.page.url)).toEqual([URL_C]);
  });

  it("Ruhezeit hält im nächsten Lauf (ohne Modellaufruf), --katalog ignoriert sie", async () => {
    const pages = { ...PAGES, [URL_A]: MASSAGE };
    const raws = { [P]: raw({ [A]: unit([massage(URL_A)]) }) };
    const first = await pflege({ pages, raws });
    const state = first.run.states.nuernberg;
    const again = await pflege({ pages, raws, ...(state ? { state } : {}), today: "2026-10-13" });
    expect(again.seen).toHaveLength(0);
    expect(again.run.rows[0]?.kandidaten.map((k) => k.ergebnis)).toEqual(["ruhe"]);
    const katalog = await pflege({ pages, raws, ...(state ? { state } : {}), today: "2026-10-13", ignoreRest: true });
    expect(katalog.seen).toHaveLength(1);
  });

  it("abgelehnte URL nie wieder", async () => {
    const state: DiscoverState = {
      ...emptyState("nuernberg"),
      abgelehnt: [{ url: URL_C, anbieter: P, grund: "fremder Veranstalter", datum: "2026-10-01" }],
    };
    const { run, seen } = await pflege({ pages: PAGES, state });
    expect(seen).toHaveLength(0);
    expect(run.rows[0]?.kandidaten).toEqual([]);
  });

  it("Orts-hint → nur Bericht, nicht in der Liste „würde anhängen“", async () => {
    const { run } = await pflege({ pages: PAGES, catalog: withProgramme([], "Termine an der Außenstelle weglassen") });
    expect(run.append).toEqual([]);
    expect(run.rows[0]?.nurBericht).toMatch(/Orts-hint/);
    expect(run.report).toMatch(/## Nur berichtet \(1\)/);
  });

  it("Hinweis einer Terminseite: würde anhängen, mit Vermerk für die Abnahme je Seite", async () => {
    const { run } = await pflege({ pages: PAGES, catalog: withProgramme([], "nur Kurse mit Baby") });
    expect(run.append.map((a) => a.page.url)).toEqual([URL_C]);
    expect(run.rows[0]?.kandidaten[0]?.hinweise).toEqual([
      "Hinweise der Terminseiten gelten hier nicht: „nur Kurse mit Baby“",
    ]);
  });

  it("Sitzungsparameter: Katalogseite mit ?PHPSESSID ist kein Kandidat, zwei sid-Varianten ergeben einen Beweis (M1)", async () => {
    const { run, seen } = await pflege({
      pages: {
        [HOME]: html(
          `<a href="${URL_A}?PHPSESSID=abc">Programm</a> <a href="${URL_C}?sid=1">Babymassage</a> <a href="${URL_C}?sid=2">Babymassage</a>`,
        ),
        [`${URL_A}?PHPSESSID=abc`]: MASSAGE,
        [URL_A]: KRABBEL,
        [`${URL_C}?sid=1`]: MASSAGE,
        [`${URL_C}?sid=2`]: MASSAGE,
      },
    });
    expect(seen.map((s) => s.unit)).toEqual([`seite:${URL_C}`]);
    expect(run.rows[0]?.kandidaten.map((k) => k.url)).toEqual([URL_C]);
  });

  it("Ausnahme im Beweis: Ergebnis fehler, der Lauf geht weiter und schreibt Bericht und Zustand (M2)", async () => {
    const { run } = await pflege({
      pages: PAGES,
      catalog: withProgramme([{ url: `${HOME}/plaetze`, kind: "html", use: "verfuegbarkeit" }]),
      fetchTask: () => {
        throw new Error("Netz weg");
      },
    });
    expect(run.rows[0]?.kandidaten).toMatchObject([{ ergebnis: "fehler", grund: expect.stringMatching(/Netz weg/) }]);
    expect(run.states.nuernberg?.gepflegt).toEqual([{ anbieter: P, datum: TODAY }]);
  });

  it("Zeitbudget: Lauf endet geordnet, der angefangene Anbieter gilt nicht als gepflegt", async () => {
    let t = 0;
    const { run } = await pflege({ pages: PAGES, clock: () => (t += 61 * 60_000) });
    expect(run.abort).toBe("zeit");
    expect(run.states.nuernberg?.gepflegt).toEqual([]);
  });
});

describe("pflegeArgsError (E5, E6, M3)", () => {
  it("nur mit --abruf neu, --katalog nur mit --dry-run, bis S2 nur Trockenlauf", () => {
    expect(pflegeArgsError({ dryRun: true, abruf: "alt" })).toMatch(/robots\.txt/);
    expect(pflegeArgsError({ dryRun: false, katalog: "k.yaml", abruf: "neu" })).toMatch(/--katalog nur mit --dry-run/);
    expect(pflegeArgsError({ dryRun: false, abruf: "neu" })).toMatch(/S2/);
    expect(pflegeArgsError({ dryRun: true, katalog: "k.yaml", abruf: "neu" })).toBeUndefined();
  });
});
