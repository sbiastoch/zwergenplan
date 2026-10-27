/**
 * `refreshProvider` (Plan 0032, E1/E5; Plan 0048, E5, E7): einziger Weg, auf dem Rohdaten entstehen. Liest den
 * Zustand des Anbieters, fragt je Einheit die reine Regel (`lib/refresh.ts`), ruft bei Bedarf den Extraktor und
 * schreibt den neuen Zustand einmal am Ende. Nachtlauf und Entdecken rufen dieselbe Funktion.
 */
import type { Anbieter } from "../../../src/domain/schema.ts";
import type { CallRecord, ExtractInput, ExtractKeyParts, Extractor } from "../lib/extract.ts";
import { type BeilageState, isV2, type ProviderRawV2, type UnitState } from "../lib/raw.ts";
import {
  afterStrongRetry,
  applyOutcome,
  eventUnits,
  type FetchedProvider,
  migrate,
  needsStrongRetry,
  type ProviderResult,
  planRefresh,
  type RefreshApplied,
  type RefreshContext,
  type RefreshResult,
  summarize,
  unconfirmedCollapse,
} from "../lib/refresh.ts";
import type { ExpandWindow } from "../lib/schedule.ts";
import { KANDIDATEN, type UnitDef, unitExcerpt, unitsOf } from "../lib/units.ts";
import { RAW_DIR, readRaw, writeRaw } from "./files.ts";

export interface RefreshOptions {
  provider: Anbieter;
  fetched: FetchedProvider;
  extractor: Extractor;
  signal: AbortSignal;
  keyParts: ExtractKeyParts;
  /**
   * Darf nach einem Einbruch ein zweiter Versuch mit dem Fallback-Modell laufen (Bremse, Zeitbudget)? Ohne Angabe gibt
   * es keinen und der Einbruch wird zurückgehalten (Entdecken: nie ein Einbruch).
   */
  mayRetry?: (own: readonly CallRecord[]) => boolean;
  /** vor jeder Einheit (Plan 0048, E9): Zeitbudget und Bremse; nein → die übrigen Einheiten bleiben `offen` */
  mayContinue?: (own: readonly CallRecord[]) => boolean;
  /**
   * Angebote des Anbieters im Vorstand (`offerUnits`): Ohne Rohdatei gilt der Anbieter als umzustellen und wird gegen
   * sie geprüft (E7). Standard 0 (Entdecken: ein neuer Anbieter).
   */
  prevOfferCount?: number;
  /** Umstellung auch bei Einbruch oder gescheiterter Einheit (E7, `--umstellen` nach Prüfung) */
  forceMigrate?: boolean;
  /** freie Tage (`hasFuture`, E5) */
  freeDays: ExpandWindow["freeDays"];
  /** YYYY-MM-DD, Europe/Berlin */
  today: string;
  /** Abrufzeit mit Offset */
  now: string;
  /** Zustand lesen (Standard data/raw) */
  rawDir?: string;
  /** Zustand schreiben (Standard wie `rawDir`; `--dry-run` schreibt nach runs/<datum>/raw) */
  outDir?: string;
}

type UnitResult = RefreshResult | "offen";

export type RefreshOutcome =
  /**
   * `units`: Ergebnis je Einheit; `warnings`: Hinweise der Prüfung zu neuen Antworten (`validateRaw`), nur wenn es
   * welche gibt; `migration`: Grund, warum die Umstellung aussteht (V1 bleibt unverändert, E7); `dropped`: verwaiste
   * Einheiten, die entfallen sind (E1, geänderte URL)
   */
  | {
      kind: "done";
      result: ProviderResult;
      units: Record<string, UnitResult>;
      called: boolean;
      calls: CallRecord[];
      warnings?: string[];
      migration?: string;
      dropped?: string[];
    }
  /** Auth oder Limit (E2): fertige Einheiten sind geschrieben, die übrigen unverändert; der Lauf endet geordnet */
  | { kind: "abort"; abort: "auth" | "limit"; calls: CallRecord[] }
  /** Lauf wurde während eines Aufrufs abgebrochen: fertige Einheiten sind geschrieben, die übrigen unverändert */
  | { kind: "abgebrochen"; calls: CallRecord[] };

type UnitRun =
  | { kind: "done"; next: UnitState; result: RefreshResult; called: boolean; warnings?: string[] }
  | { kind: "abort"; abort: "auth" | "limit" }
  | { kind: "abgebrochen" };

/** Eine Einheit nach E5: Plan, Extraktion, bei Einbruch ein zweiter Versuch. Aufrufe landen in `calls`. */
async function refreshUnit(o: RefreshOptions, ctx: RefreshContext, calls: CallRecord[]): Promise<UnitRun> {
  const plan = planRefresh(ctx);
  if (plan.kind === "keep") return { kind: "done", next: plan.next, result: plan.result, called: false };
  if (o.signal.aborted) return { kind: "abgebrochen" };
  const input: ExtractInput = {
    provider: o.provider,
    excerpt: ctx.excerpt,
    unit: ctx.unit.id,
    text: ctx.unit.text,
    pageUrls: ctx.unit.pages.map((p) => p.url),
    candidates: ctx.unit.candidates,
    allowedUrls: ctx.unit.allowedUrls,
    today: o.today,
  };
  const tag = (cs: readonly CallRecord[]) => cs.map((c) => ({ ...c, unit: ctx.unit.id }));
  const { outcome, calls: first } = await o.extractor(input, o.signal);
  calls.push(...tag(first));
  // Ein fertiges Ergebnis zählt auch nach dem Abbruch; ein Fehler durch den Abbruch nicht
  if (outcome.kind === "fehler" && o.signal.aborted) return { kind: "abgebrochen" };
  let applied: RefreshApplied = applyOutcome(ctx, plan.key, outcome);
  let final = outcome;
  if (o.mayRetry && needsStrongRetry(applied, first)) {
    if (o.signal.aborted) return { kind: "abgebrochen" };
    if (!o.mayRetry(calls)) applied = unconfirmedCollapse(ctx, "kein zweiter Versuch: Bremse oder Zeitbudget");
    else {
      let retry: Awaited<ReturnType<Extractor>>;
      try {
        retry = await o.extractor({ ...input, strong: true }, o.signal);
      } catch (e) {
        // die Aufrufe des ersten Versuchs zählen trotzdem (Bremse, kosten.jsonl)
        if (o.signal.aborted) return { kind: "abgebrochen" };
        retry = { outcome: { kind: "fehler", reason: (e as Error).message }, calls: [] };
      }
      calls.push(...tag(retry.calls));
      if (retry.outcome.kind === "fehler" && o.signal.aborted) return { kind: "abgebrochen" };
      applied = afterStrongRetry(ctx, applyOutcome(ctx, plan.key, retry.outcome));
      final = retry.outcome;
    }
  }
  if (applied.kind === "abort") return { kind: "abort", abort: applied.abort };
  const warnings = final.kind === "ok" ? final.warnings : undefined;
  return { kind: "done", next: applied.next, result: applied.result, called: true, ...(warnings ? { warnings } : {}) };
}

/** Zustand der Beilagen nach diesem Abruf (E1): Fehlerserie und Fehlerklasse wie bei Einheiten. */
function nextBeilagen(
  fetched: FetchedProvider["beilagen"],
  prev: ProviderRawV2["beilagen"],
  now: string,
): ProviderRawV2["beilagen"] {
  const out: Record<string, BeilageState> = {};
  for (const [id, b] of Object.entries(fetched)) {
    const old = prev?.[id];
    if (b.ok) out[id] = { status: "ok", checkedAt: now };
    else
      out[id] = {
        status: "fehler",
        reason: b.reason,
        klasse: b.klasse,
        klasseSince: old?.klasse === b.klasse && old.klasseSince ? old.klasseSince : now,
        checkedAt: old?.checkedAt ?? now,
        failingSince: old?.failingSince ?? now,
      };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function refreshProvider(o: RefreshOptions): Promise<RefreshOutcome> {
  const rawDir = o.rawDir ?? RAW_DIR;
  const outDir = o.outDir ?? rawDir;
  const prevRaw = readRaw(rawDir, o.provider.id);
  const v1 = prevRaw && !isV2(prevRaw) ? prevRaw : undefined;
  const prevUnits: Readonly<Record<string, UnitState>> = prevRaw && isV2(prevRaw) ? prevRaw.units : {};
  // `kandidaten` gibt es, wenn er nur über Kandidaten läuft, Kandidaten hat oder der Vorzustand sie hat (E1)
  const hadKandidaten = prevUnits[KANDIDATEN] !== undefined || (v1?.sources.length ?? 0) > 0;
  const units = o.fetched.units.filter(
    (u) => u.id !== KANDIDATEN || o.fetched.via === "kandidaten" || u.candidates.length > 0 || hadKandidaten,
  );
  const defs = new Map(unitsOf(o.provider, { candidates: true, hadKandidaten: true }).map((d) => [d.id, d] as const));
  const ids = new Set(units.map((u) => u.id));
  // Geänderte URL (E1): Die verwaisten Einheiten bleiben, bis jede Seite eine Einheit mit `inputHash` hat; die erste
  // Extraktion einer neuen Einheit wird gegen ihre künftigen Angebote geprüft
  const orphans = Object.keys(prevUnits).filter((id) => !ids.has(id));
  const fresh = units.filter((u) => prevUnits[u.id] === undefined);
  const baseline =
    !v1 && fresh.length > 0 && orphans.length > 0
      ? orphans.reduce((n, id) => n + eventUnits(prevUnits[id]?.events ?? [], o.today), 0)
      : undefined;

  const calls: CallRecord[] = [];
  const next: Record<string, UnitState> = {};
  const results: Record<string, UnitResult> = {};
  const warnings: string[] = [];
  let called = false;
  let stop: { kind: "abort"; abort: "auth" | "limit" } | { kind: "abgebrochen" } | undefined;
  for (const unit of units) {
    const prev = prevUnits[unit.id];
    if (stop || o.signal.aborted || (o.mayContinue && !o.mayContinue(calls))) {
      if (prev) next[unit.id] = prev;
      results[unit.id] = "offen";
      stop ??= o.signal.aborted ? { kind: "abgebrochen" } : undefined;
      continue;
    }
    const ctx: RefreshContext = {
      provider: o.provider,
      excerpt: unitExcerpt(o.provider, defs.get(unit.id) ?? ({ id: unit.id, beilagen: [] } satisfies UnitDef)),
      unit,
      fetched: o.fetched,
      prev,
      ...(prev === undefined && baseline !== undefined ? { baseline } : {}),
      keyParts: o.keyParts,
      today: o.today,
      now: o.now,
      freeDays: o.freeDays,
    };
    const r = await refreshUnit(o, ctx, calls);
    if (r.kind !== "done") {
      stop = r;
      if (prev) next[unit.id] = prev;
      results[unit.id] = "offen";
      continue;
    }
    next[unit.id] = r.next;
    results[unit.id] = r.result;
    called ||= r.called;
    warnings.push(...(r.warnings ?? []));
  }

  const done = units.every((u) => next[u.id]?.inputHash !== undefined);
  const dropped = done ? orphans : [];
  if (!done) for (const id of orphans) if (prevUnits[id]) next[id] = prevUnits[id];

  const write = (): void => {
    const beilagen = nextBeilagen(o.fetched.beilagen, prevRaw && isV2(prevRaw) ? prevRaw.beilagen : undefined, o.now);
    writeRaw(outDir, o.provider.id, { version: 2, units: next, ...(beilagen ? { beilagen } : {}) });
  };
  const unitList = units.map((u) => ({ id: u.id, result: results[u.id] ?? "offen", events: next[u.id]?.events ?? [] }));
  // ohne Rohdatei, aber mit Angeboten im Vorstand: wie eine Umstellung gegen diese Angebote geprüft
  const legacy = v1
    ? eventUnits(v1.events, o.today)
    : prevRaw === undefined && (o.prevOfferCount ?? 0) > 0
      ? o.prevOfferCount
      : undefined;
  if (legacy !== undefined) {
    // Umstellung (E7): nur ganz oder mit `--umstellen`; sonst bleibt die V1-Datei unverändert (bzw. es gibt keine)
    const m = migrate({ old: legacy, units: unitList, today: o.today });
    if (stop) return { ...stop, calls };
    if (!m.ok && !o.forceMigrate)
      return {
        kind: "done",
        result: "umstellung-ausstehend",
        units: results,
        called,
        calls,
        migration: m.reason,
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    write();
  } else if (Object.values(results).some((r) => r !== "offen") || dropped.length > 0) write();
  if (stop) return { ...stop, calls };
  return {
    kind: "done",
    result: summarize(unitList.map((u) => u.result)),
    units: results,
    called,
    calls,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(dropped.length > 0 ? { dropped } : {}),
  };
}
