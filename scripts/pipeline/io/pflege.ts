/**
 * Pflegelauf bekannter Anbieter (Plan 0049, E5), Trockenlauf (S1): je Anbieter die Website erkunden
 * (`lib/site-crawl.ts`), bis zu 5 Kandidaten per Ertragsbeweis prüfen (E2) und das Ergebnis berichten. Der Beweis
 * extrahiert nur die Einheit des Kandidaten mit ihren Beilagen in ein frisches Verzeichnis unter
 * `runs/<datum>/pflege/beweis/` (B1) und schreibt nie nach `data/`. Anhängen, G1–G4 und Commit kommen mit S2.
 * Die reine Logik steht in `lib/pflege.ts`.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RegionId } from "../../../src/domain/regions.ts";
import type { Anbieter, Offer, OffersFile, Provider } from "../../../src/domain/schema.ts";
import { type BrakeKind, type Brakes, brakeHit, costJsonl, summarizeCosts } from "../lib/cost.ts";
import type { DiscoverState, PflegeErgebnis, Seite } from "../lib/discover-state.ts";
import type { CallRecord, ExtractKeyParts, Extractor } from "../lib/extract.ts";
import { type PageOutcome, programmeText } from "../lib/fetch.ts";
import {
  careOrder,
  comparisonRaws,
  durableUnitIds,
  inRest,
  judgeProof,
  listPages,
  neighborIds,
  nextState,
  ortsHint,
  pflegeReport,
  type ReportCandidate,
  type ReportRow,
  rejectedUrls,
  seiteKey,
  simulateNight,
  standOf,
  termineHints,
  withCandidate,
} from "../lib/pflege.ts";
import type { ProviderRaw } from "../lib/raw.ts";
import { isRelevant } from "../lib/relevance.ts";
import { type PageTask, pageTask } from "../lib/select.ts";
import {
  type Candidate,
  type CrawlFetch,
  type CrawlResult,
  type CrawlScope,
  candidatesOf,
  crawlScope,
  exploreSite,
  umbrellaHosts,
} from "../lib/site-crawl.ts";
import { PART_MAX_CHARS, splitInput } from "../lib/split.ts";
import { unitIdOf } from "../lib/units.ts";
import { canonicalUrl } from "../lib/url.ts";
import { proofInput } from "./fetch-inputs.ts";
import { readRaw } from "./files.ts";
import { refreshProvider } from "./refresh.ts";

interface PflegeDeps {
  /** Abruf der Erkundung je Anbieter (`crawlFetcher` mit gemeinsamer Warteschlange je Host) */
  crawlFetch: (scope: CrawlScope) => (url: string, remaining: number) => Promise<CrawlFetch>;
  /** eine Beilage abrufen wie der Nachtlauf (`fetchOutcome` über die Warteschlange je Host, M5) */
  fetchTask: (task: PageTask) => Promise<PageOutcome>;
  extractor: Extractor;
}

export interface PflegeOptions {
  /** wirksamer Katalog (`data/providers.yaml` bzw. `--katalog`) */
  catalog: readonly Provider[];
  /** Teilnehmer nach Region und `--only` (role anbieter ohne `coveredBy`/`skipCrawl`) */
  participants: readonly string[];
  /** Zustand je Anbieter aus `data/raw` */
  raws: Readonly<Record<string, ProviderRaw>>;
  previous: OffersFile | undefined;
  /** Zustand je Region (`data/discover/<region>.json`) */
  states: Readonly<Partial<Record<RegionId, DiscoverState>>>;
  /** YYYY-MM-DD, Europe/Berlin */
  today: string;
  /** Zeitpunkt mit Offset */
  now: () => string;
  freeDays: Record<string, string>;
  /** Schlüssel wie im Nachtlauf (Modell, M2) */
  keyParts: ExtractKeyParts;
  /** `runs/<datum>/pflege` */
  runDir: string;
  /** `--katalog`: Ruhezeiten gelten nicht (E4) */
  ignoreRest: boolean;
  brakes: Brakes;
  budgetMin: number;
  /** Uhr in ms (Zeitbudget), nur für Tests */
  clock?: () => number;
  signal: AbortSignal;
  log: (line: string) => void;
  modell: string;
  deps: PflegeDeps;
}

/** Seite, die ein Live-Lauf anhängen würde (S2: `appendProgramme`) */
interface WouldAppend {
  anbieter: string;
  page: Anbieter["programme"][number];
  neu: Offer[];
}

export interface PflegeRun {
  rows: ReportRow[];
  /** nächster Zustand je Region (Trockenlauf: nur nach `runDir`) */
  states: Partial<Record<RegionId, DiscoverState>>;
  calls: CallRecord[];
  append: WouldAppend[];
  abort?: "auth" | "limit" | "zeit" | "abgebrochen" | BrakeKind;
  report: string;
}

type Stop = NonNullable<PflegeRun["abort"]>;

/**
 * Argumente von `pipeline pflege` (E5, E6, M3): nur mit robots.txt (`--abruf neu`, ADR 0033, Punkt 1), `--katalog` nur
 * im Trockenlauf; bis S2 gibt es nur den Trockenlauf. Fehlertext oder undefined.
 */
export function pflegeArgsError(a: {
  dryRun: boolean;
  katalog?: string | undefined;
  abruf: string;
}): string | undefined {
  if (a.abruf !== "neu") return "pflege ruft nur mit robots.txt ab (--abruf neu, ADR 0033, Punkt 1)";
  if (a.katalog !== undefined && !a.dryRun) return "--katalog nur mit --dry-run (E6)";
  if (!a.dryRun) return "pflege ohne --dry-run kommt mit Plan 0049, S2 (Anhängen); bis dahin nur --dry-run";
  return undefined;
}

/**
 * Pflegelauf (E5) über `participants` in der Reihenfolge `careOrder`, bis Zeitbudget, Bremse oder ein Abbruch des
 * Modells greift; ein angefangener Anbieter zählt dann nicht als gepflegt. Schreibt Bericht, Zustand je Region und
 * `kosten.jsonl` nach `runDir`.
 */
export async function runPflege(o: PflegeOptions): Promise<PflegeRun> {
  const clock = o.clock ?? Date.now;
  const started = clock();
  const comparison = comparisonRaws(o.raws, o.catalog, o.today);
  const rejected = rejectedUrls(Object.values(o.states).filter((s) => s !== undefined));
  const umbrellas = umbrellaHosts(o.catalog);
  const byId = new Map(o.catalog.map((p) => [p.id, p] as const));
  const durable = new Map(o.participants.map((id) => [id, durableUnitIds(o.raws[id], o.today)] as const));
  const gepflegt = Object.values(o.states).flatMap((s) => s?.gepflegt ?? []);
  const order = careOrder(
    o.participants.map((id) => ({ id, durable: (durable.get(id)?.length ?? 0) > 0 })),
    gepflegt,
  );
  const calls: CallRecord[] = [];
  const rows: ReportRow[] = [];
  const append: WouldAppend[] = [];
  const checked: Seite[] = [];
  const cared: string[] = [];
  const seen = new Map<string, Set<string>>();
  let abort: Stop | undefined;
  const stopNow = (): Stop | undefined => {
    if (o.signal.aborted) return "abgebrochen";
    if (clock() - started > o.budgetMin * 60_000) return "zeit";
    return brakeHit(calls, o.brakes);
  };

  for (const id of order) {
    abort ??= stopNow();
    if (abort) break;
    const provider = byId.get(id);
    if (provider?.role !== "anbieter") continue;
    const region = o.states[provider.region];
    const stand = standOf(provider, o.raws[id], o.today);
    const isDurable = (durable.get(id)?.length ?? 0) > 0;
    const prior = new Map((region?.seiten ?? []).filter((s) => s.anbieter === id).map((s) => [seiteKey(s.url), s]));
    const resting = new Set<string>();
    const skip = (url: string) => {
      if (rejected(url)) return true;
      if (o.ignoreRest || !inRest(prior.get(seiteKey(url)), { stand, durable: isDurable, today: o.today }))
        return false;
      resting.add(url);
      return true;
    };
    const scope = crawlScope(provider, o.catalog, umbrellas);
    let crawl: CrawlResult;
    try {
      crawl = await exploreSite(scope, o.deps.crawlFetch(scope));
    } catch (e) {
      rows.push({ id, fetches: 0, gesperrt: [], kandidaten: [], fehler: (e as Error).message });
      continue;
    }
    const candidates = candidatesOf(crawl, scope, o.today, skip);
    const row: ReportRow = {
      id,
      fetches: crawl.fetches,
      gesperrt: crawl.gesperrt,
      kandidaten: [],
      ...(isDurable ? { ersatzFuer: (durable.get(id) ?? []).map((u) => u.replace(/^seite:/, "")) } : {}),
      ...(ortsHint(provider) ? { nurBericht: "Orts-hint an einer Terminseite: Ort von Hand prüfen" } : {}),
    };
    const kandidaten: ReportCandidate[] = [...resting].map((url) => ({
      url,
      kind: "html",
      browser: false,
      future: 0,
      ergebnis: "ruhe",
      grund: `geprüft am ${prior.get(seiteKey(url))?.geprueft}: ${prior.get(seiteKey(url))?.ergebnis}`,
      neu: [],
      hinweise: [],
    }));
    const beilagen = beilagenOf(o, provider);
    let n = 0;
    for (const cand of candidates) {
      abort ??= stopNow();
      if (abort) break;
      const proof = await prove(o, { provider, cand, crawl, comparison, beilagen, n: n++ });
      calls.push(...proof.calls);
      if (proof.abort) {
        abort = proof.abort;
        break;
      }
      const url = proof.page.url;
      checked.push({
        url,
        anbieter: id,
        geprueft: o.today,
        ergebnis: proof.ergebnis,
        ...(proof.grund ? { grund: proof.grund.slice(0, 300) } : {}),
        stand,
      });
      kandidaten.push({
        url,
        kind: cand.kind,
        browser: cand.browser,
        future: cand.future,
        ergebnis: proof.ergebnis,
        ...(proof.grund ? { grund: proof.grund } : {}),
        neu: proof.neu.map((x) => ({
          title: x.title,
          first: x.sessions.find((s) => s.start >= o.today)?.start ?? x.sessions[0]?.start ?? "",
        })),
        hinweise: proof.hinweise,
      });
      if (proof.ergebnis === "anhaengen" && !row.nurBericht)
        append.push({ anbieter: id, page: proof.page, neu: proof.neu });
      o.log(`  ${id}: ${proof.ergebnis} ${url}${proof.grund ? ` (${proof.grund})` : ""}`);
    }
    rows.push({ ...row, kandidaten });
    if (abort) break;
    cared.push(id);
    seen.set(id, new Set([...candidates.map((c) => c.url), ...resting]));
    o.log(
      `${cared.length}/${order.length} ${id}: ${crawl.fetches} Abrufe, ${candidates.length} Kandidaten, ${resting.size} in Ruhe`,
    );
  }

  const states: Partial<Record<RegionId, DiscoverState>> = {};
  for (const [regionId, s] of Object.entries(o.states) as Array<[RegionId, DiscoverState | undefined]>) {
    if (!s) continue;
    const inRegion = (pid: string) => byId.get(pid)?.region === regionId;
    states[regionId] = nextState(s, {
      cared: cared.filter(inRegion),
      checked: checked.filter((c) => inRegion(c.anbieter)),
      seen: new Map([...seen].filter(([pid]) => inRegion(pid))),
      today: o.today,
    });
  }
  const costs = summarizeCosts(calls, { cached: 0 });
  const report = pflegeReport({
    date: o.today,
    modus: "trocken",
    modell: o.modell,
    dauerMin: Math.round((clock() - started) / 60_000),
    abort,
    kosten: `${costs.total.calls} Aufrufe, ${costs.total.costUsd.toFixed(2)} $ (Schätzung zum API-Gegenwert)`,
    rows,
  });
  mkdirSync(o.runDir, { recursive: true });
  writeFileSync(join(o.runDir, "report.md"), report);
  writeFileSync(join(o.runDir, "kosten.jsonl"), costJsonl(calls, { run: "pflege", date: o.today }));
  for (const [regionId, s] of Object.entries(states))
    writeFileSync(join(o.runDir, `${regionId}.json`), `${JSON.stringify(s, null, 2)}\n`);
  writeFileSync(join(o.runDir, "anhaengen.json"), `${JSON.stringify(append, null, 2)}\n`);
  return { rows, states, calls, append, report, ...(abort ? { abort } : {}) };
}

/** Beilagen (`use: verfuegbarkeit`) eines Anbieters: einmal je Anbieter abgerufen, von allen Kandidaten geteilt (M5) */
function beilagenOf(o: PflegeOptions, provider: Anbieter): () => Promise<Map<number, PageOutcome>> {
  let loading: Promise<Map<number, PageOutcome>> | undefined;
  return () => {
    loading ??= (async () => {
      const out = new Map<number, PageOutcome>();
      for (const [i, g] of provider.programme.entries())
        if (g.use === "verfuegbarkeit" && g.blocked === undefined)
          out.set(i, await o.deps.fetchTask(pageTask(g, o.today)));
      return out;
    })();
    return loading;
  };
}

interface Proof {
  page: Anbieter["programme"][number];
  ergebnis: PflegeErgebnis;
  grund?: string;
  neu: Offer[];
  hinweise: string[];
  calls: CallRecord[];
  abort?: Stop;
}

/**
 * Ertragsbeweis einer Kandidatenseite (E2): Katalogeintrag mit dem Kandidaten als letzter Seite (kanonische URL),
 * Text aus der Erkundung (M5), Beilagen einmal je Anbieter, `refreshProvider` ohne Vorstand in ein frisches
 * Verzeichnis (B1), simulierter Nachtlauf, Urteil.
 */
async function prove(
  o: PflegeOptions,
  c: {
    provider: Anbieter;
    cand: Candidate;
    crawl: CrawlResult;
    comparison: Readonly<Record<string, ProviderRaw>>;
    beilagen: () => Promise<Map<number, PageOutcome>>;
    n: number;
  },
): Promise<Proof> {
  const { provider, cand } = c;
  const url = canonicalUrl(cand.url) ?? cand.url;
  const page: Anbieter["programme"][number] = {
    url,
    kind: cand.kind,
    ...(cand.browser ? { render: "browser" as const } : {}),
    use: "termine",
  };
  const done = (ergebnis: PflegeErgebnis, grund?: string, more: Partial<Proof> = {}): Proof => ({
    page,
    ergebnis,
    ...(grund ? { grund } : {}),
    neu: [],
    hinweise: [],
    calls: [],
    ...more,
  });
  const fetched = c.crawl.pages.find((p) => p.result.ok && p.result.finalUrl === cand.url)?.result;
  if (!fetched?.ok) return done("fehler", "Seite der Erkundung fehlt");
  const hinweise = listPages(fetched.page.links) ? ["Liste blättert"] : [];
  const text =
    cand.kind === "html"
      ? programmeText("html", fetched.html, fetched.finalUrl)
      : cand.kind === "ical"
        ? programmeText("ical", fetched.page.text, fetched.finalUrl)
        : fetched.page.text;
  const entry = withCandidate(provider, page);
  const unitId = unitIdOf(page);
  const outcome: PageOutcome = {
    url,
    art: cand.browser ? "browser" : cand.kind,
    ok: true,
    text,
    ms: 0,
    ...(fetched.finalUrl !== url ? { finalUrl: fetched.finalUrl } : {}),
  };
  const outcomes = new Map(await c.beilagen());
  outcomes.set(entry.programme.length - 1, outcome);
  const input = proofInput(entry, unitId, outcomes);
  const unit = input.units[0];
  if (input.status === "fehler")
    return done("abgeschnitten", `${input.reason ?? "Eingabe zu groß"}; partChars prüfen`, { hinweise });
  if (
    unit &&
    splitInput(unit.text, PART_MAX_CHARS, { pageUrls: unit.pages.map((p) => p.url), candidates: 0 }).parts.length > 1
  )
    return done("abgeschnitten", `Eingabe wird geteilt (${unit.text.length} Zeichen); partChars prüfen`, { hinweise });

  // frisch je Kandidat: ein früherer Beweis darf nicht als Vorstand gelten (B1)
  const dir = join(o.runDir, "beweis", provider.id, String(c.n));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const now = o.now();
  const r = await refreshProvider({
    provider: entry,
    fetched: input,
    extractor: o.deps.extractor,
    signal: o.signal,
    keyParts: o.keyParts,
    freeDays: o.freeDays,
    today: o.today,
    now,
    rawDir: dir,
    outDir: dir,
  });
  if (r.kind === "abort") return done("fehler", `Abbruch (${r.abort})`, { calls: r.calls, abort: r.abort });
  if (r.kind === "abgebrochen") return done("fehler", "abgebrochen", { calls: r.calls, abort: "abgebrochen" });
  const raw = readRaw(dir, provider.id);
  const state = raw && "version" in raw ? raw.units[unitId] : undefined;
  const result = r.units[unitId];
  if (!state || result !== "extrahiert")
    return done(result === "leer" ? "ohne-ertrag" : "fehler", state?.reason ?? `Extraktion: ${result ?? "fehlt"}`, {
      calls: r.calls,
      hinweise,
    });
  const neighbors = neighborIds(provider, o.catalog);
  const sim = simulateNight({
    comparison: c.comparison,
    catalog: o.catalog,
    entry,
    unitId,
    unit: state,
    previous: o.previous,
    today: o.today,
    freeDays: o.freeDays,
    now,
    neighbors,
  });
  if (sim.errors.length > 0) return done("fehler", `Build: ${sim.errors.join("; ")}`, { calls: r.calls, hinweise });
  const v = judgeProof({
    ...sim,
    relevant: isRelevant(unit?.text ?? text),
    today: o.today,
    extracted: state.status === "ok",
  });
  const hints = v.ergebnis === "anhaengen" ? termineHints(provider) : [];
  if (hints.length > 0)
    hinweise.push(`Hinweise der Terminseiten gelten hier nicht: ${hints.map((h) => `„${h}“`).join(" / ")}`);
  return done(v.ergebnis, v.grund, { calls: r.calls, hinweise, neu: v.neu });
}
