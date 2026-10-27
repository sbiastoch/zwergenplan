/**
 * `pnpm pipeline nightly` (Plan 0032, E6): Abruf aller Eingaben (E3), je Anbieter `refreshProvider` (E5), danach
 * `build` aus `data/raw`. Zeitbudget, Bremsen (E8) und erster `abort` beenden den Lauf geordnet: Was nicht bearbeitet
 * wurde, bleibt unverändert, `build` läuft trotzdem (Fertiges wird gesichert). Kosten je Aufruf nach
 * `runs/<datum>/kosten.jsonl`, eine Zeile je Lauf nach `data/kosten.csv` (im Trockenlauf `runs/<datum>/kosten.csv`).
 * Die Ampel rechnet `pipeline status` aus dem Bericht (lib/report.ts).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OffersFile, Provider } from "../../../src/domain/schema.ts";
import { addMonths } from "../../../src/domain/time.ts";
import { type BuildInput, batchesFromRaw, buildOffers, HORIZON_MONTHS } from "../lib/build-offers.ts";
import { isSource } from "../lib/candidate.ts";
import {
  appendCsvRow,
  type BrakeKind,
  type Brakes,
  brakeHit,
  costJsonl,
  NIGHT_BRAKES,
  summarizeCosts,
} from "../lib/cost.ts";
import type { CallRecord, ExtractKeyParts, Extractor } from "../lib/extract.ts";
import { renderFetchMarkdown, runLimited } from "../lib/fetch.ts";
import { offerUnits } from "../lib/refresh.ts";
import { changedProviders, type NightlyReport, type ProviderState } from "../lib/report.ts";
import { planFetch } from "../lib/select.ts";
import type { fetchInputs } from "./fetch-inputs.ts";
import { readCatalog, readPreviousOffers, readRawDir, removeRaw, writeJson, writeOffers } from "./files.ts";
import { loadFreeDays } from "./holidays.ts";
import { refreshProvider } from "./refresh.ts";

/** Zeitbudget des Laufs in Minuten (E6, `RUN_BUDGET_MIN`) */
export const DEFAULT_BUDGET_MIN = 50;
/** Anbieter gleichzeitig in Bearbeitung (Modellaufrufe; der Abruf hat eigene Grenzen) */
const CONCURRENCY = 3;

export interface NightlyOptions {
  extractor: Extractor;
  keyParts: ExtractKeyParts;
  budgetMin: number;
  /** enthält providers.yaml, offers.json und raw/ */
  dataDir: string;
  /** runs/<datum>: Eingaben, Bericht; mit `dryRun` auch raw/ und offers.json */
  runDir: string;
  only?: readonly string[];
  /** Bremsen (E8), Standard `NIGHT_BRAKES` */
  brakes?: Brakes;
  /** schreibt Zustand nach runDir/raw und offers.json nach runDir statt nach dataDir */
  dryRun?: boolean;
  /** YYYY-MM-DD, Europe/Berlin */
  today: string;
  /** „Jetzt“ als ISO mit Offset (Abrufzeit, generatedAt, Übernahme-Grenze); hineingegeben, damit Tests deterministisch sind */
  now: () => string;
  concurrency?: number;
  /**
   * Nach einem Einbruch ein zweiter Versuch mit dem Fallback-Modell (Plan 0032, „Einbruch → …“), auch wenn es das
   * Hauptmodell ist (Plan 0048, E5: Die Streuung zwischen zwei Läufen ist groß). Standard aus; `pipeline nightly` an.
   */
  strongRetry?: boolean;
  /** Anbieter, deren Umstellung auf V2 erzwungen wird (Plan 0048, E7, `--umstellen` nach Prüfung) */
  forceMigrate?: readonly string[];
  /** für Tests: Abruf und Ferien ohne Netz */
  fetch?: typeof fetchInputs;
  freeDays?: typeof loadFreeDays;
}

export type { NightlyReport } from "../lib/report.ts";

export async function runNightly(o: NightlyOptions): Promise<NightlyReport> {
  const started = performance.now();
  const elapsedMin = () => (performance.now() - started) / 60_000;
  const rawDir = join(o.dataDir, "raw");
  const outDir = o.dryRun ? join(o.runDir, "raw") : rawDir;
  const catalog = readCatalog(join(o.dataDir, "providers.yaml"));
  const byId = new Map(catalog.map((p) => [p.id, p] as const));
  const previous = readPreviousOffers(join(o.dataDir, "offers.json"));
  const brakes = o.brakes ?? NIGHT_BRAKES;

  const plan = planFetch(catalog, { today: o.today, ...(o.only ? { only: o.only } : {}) });
  // erst hier geladen: fetch-inputs zieht Playwright nach, das Tests mit Fake-Abruf nicht brauchen
  const fetchAll = o.fetch ?? (await import("./fetch-inputs.ts")).fetchInputs;
  const fetched = await fetchAll(plan, catalog, o.today);
  const fetchedAt = o.now();
  const inputDir = join(o.runDir, "fetch");
  mkdirSync(inputDir, { recursive: true });
  for (const [id, text] of Object.entries(fetched.texts)) writeFileSync(join(inputDir, `${id}.txt`), `${text}\n`);
  writeJson(join(inputDir, "hashes.json"), fetched.providers);
  writeFileSync(
    join(inputDir, "report.md"),
    renderFetchMarkdown({
      date: o.today,
      durationMs: performance.now() - started,
      providers: fetched.providers,
      adapters: fetched.adapters,
      skipped: plan.skipped,
      comparison: undefined,
    }),
  );

  const results: Record<string, ProviderState> = {};
  const calls: CallRecord[] = [];
  const warnings: Record<string, string[]> = {};
  const controller = new AbortController();
  let abort: NightlyReport["abort"];
  let budgetHit = false;
  let brake: BrakeKind | undefined;
  let cached = 0;
  const units: NonNullable<NightlyReport["units"]> = {};
  const migrations: Record<string, string> = {};
  const horizon = { from: o.today, to: addMonths(o.today, HORIZON_MONTHS) };
  // vor den Einheiten geladen: `hasFuture` (E5) braucht sie, der Build danach dieselben
  const freeDays = await (o.freeDays ?? loadFreeDays)(addMonths(horizon.from, -12), addMonths(horizon.to, 24));
  const force = new Set(o.forceMigrate ?? []);
  const work = plan.providers.flatMap((p) => {
    const provider = byId.get(p.id);
    const input = fetched.inputs[p.id];
    return provider?.role === "anbieter" && input ? [{ provider, input }] : [];
  });
  /** Zeitbudget und Bremse; geprüft vor jedem Anbieter und vor jeder Einheit (E9) */
  const mayGo = (own: readonly CallRecord[]) => {
    if (elapsedMin() >= o.budgetMin) {
      budgetHit = true;
      return false;
    }
    brake ??= brakeHit([...calls, ...own], brakes);
    return brake === undefined;
  };
  const concurrency = o.concurrency ?? CONCURRENCY;
  await runLimited(
    work,
    { total: concurrency, perKey: concurrency },
    () => "alle",
    async ({ provider, input }) => {
      if (controller.signal.aborted) {
        results[provider.id] = "offen";
        return;
      }
      // vor jedem Anbieter wie vor jeder Einheit: laufende Einheiten enden noch (Überhang höchstens `concurrency`)
      if (!mayGo([])) {
        results[provider.id] = "offen";
        return;
      }
      try {
        const r = await refreshProvider({
          provider,
          fetched: input,
          prevOfferCount: offerUnits(previous?.offers ?? [], provider.id),
          extractor: o.extractor,
          signal: controller.signal,
          keyParts: o.keyParts,
          // dieselben Grenzen wie vor jedem Anbieter, jetzt vor jeder Einheit und vor dem zweiten Versuch
          mayContinue: mayGo,
          ...(o.strongRetry ? { mayRetry: mayGo } : {}),
          forceMigrate: force.has(provider.id),
          freeDays,
          today: o.today,
          now: fetchedAt,
          rawDir,
          outDir,
        });
        calls.push(...r.calls);
        if (r.kind === "done") {
          results[provider.id] = r.result;
          units[provider.id] = r.units;
          if (r.migration) migrations[provider.id] = r.migration;
          // verwaiste Einheiten (geänderte URL) entfallen mit Hinweis (E6; Arch-Review 2 und 3, m1)
          const notes = [
            ...(r.warnings ?? []),
            ...(r.dropped ?? []).map((u) => `${u}: entfällt (nicht mehr im Katalog)`),
          ];
          if (notes.length > 0) warnings[provider.id] = notes;
          if (!r.called && r.result !== "ausgefallen") cached++;
        } else if (r.kind === "abort") {
          results[provider.id] = "abort";
          abort ??= r.abort;
          controller.abort();
        } else results[provider.id] = "abgebrochen";
      } catch (e) {
        // Abbruch während des Aufrufs (AbortError) oder Programmfehler: nur dieser Anbieter, sein Zustand bleibt
        if (controller.signal.aborted) {
          results[provider.id] = "abgebrochen";
          return;
        }
        results[provider.id] = "fehler";
        console.error(`✗ ${provider.id}: ${(e as Error).message}`);
      }
    },
  );
  // Auch die zuletzt laufenden Anbieter können die Grenze reißen (E8: erreicht → rot)
  brake ??= brakeHit(calls, brakes);

  const sources = Object.fromEntries(
    Object.entries(fetched.adapters).flatMap(([name, a]) => (isSource(name) ? [[name, a.status]] : [])),
  );
  const { removed, build } = await buildFromRaw({
    dataDir: o.dataDir,
    catalog,
    previous,
    today: o.today,
    now: o.now,
    sources,
    ...(o.dryRun ? { dryRun: { overlayDir: outDir, target: join(o.runDir, "offers.json") } } : {}),
    freeDays: async () => freeDays,
  });
  writeFileSync(join(o.runDir, "kosten.jsonl"), costJsonl(calls, { run: "nacht", date: o.today }));
  const out: NightlyReport = {
    date: o.today,
    durationMs: Math.round(performance.now() - started),
    results,
    units,
    ...(Object.keys(migrations).length > 0 ? { migrations } : {}),
    calls,
    warnings,
    cached,
    ...(abort ? { abort } : {}),
    budgetHit,
    ...(brake ? { brake } : {}),
    removed,
    adapters: fetched.adapters,
    build,
    ...(previous
      ? {
          previous: {
            offers: previous.offers.length,
            sessions: previous.offers.reduce((n, offer) => n + offer.sessions.length, 0),
          },
        }
      : {}),
  };
  writeJson(join(o.runDir, "nightly.json"), out);
  appendCostRow(o.dryRun ? join(o.runDir, "kosten.csv") : join(o.dataDir, "kosten.csv"), out);
  return out;
}

/**
 * Aufräumen und `build` aus `data/raw` nach `data/offers.json`, gemeinsam für Nachtlauf und `--build-only`: gleiche
 * Build-Funktion, gleicher Horizont, freie Tage, IDs stabil gegen den Vorstand (ADR 0022).
 */
async function buildFromRaw(o: {
  dataDir: string;
  catalog: readonly Provider[];
  previous: OffersFile | undefined;
  today: string;
  now: () => string;
  sources: BuildInput["sources"];
  /** Trockenlauf: Zustand dieses Laufs aus `overlayDir` überlagert data/raw, offers.json nach `target` */
  dryRun?: { overlayDir: string; target: string };
  freeDays?: typeof loadFreeDays;
}): Promise<{ removed: string[]; build: NightlyReport["build"] }> {
  const rawDir = join(o.dataDir, "raw");
  // Zustand von Anbietern, die nicht mehr im Katalog stehen (Rücknahme per Revert, E7), räumt der Lauf weg;
  // sonst bliebe data:validate rot (Arch-Review S2, M1). Im Trockenlauf nur gemeldet.
  const removed: string[] = [];
  const anbieter = new Set(o.catalog.filter((p) => p.role === "anbieter").map((p) => p.id));
  for (const id of Object.keys(readRawDir(rawDir)))
    if (!anbieter.has(id)) {
      removed.push(id);
      if (!o.dryRun) removeRaw(rawDir, id);
    }

  const raws = { ...readRawDir(rawDir), ...(o.dryRun ? readRawDir(o.dryRun.overlayDir) : {}) };
  const horizon = { from: o.today, to: addMonths(o.today, HORIZON_MONTHS) };
  // vor `batchesFromRaw`: Abgleich und Vereinigung der Einheiten brauchen die freien Tage (Plan 0048, E6)
  const freeDays = await (o.freeDays ?? loadFreeDays)(addMonths(horizon.from, -12), addMonths(horizon.to, 24));
  const { batches, extracted, notes } = batchesFromRaw(raws, o.catalog, {
    previous: o.previous?.offers,
    horizon,
    freeDays,
  });
  const { file, report } = buildOffers({
    batches,
    providers: o.catalog,
    previous: o.previous,
    freeDays,
    horizon,
    generatedAt: o.now(),
    sources: o.sources,
    perProviderStatus: true,
    extracted,
  });
  let written: string | undefined;
  if (file) {
    written = o.dryRun?.target ?? join(o.dataDir, "offers.json");
    writeOffers(file, written);
  }
  return {
    removed,
    build: {
      offers: report.offers,
      sessions: report.sessions,
      errors: report.errors,
      notes: [...notes, ...report.notes],
      ...(written ? { written } : {}),
      derivedCategories: report.derivedCategories,
    },
  };
}

/**
 * `pnpm pipeline nightly --build-only` (Arch-Review S5, M1): nur Aufräumen und `build` aus `data/raw` und dem
 * Katalog, ohne Abruf, ohne Modell, ohne Bericht und ohne Zeile in `kosten.csv`. Für die Rücknahme eines Anbieters
 * (Revert, Eintrag gelöscht): Seine Angebote fallen weg, `data:validate` wird wieder grün. Die freien Tage kommen
 * wie im Nachtlauf aus OpenHolidays (Cache ~/.cache/zwergenplan, sonst Netz).
 */
export async function runBuildOnly(o: {
  dataDir: string;
  today: string;
  now: () => string;
  freeDays?: typeof loadFreeDays;
}): Promise<{ removed: string[]; build: NightlyReport["build"] }> {
  return buildFromRaw({
    dataDir: o.dataDir,
    catalog: readCatalog(join(o.dataDir, "providers.yaml")),
    previous: readPreviousOffers(join(o.dataDir, "offers.json")),
    today: o.today,
    now: o.now,
    // ohne Abruf kein Status der Sammelkalender; mit Zustand je Anbieter wirkt er ohnehin nicht (build-offers)
    sources: {},
    ...(o.freeDays ? { freeDays: o.freeDays } : {}),
  });
}

/** Zeile der Zeitreihe `kosten.csv` (E8); Datum ist der Stichtag des Laufs (Europe/Berlin). */
function appendCostRow(file: string, r: NightlyReport): void {
  const t = summarizeCosts(r.calls, { cached: r.cached }).total;
  const existing = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    appendCsvRow(existing, {
      date: r.date,
      run: "nacht",
      region: "alle",
      calls: r.calls.length,
      tokensIn: t.tokensIn,
      tokensOut: t.tokensOut,
      usd: t.costUsd,
      abort: r.abort ?? r.brake ?? (r.budgetHit ? "zeit" : ""),
      newProviders: 0,
      changedProviders: changedProviders(r),
    }),
  );
}
