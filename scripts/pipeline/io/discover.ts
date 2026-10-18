/**
 * `pnpm pipeline discover` (Plan 0032, E7): je Region Kandidaten sammeln (Sammelkalender, Verzeichnisse, Websuche),
 * vorfiltern, bewerten, geocodieren, Ertragsbeweis über `refreshProvider` (derselbe Extraktionsweg wie der Nachtlauf,
 * E1), IDs vergeben und im Modus live je Anbieter committen (G1, G2, G3, G4). Zustand `data/discover/<region>.json`,
 * Kosten nach `runs/<datum>/discover/kosten.jsonl` und eine Zeile je Region nach `data/kosten.csv`.
 *
 * `--dry-run`: alle Schritte echt, aber Katalog, Zustand, Rohdaten und `kosten.csv` nur nach `runs/<datum>/discover/`,
 * kein Commit, kein Issue. Die reine Logik liegt in `lib/discover.ts`.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { REGION_IDS, REGIONS, type RegionId } from "../../../src/domain/regions.ts";
import type { Anbieter, Offer, Provider } from "../../../src/domain/schema.ts";
import { addMonths, toBerlinIso } from "../../../src/domain/time.ts";
import { batchesFromRaw, buildOffers, HORIZON_MONTHS } from "../lib/build-offers.ts";
import type { Candidate } from "../lib/candidate.ts";
import { appendEntries } from "../lib/catalog-yaml.ts";
import { appendCsvRow, type BrakeKind, type Brakes, brakeHit, costJsonl, summarizeCosts } from "../lib/cost.ts";
import {
  type Adopted,
  abortOf,
  aggregatorFinds,
  allowedUrlsOf,
  assessMessage,
  assessResponseSchema,
  contactLinks,
  type DiscoverReport,
  directoryFinds,
  dryRunCatalogIssues,
  entryFromAssessment,
  type FetchedFind,
  type Find,
  findsFromSearch,
  hiddenEval,
  hideProviders,
  hostOf,
  isPdf,
  newProviderCommitMessage,
  parseAssessment,
  postpone,
  prefilter,
  proveYield,
  type RegionReport,
  renderDiscoverReport,
  reservedIds,
  sameSite,
  searchMessage,
  searchResponseSchema,
  staleHints,
} from "../lib/discover.ts";
import { DiscoverState, emptyState } from "../lib/discover-state.ts";
import type { CallRecord, ExtractKeyParts, Extractor } from "../lib/extract.ts";
import { botWall } from "../lib/fetch.ts";
import { type FreeDaysByNetwork, networksOfRegions } from "../lib/holidays.ts";
import { extractPage, type FetchedPage } from "../lib/html-extract.ts";
import { anbieterVids } from "../lib/match.ts";
import { placeholderWindow } from "../lib/placeholders.ts";
import { planFetch } from "../lib/select.ts";
import { GateError } from "./discover-git.ts";
import type { fetchInputs } from "./fetch-inputs.ts";
import { readCatalog, readJson, readRaw, readRawDir, writeJson } from "./files.ts";
import type { GeoResult } from "./geocode.ts";
import { type FreeDaysLoader, loadFreeDaysByNetwork } from "./holidays.ts";
import { callLlm, type LlmCall, type LlmOptions } from "./llm.ts";
import { refreshProvider } from "./refresh.ts";
import { fetchSource } from "./sources.ts";

/** Zeitbudget des Entdeckens in Minuten (`RUN_BUDGET_MIN`); der Workflow hat 120 Minuten */
export const DISCOVER_BUDGET_MIN = 90;

/** Ergebnis eines Modellschritts des Entdeckens */
export interface StepReply {
  output: unknown;
  call: CallRecord;
  abort: "auth" | "limit" | null;
}

/** Was der Lauf von außen braucht; Tests ersetzen alles mit Netz, Modell oder Geocoder. */
export interface DiscoverDeps {
  search(term: string, regionName: string, signal: AbortSignal): Promise<StepReply>;
  assess(find: Find, message: string, signal: AbortSignal): Promise<StepReply>;
  fetchPage(url: string, opts?: { timeoutMs?: number; retries?: number }): Promise<FetchedPage>;
  /** Text eines PDF über `pdftotext` wie im Abruf des Nachtlaufs (`io/fetch-inputs.ts`) */
  fetchPdfText(url: string): Promise<string>;
  geocode(address: string): Promise<GeoResult | undefined>;
  extractor: Extractor;
  fetchInputs: typeof fetchInputs;
  /** Kandidaten der Sammelkalender (Adapter) dieser Region */
  aggregatorCandidates(
    catalog: readonly Provider[],
    aggregators: readonly Provider[],
    today: string,
  ): Promise<Candidate[]>;
  freeDays: FreeDaysLoader;
}

export interface DiscoverOptions {
  regions: readonly RegionId[];
  /** enthält providers.yaml, raw/, discover/, kosten.csv */
  dataDir: string;
  /** runs/<datum>/discover: Bericht, Kosten; im Trockenlauf auch Katalog, Zustand, raw/ und kosten.csv */
  runDir: string;
  /** YYYY-MM-DD, Europe/Berlin */
  today: string;
  dryRun: boolean;
  /** G3 je Region */
  maxNew: number;
  terms: readonly string[];
  brakes: Brakes;
  budgetMin: number;
  keyParts: ExtractKeyParts;
  deps: DiscoverDeps;
  /** „Jetzt“ mit Offset für Ertragsbeweis und Zustand (Tests); Standard die Uhr */
  now?: () => string;
  /**
   * Fortschritt: Namen, URLs und Gründe, die zum Teil aus Modell und Webtext stammen (wie der Bericht im Summary,
   * E10); nie ganze Modellantworten (E2 „Logs“). Standard keiner.
   */
  log?: (line: string) => void;
  /**
   * Modus live (nicht im Trockenlauf): Commit eines neuen Anbieters nach G2 und G1. Wirft `GateError` (G1 rot: nicht
   * aufgenommen, Lauf geht weiter) oder einen anderen Fehler (G2, fremde Änderungen: Lauf bricht ab).
   */
  commit?: (id: string, message: string) => void;
  /**
   * Entdecken-Eval (E9): diese Anbieter gelten im Lauf als unbekannt; der Bericht sagt, welche wiedergefunden
   * wurden. Nur im Trockenlauf.
   */
  hide?: readonly string[];
}

const SEARCH_PROMPT = fileURLToPath(new URL("../prompt/discover-search.md", import.meta.url));
const ASSESS_PROMPT = fileURLToPath(new URL("../prompt/discover-assess.md", import.meta.url));
/** Websuche: mehrere Suchen und Seitenabrufe plus Abschluss über StructuredOutput (S1.1: mindestens 8) */
const SEARCH_MAX_TURNS = 10;
/** Bewerten ohne Werkzeuge: Antwort plus Abschluss (S1.1: mindestens 3) */
const ASSESS_MAX_TURNS = 3;

/** Modellschritte über `io/llm.ts` (E2); Modell `LLM_MODEL_DISCOVER`, Standard Haiku. */
export function createDiscoverModel(
  opts: LlmOptions & { model?: string } = {},
): Pick<DiscoverDeps, "search" | "assess"> {
  const model = opts.model ?? process.env["LLM_MODEL_DISCOVER"] ?? "haiku";
  const llmOpts: LlmOptions = { ...(opts.bin ? { bin: opts.bin } : {}), ...(opts.env ? { env: opts.env } : {}) };
  const step = async (kind: "search" | "assess", id: string, call: Omit<LlmCall, "model">): Promise<StepReply> => {
    const reply = await callLlm({ ...call, model }, llmOpts);
    // unter dontAsk meldet die CLI trotz abgelehnter Websuche Erfolg (S1.1): dann zählt die Antwort nicht
    const denied = reply.permissionDenials.length > 0;
    const result: CallRecord["result"] = reply.abort
      ? "abort"
      : reply.truncated
        ? "truncated"
        : reply.output == null || denied
          ? "error"
          : "ok";
    return {
      output: result === "ok" ? reply.output : null,
      abort: reply.abort,
      call: {
        step: kind,
        providerId: id,
        model,
        inputTokens: reply.usage.inputTokens,
        outputTokens: reply.usage.outputTokens,
        cacheReadTokens: reply.usage.cacheReadTokens,
        cacheCreationTokens: reply.usage.cacheCreationTokens,
        webSearchRequests: reply.usage.webSearchRequests,
        turns: reply.turns,
        durationMs: reply.durationMs,
        costUsd: reply.costUsd,
        result,
      },
    };
  };
  return {
    search: (term, regionName, signal) =>
      step("search", `suche:${term}`, {
        systemPromptFile: SEARCH_PROMPT,
        user: searchMessage(term, regionName),
        tools: "web",
        schema: searchResponseSchema(),
        maxTurns: SEARCH_MAX_TURNS,
        signal,
      }),
    assess: (find, message, signal) =>
      step("assess", hostOf(find.url) ?? find.url, {
        systemPromptFile: ASSESS_PROMPT,
        user: message,
        tools: "none",
        schema: assessResponseSchema(),
        maxTurns: ASSESS_MAX_TURNS,
        signal,
      }),
  };
}

/**
 * Kandidaten der Sammelkalender einer Region über ihre Adapter (`io/sources.ts`, Fenster wie im Nachtlauf). Ein
 * ausgefallener Adapter kostet nur seine Kandidaten; der Grund steht im Log.
 */
export async function fetchAggregatorCandidates(
  catalog: readonly Provider[],
  aggregators: readonly Provider[],
  today: string,
): Promise<Candidate[]> {
  const { von, bis } = placeholderWindow(today);
  const results = await Promise.allSettled(
    aggregators.flatMap((a) =>
      a.role === "aggregator" ? [fetchSource(a.adapter, von, bis, { vids: anbieterVids(catalog, a.id) })] : [],
    ),
  );
  return results.flatMap((r) => {
    if (r.status === "fulfilled") return r.value.candidates;
    console.error(`✗ Sammelkalender: ${reasonOf(r.reason)}`);
    return [];
  });
}

/** Zustand einer Region lesen (fehlt die Datei: leer) */
function readState(dataDir: string, region: RegionId): DiscoverState {
  const file = join(dataDir, "discover", `${region}.json`);
  return existsSync(file) ? DiscoverState.parse(readJson(file)) : emptyState(region);
}

const reasonOf = (e: unknown) => (e instanceof Error ? e.message.split("\n")[0] : String(e))?.slice(0, 200) ?? "";

/** Geocoder gesperrt oder gedrosselt (Nominatim): Kandidat zurückstellen, nicht verwerfen (E7.5) */
const GEOCODER_BLOCKED = /HTTP (403|429)/;

export async function runDiscover(o: DiscoverOptions): Promise<DiscoverReport> {
  const started = performance.now();
  const elapsedMin = () => (performance.now() - started) / 60_000;
  const controller = new AbortController();
  const log = o.log ?? (() => undefined);
  const calls: CallRecord[] = [];
  let abort: DiscoverReport["abort"];
  let brake: BrakeKind | undefined;
  let budgetHit = false;
  let geocoderBlocked = false;
  /** Bremse, Zeitbudget, Abbruch: vor jedem Modellschritt geprüft (E8) */
  const halted = (): boolean => {
    if (abort) return true;
    brake ??= brakeHit(calls, o.brakes);
    if (!brake && elapsedMin() >= o.budgetMin) budgetHit = true;
    return brake !== undefined || budgetHit;
  };
  const stop = (a: "auth" | "limit") => {
    abort ??= a;
    controller.abort();
  };

  const catalogFile = join(o.dataDir, "providers.yaml");
  const outCatalog = o.dryRun ? join(o.runDir, "providers.yaml") : catalogFile;
  const outRaw = o.dryRun ? join(o.runDir, "raw") : join(o.dataDir, "raw");
  // Ertragsbeweis schreibt erst hierhin; nur Aufgenommene kommen nach data/raw (ein Verworfener hinterließe sonst
  // eine Datei ohne Katalogeintrag)
  const proofRaw = join(o.runDir, "beweis");
  let catalog: Provider[] = readCatalog(catalogFile);
  let catalogText = readFileSync(catalogFile, "utf8");
  let hidden: Provider[] | undefined;
  if (o.hide && o.hide.length > 0) {
    if (!o.dryRun) throw new Error("--hide nur im Trockenlauf (--dry-run)");
    ({ catalog, text: catalogText, hidden } = hideProviders(catalog, catalogText, o.hide));
    const outside = hidden.filter((p) => !o.regions.includes(p.region)).map((p) => p.id);
    if (outside.length > 0) throw new Error(`--hide: nicht in den Regionen des Laufs: ${outside.join(", ")}`);
  }
  const originalCatalogText = catalogText;
  // zurückgenommene IDs aller Regionen: IDs sind global (ADR 0022)
  const allStates = REGION_IDS.map((r) => readState(o.dataDir, r));
  const reserved = reservedIds(allStates);
  // Sperren aller Regionen: Die Regionen überlappen, ein Abgelehnter darf nicht über die Nachbarregion zurückkommen
  // (Plan 0036, E4)
  const abgelehnt = allStates.flatMap((st) => st.abgelehnt);
  // Ferien der Netze der Regionen dieses Laufs; der Ertragsbeweis rechnet je Anbieter mit seinem Netz (Plan 0039, E6)
  const freeDays = await loadFreeDaysByNetwork(
    networksOfRegions(o.regions),
    addMonths(o.today, -12),
    addMonths(o.today, 24),
    o.deps.freeDays,
  );
  const horizon = { from: o.today, to: addMonths(o.today, HORIZON_MONTHS) };
  const regions: RegionReport[] = [];
  const states: DiscoverState[] = [];
  const csvRows: Array<{ region: RegionId; calls: CallRecord[]; adopted: number }> = [];

  for (const region of o.regions) {
    const regionName = REGIONS[region].name;
    const callsBefore = calls.length;
    let state = readState(o.dataDir, region);
    const report: RegionReport = { region, finds: 0, dropped: [], adopted: [], rejected: [], hints: [] };
    regions.push(report);
    const reject = (find: Find, grund: string, persist: boolean) => {
      report.rejected.push({ find, grund });
      log(`  ✗ ${find.name} (${find.url}): ${grund}`);
      if (persist) state = postpone(state, find, grund, o.today);
    };

    // 1. Kandidaten aus Sammelkalendern und Verzeichnissen (Code)
    const inRegion = catalog.filter((p) => p.region === region);
    const finds: Find[] = [];
    try {
      const fromAggregators = aggregatorFinds(
        await o.deps.aggregatorCandidates(
          catalog,
          inRegion.filter((p) => p.role === "aggregator"),
          o.today,
        ),
        catalog,
      );
      finds.push(...fromAggregators.finds);
      report.hints.push(...fromAggregators.hints);
    } catch (e) {
      report.hints.push(`Sammelkalender nicht abrufbar: ${reasonOf(e)}`);
    }
    for (const dir of inRegion.filter((p) => p.role === "verzeichnis"))
      for (const g of dir.programme.filter((x) => x.kind === "html" && !x.render && x.use !== "info" && !x.blocked)) {
        try {
          const page = await o.deps.fetchPage(g.url);
          if (page.status >= 400) throw new Error(`HTTP ${page.status}`);
          finds.push(...directoryFinds(dir, extractPage(page.body, page.finalUrl).links));
        } catch (e) {
          report.hints.push(`Verzeichnis ${dir.id} (${g.url}) nicht abrufbar: ${reasonOf(e)}`);
        }
      }

    // 2. Websuche (Modell, tools: web), ein Aufruf je Suchbegriff
    for (const term of o.terms) {
      if (halted()) break;
      const r = await o.deps.search(term, regionName, controller.signal);
      calls.push(r.call);
      if (r.abort) {
        stop(r.abort);
        break;
      }
      const found = r.call.result === "ok" ? findsFromSearch(r.output, term) : { ok: false as const };
      if (found.ok) finds.push(...found.finds);
      else {
        if (r.call.result === "ok") r.call.result = "invalid";
        report.hints.push(`Suche „${term}“ ohne gültige Antwort (${r.call.result})`);
      }
    }
    report.finds = finds.length;

    // 3. Vorfilter (Code)
    const { keep, dropped } = prefilter(finds, { catalog, state, abgelehnt, today: o.today });
    report.dropped.push(...dropped);
    log(
      `${regionName}: ${finds.length} Kandidaten, ${keep.length} nach dem Vorfilter, ${calls.length} Modellaufrufe bisher`,
    );

    // 4.–7. je Kandidat: bewerten, geocodieren, Ertragsbeweis, IDs
    let open = keep.length;
    for (const find of keep) {
      if (report.adopted.length >= o.maxNew) {
        report.hints.push(`G3: höchstens ${o.maxNew} neue Anbieter je Lauf, ${open} Kandidaten nicht bewertet`);
        break;
      }
      if (halted()) {
        report.hints.push(`${open} Kandidaten nicht bewertet (Lauf vorzeitig beendet)`);
        break;
      }
      open--;
      // ein früher in diesem Lauf aufgenommener Anbieter kann denselben Kandidaten schon abdecken
      const again = prefilter([find], { catalog, state, abgelehnt, today: o.today });
      if (again.keep.length === 0) {
        report.dropped.push(...again.dropped);
        continue;
      }

      let page: FetchedPage;
      let fetchedFind: FetchedFind;
      try {
        page = await o.deps.fetchPage(find.url);
        if (page.status >= 400) throw new Error(`HTTP ${page.status}`);
        if (isPdf(page.contentType, page.finalUrl)) {
          // PDF wie im Abruf des Nachtlaufs über pdftotext (Nutzerentscheid nach dem Trockenlauf); ohne Links
          const text = await o.deps.fetchPdfText(page.finalUrl);
          if (text.trim() === "") throw new Error("leeres PDF");
          fetchedFind = { finalUrl: page.finalUrl, text, links: [] };
        } else {
          const extracted = extractPage(page.body, page.finalUrl);
          const wall = botWall(extracted.text);
          if (wall) throw new Error(wall);
          fetchedFind = { finalUrl: page.finalUrl, text: extracted.text, links: extracted.links };
        }
      } catch (e) {
        reject(find, `Seite nicht abrufbar: ${reasonOf(e)}`, true);
        continue;
      }
      // Kontakt- oder Adressseiten derselben Website (Nutzerentscheid Option A); ein Fehler kostet nur diese Seite
      const extra: Array<{ url: string; text: string }> = [];
      for (const url of contactLinks(fetchedFind)) {
        try {
          // kurz und ohne Wiederholung: Zusatzseiten dürfen das Zeitbudget nicht fressen (Arch-Review S4b, m3)
          const p = await o.deps.fetchPage(url, { timeoutMs: 15_000, retries: 0 });
          // eine Weiterleitung darf weder die Website verlassen noch auf eine interne Adresse zeigen (m1)
          if (p.status >= 400 || !sameSite(p.finalUrl, page.finalUrl)) continue;
          const text = extractPage(p.body, p.finalUrl).text;
          if (text && !botWall(text)) extra.push({ url: p.finalUrl, text });
        } catch {
          // ohne diese Seite bewerten
        }
      }
      const a = await o.deps.assess(find, assessMessage(find, fetchedFind, regionName, extra), controller.signal);
      calls.push(a.call);
      if (a.abort) {
        stop(a.abort);
        break;
      }
      const assessed = a.call.result === "ok" ? parseAssessment(a.output) : { kind: "ungueltig" as const };
      if (assessed.kind === "ungueltig") {
        if (a.call.result === "ok") a.call.result = "invalid";
        reject(find, `Bewertung ohne gültige Antwort (${a.call.result})`, false);
        continue;
      }
      if (assessed.kind === "verwerfen") {
        reject(find, assessed.grund, true);
        continue;
      }

      // 5. Geocodieren (≤ 1/s in io/geocode.ts), Orte in der bbox der Region (entryFromAssessment)
      if (geocoderBlocked) {
        reject(find, "zurückgestellt: Geocoder gesperrt", false);
        continue;
      }
      const geos: GeoResult[] = [];
      let geoProblem: { grund: string; persist: boolean } | undefined;
      for (const v of assessed.entry.venues) {
        try {
          const g = await o.deps.geocode(v.address);
          if (!g) {
            geoProblem = { grund: `Adresse nicht gefunden: ${v.address}`, persist: true };
            break;
          }
          geos.push(g);
        } catch (e) {
          const reason = reasonOf(e);
          if (GEOCODER_BLOCKED.test(reason)) geocoderBlocked = true;
          geoProblem = { grund: `zurückgestellt: Geocoder (${reason})`, persist: false };
          break;
        }
      }
      if (geoProblem) {
        reject(find, geoProblem.grund, geoProblem.persist);
        continue;
      }
      const built = entryFromAssessment(assessed.entry, {
        find,
        grund: assessed.grund,
        region,
        catalog,
        reserved,
        today: o.today,
        geos,
        allowedUrls: allowedUrlsOf(find, fetchedFind),
      });
      if (!built.ok) {
        reject(find, built.grund, true);
        continue;
      }
      const entry = built.entry;
      report.hints.push(...built.notes.map((n) => `${entry.id}: ${n}`));

      // 6. Ertragsbeweis über refreshProvider (genau ein Extraktionsweg, E1)
      if (halted()) {
        report.hints.push(`${open + 1} Kandidaten nicht bewertet (Lauf vorzeitig beendet)`);
        break;
      }
      const proof = await proveEntry(o, entry, { proofRaw, controller, freeDays, horizon });
      calls.push(...proof.calls);
      if (proof.kind === "abort") {
        stop(proof.abort);
        break;
      }
      if (proof.kind === "abgebrochen") break;
      if (proof.kind === "nein") {
        reject(find, proof.grund, true);
        continue;
      }

      // 7./8. aufnehmen: Katalog, Rohdaten, im Modus live Commit (G1, G2, G4)
      const adopted: Adopted = {
        id: entry.id,
        name: entry.name,
        region,
        find,
        grund: assessed.grund,
        first: { title: proof.first.title, start: proof.start, url: proof.first.url },
        ...(built.notes.length > 0 ? { notes: built.notes } : {}),
      };
      const nextText = appendEntries(catalogText, [entry]);
      mkdirSync(dirname(outCatalog), { recursive: true });
      writeFileSync(outCatalog, nextText);
      mkdirSync(outRaw, { recursive: true });
      copyFileSync(join(proofRaw, `${entry.id}.json`), join(outRaw, `${entry.id}.json`));
      if (o.commit) {
        try {
          o.commit(entry.id, newProviderCommitMessage(adopted));
        } catch (e) {
          if (e instanceof GateError) {
            reject(find, e.message, false);
            continue;
          }
          throw e;
        }
      }
      catalogText = nextText;
      catalog = [...catalog, entry];
      report.adopted.push(adopted);
      log(`  ✓ ${entry.id} (${find.url}): ${adopted.first.title}`);
    }

    // nach dem Vorfilter übrig, aber nicht bewertet (G3, Bremse, Zeitbudget, Abbruch): für das Entdecken-Eval
    const handled = new Set([...report.adopted, ...report.rejected, ...report.dropped].map((x) => x.find));
    const unassessed = keep.filter((f) => !handled.has(f));
    if (unassessed.length > 0) report.unassessed = unassessed;

    // Hinweise ohne Aktion (E7): Quellen mit Fehlerserie
    const ids = new Set(inRegion.map((p) => p.id));
    const raws = Object.fromEntries(Object.entries(readRawDir(join(o.dataDir, "raw"))).filter(([id]) => ids.has(id)));
    report.hints.push(...staleHints(raws, o.today));

    // erst nach allen Regionen geschrieben: ein Commit der nächsten Region erlaubt nur Katalog und Rohdaten
    // (Arch-Review S4, M2)
    states.push(state);
    csvRows.push({ region, calls: calls.slice(callsBefore), adopted: report.adopted.length });
    if (abort) break;
  }
  brake ??= brakeHit(calls, o.brakes);
  for (const state of states)
    writeJson(join(o.dryRun ? o.runDir : join(o.dataDir, "discover"), `${state.region}.json`), state);

  // G2 auch im Trockenlauf (im Modus live prüft ihn jeder Commit): Der Katalog des Laufs darf gegenüber dem
  // Ausgangsstand nur die aufgenommenen Anbieter neu haben
  const gateErrors: string[] = [];
  const added = regions.flatMap((x) => x.adopted.map((a) => a.id));
  if (o.dryRun && added.length > 0)
    gateErrors.push(
      ...dryRunCatalogIssues(parse(originalCatalogText), parse(readFileSync(outCatalog, "utf8")), added, o.today),
    );

  const report: DiscoverReport = {
    date: o.today,
    dryRun: o.dryRun,
    durationMs: Math.round(performance.now() - started),
    regions,
    calls,
    ...(abort ? { abort } : {}),
    ...(brake ? { brake } : {}),
    budgetHit,
    ...(gateErrors.length > 0 ? { gateErrors } : {}),
    ...(hidden ? { hidden: hiddenEval(hidden, regions) } : {}),
  };
  mkdirSync(o.runDir, { recursive: true });
  writeFileSync(join(o.runDir, "kosten.jsonl"), costJsonl(calls, { run: "entdecken", date: o.today }));
  const csvFile = o.dryRun ? join(o.runDir, "kosten.csv") : join(o.dataDir, "kosten.csv");
  let csv = existsSync(csvFile) ? readFileSync(csvFile, "utf8") : undefined;
  for (const row of csvRows) {
    const t = summarizeCosts(row.calls, { cached: 0 }).total;
    csv = appendCsvRow(csv, {
      date: o.today,
      run: "entdecken",
      region: row.region,
      calls: row.calls.length,
      tokensIn: t.tokensIn,
      tokensOut: t.tokensOut,
      usd: t.costUsd,
      abort: abortOf(report),
      newProviders: row.adopted,
      changedProviders: 0,
    });
  }
  if (csv !== undefined) writeFileSync(csvFile, csv);
  writeJson(join(o.runDir, "report.json"), report);
  writeFileSync(join(o.runDir, "report.md"), renderDiscoverReport(report));
  return report;
}

type Proof =
  | { kind: "ja"; first: Offer; start: string; calls: CallRecord[] }
  | { kind: "nein"; grund: string; calls: CallRecord[] }
  | { kind: "abort"; abort: "auth" | "limit"; calls: CallRecord[] }
  | { kind: "abgebrochen"; calls: CallRecord[] };

/**
 * Ertragsbeweis (E7.6): Abruf nach dem neuen Eintrag (E3), `refreshProvider` wie im Nachtlauf (Zustand nach
 * `proofRaw`), Build-Probelauf nur dieses Anbieters, dann `proveYield` auf den gebauten Angeboten.
 */
async function proveEntry(
  o: DiscoverOptions,
  entry: Anbieter,
  ctx: {
    proofRaw: string;
    controller: AbortController;
    freeDays: FreeDaysByNetwork;
    horizon: { from: string; to: string };
  },
): Promise<Proof> {
  const fetched = await o.deps.fetchInputs(planFetch([entry], { today: o.today }), [entry], o.today);
  const input = fetched.inputs[entry.id];
  if (input?.status !== "ok")
    return {
      kind: "nein",
      grund: `Programmseite nicht abrufbar: ${input?.reason ?? input?.status ?? "kein Abruf"}`,
      calls: [],
    };
  const now = o.now?.() ?? toBerlinIso(new Date());
  // frisch für jeden Kandidaten: ein früher verworfener Kandidat mit derselben ID (oder ein früherer Lauf am selben
  // Tag) darf nicht als Vorstand gelten, sonst wären dessen Events der Beweis (Arch-Review S4, M1)
  rmSync(join(ctx.proofRaw, `${entry.id}.json`), { force: true });
  const r = await refreshProvider({
    provider: entry,
    fetched: input,
    prevOfferCount: 0,
    extractor: o.deps.extractor,
    signal: ctx.controller.signal,
    keyParts: o.keyParts,
    today: o.today,
    now,
    rawDir: ctx.proofRaw,
    outDir: ctx.proofRaw,
  });
  if (r.kind === "abort") return { kind: "abort", abort: r.abort, calls: r.calls };
  if (r.kind === "abgebrochen") return { kind: "abgebrochen", calls: r.calls };
  const raw = readRaw(ctx.proofRaw, entry.id);
  // nur eine frische Extraktion zählt als Beweis
  if (!raw || r.result !== "extrahiert")
    return {
      kind: "nein",
      grund: r.result === "leer" ? "keine Eingabe" : `Extraktion gescheitert: ${raw?.reason ?? r.result}`,
      calls: r.calls,
    };
  const { batches, extracted } = batchesFromRaw({ [entry.id]: raw }, [entry]);
  const { file } = buildOffers({
    batches,
    providers: [entry],
    previous: undefined,
    freeDays: ctx.freeDays,
    horizon: ctx.horizon,
    generatedAt: now,
    sources: {},
    perProviderStatus: true,
    extracted,
  });
  const yielded = proveYield(file?.offers ?? [], entry.id, input.text, now);
  return yielded.ok
    ? { kind: "ja", first: yielded.first, start: yielded.start, calls: r.calls }
    : { kind: "nein", grund: yielded.grund, calls: r.calls };
}
