/**
 * `pnpm pipeline nightly` (Plan 0032, E6): Abruf aller Eingaben (E3), je Anbieter `refreshProvider` (E5), danach
 * `build` aus `data/raw`. Zeitbudget, Bremsen (E8) und erster `abort` beenden den Lauf geordnet: Was nicht bearbeitet
 * wurde, bleibt unverändert, `build` läuft trotzdem (Fertiges wird gesichert). Kosten je Aufruf nach
 * `runs/<datum>/kosten.jsonl`, eine Zeile je Lauf nach `data/kosten.csv` (im Trockenlauf `runs/<datum>/kosten.csv`).
 * Die Ampel rechnet `pipeline status` aus dem Bericht (lib/report.ts).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { addMonths, toBerlinIso } from "../../../src/domain/time.ts";
import { batchesFromRaw, buildOffers, HORIZON_MONTHS } from "../lib/build-offers.ts";
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
  concurrency?: number;
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
  const fetchedAt = toBerlinIso(new Date());
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
  const work = plan.providers.flatMap((p) => {
    const provider = byId.get(p.id);
    const input = fetched.inputs[p.id];
    return provider && input ? [{ provider, input }] : [];
  });
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
      if (elapsedMin() >= o.budgetMin) {
        budgetHit = true;
        results[provider.id] = "offen";
        return;
      }
      // Bremse vor jedem Anbieter wie das Zeitbudget: laufende Anbieter enden noch (Überhang höchstens `concurrency`)
      brake ??= brakeHit(calls, brakes);
      if (brake) {
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
          today: o.today,
          now: fetchedAt,
          rawDir,
          outDir,
        });
        calls.push(...r.calls);
        if (r.kind === "done") {
          results[provider.id] = r.result;
          if (r.warnings) warnings[provider.id] = r.warnings;
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

  // Zustand von Anbietern, die nicht mehr im Katalog stehen (Rücknahme per Revert, E7), räumt der Lauf weg;
  // sonst bliebe data:validate rot (Arch-Review S2, M1). Im Trockenlauf nur gemeldet.
  const removed: string[] = [];
  const anbieter = new Set(catalog.filter((p) => p.role === "anbieter").map((p) => p.id));
  for (const id of Object.keys(readRawDir(rawDir)))
    if (!anbieter.has(id)) {
      removed.push(id);
      if (!o.dryRun) removeRaw(rawDir, id);
    }

  // build aus data/raw, im Trockenlauf überlagert vom Zustand dieses Laufs
  const raws = { ...readRawDir(rawDir), ...(o.dryRun ? readRawDir(outDir) : {}) };
  const { batches, extracted, notes } = batchesFromRaw(raws, catalog);
  const horizon = { from: o.today, to: addMonths(o.today, HORIZON_MONTHS) };
  const freeDays = await (o.freeDays ?? loadFreeDays)(addMonths(horizon.from, -12), addMonths(horizon.to, 24));
  const sources = Object.fromEntries(
    Object.entries(fetched.adapters).flatMap(([name, a]) => (isSource(name) ? [[name, a.status]] : [])),
  );
  const { file, report } = buildOffers({
    batches,
    providers: catalog,
    previous,
    freeDays,
    horizon,
    generatedAt: toBerlinIso(new Date()),
    sources,
    perProviderStatus: true,
    extracted,
  });
  let written: string | undefined;
  if (file) {
    written = o.dryRun ? join(o.runDir, "offers.json") : join(o.dataDir, "offers.json");
    writeOffers(file, written);
  }
  writeFileSync(join(o.runDir, "kosten.jsonl"), costJsonl(calls, { run: "nacht", date: o.today }));
  const out: NightlyReport = {
    date: o.today,
    durationMs: Math.round(performance.now() - started),
    results,
    calls,
    warnings,
    cached,
    ...(abort ? { abort } : {}),
    budgetHit,
    ...(brake ? { brake } : {}),
    removed,
    adapters: fetched.adapters,
    build: {
      offers: report.offers,
      sessions: report.sessions,
      errors: report.errors,
      notes: [...notes, ...report.notes],
      ...(written ? { written } : {}),
    },
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
