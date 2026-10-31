/**
 * `refreshProvider` (Plan 0032, E1/E5; Plan 0048, E5, E7): einziger Weg, auf dem Rohdaten entstehen. Liest den
 * Zustand des Anbieters, fragt je Einheit die reine Regel (`lib/refresh.ts`), ruft bei Bedarf den Extraktor und
 * schreibt den neuen Zustand einmal am Ende. Nachtlauf und Entdecken rufen dieselbe Funktion.
 */
import type { Anbieter } from "../../../src/domain/schema.ts";
import type { CallRecord, ExtractInput, ExtractKeyParts, ExtractOutcome, Extractor } from "../lib/extract.ts";
import { type BeilageState, isV2, type ProviderRawV2, type UnitState } from "../lib/raw.ts";
import {
  afterStrongRetry,
  applyOutcome,
  eventUnits,
  type FetchedProvider,
  migrate,
  missingFromPrevious,
  needsStrongRetry,
  type ProviderResult,
  pickGapAnswer,
  planRefresh,
  type RefreshApplied,
  type RefreshContext,
  type RefreshResult,
  summarize,
  unconfirmedCollapse,
} from "../lib/refresh.ts";
import type { NightlyReport } from "../lib/report.ts";
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
  /** ID-Gate (ADR 0041): Hat ein Mensch das seit `heldSince` gehaltene Ergebnis hingenommen (`data/id-hinnehmen.yaml`)? */
  acceptHeld?: (heldSince: string) => boolean;
}

type UnitResult = RefreshResult | "offen";

/** Lücke einer Einheit (Plan 0048, E13), Form wie in `nightly.json` */
type UnitGap = NonNullable<NightlyReport["gaps"]>[string][string];

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
      /** Einheiten mit Lücke gegen den Vorzustand (E13) */
      gaps?: Record<string, UnitGap>;
    }
  /**
   * Auth oder Limit (E2): fertige Einheiten sind geschrieben, die übrigen unverändert; der Lauf endet geordnet. `gaps` und
   * `warnings` der fertigen Einheiten gehen mit (E13: Abbruch im zweiten Versuch, Arch-Review m4)
   */
  | { kind: "abort"; abort: "auth" | "limit"; calls: CallRecord[]; gaps?: Record<string, UnitGap>; warnings?: string[] }
  /** Lauf wurde während eines Aufrufs abgebrochen: fertige Einheiten sind geschrieben, die übrigen unverändert */
  | { kind: "abgebrochen"; calls: CallRecord[]; gaps?: Record<string, UnitGap>; warnings?: string[] };

type UnitRun =
  | {
      kind: "done";
      next: UnitState;
      result: RefreshResult;
      called: boolean;
      warnings?: string[];
      gap?: UnitGap;
      /** Abbruch während des zweiten Versuchs wegen einer Lücke: die erste Antwort gilt, danach endet der Lauf (E13) */
      stop?: { kind: "abort"; abort: "auth" | "limit" } | { kind: "abgebrochen" };
    }
  | { kind: "abort"; abort: "auth" | "limit" }
  | { kind: "abgebrochen" };

type GapWindow = Parameters<typeof missingFromPrevious>[2];

/**
 * Eine Einheit nach E5: Plan, Extraktion, bei Einbruch ein zweiter Versuch, sonst bei einer Lücke gegen den Vorzustand
 * (E13). Aufrufe landen in `calls`.
 */
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
  // nach einem zweiten Versuch wegen Einbruchs keine Lückenprüfung (E13: Einbruch vor Lücke, kein dritter Aufruf)
  const gap =
    final === outcome
      ? await gapRetry(o, ctx, { input, key: plan.key, applied, first: outcome, tag }, calls)
      : undefined;
  if (gap) ({ applied, final } = gap);
  if (applied.kind === "abort") return { kind: "abort", abort: applied.abort };
  const warnings = [...(final.kind === "ok" ? (final.warnings ?? []) : []), ...(gap?.note ? [gap.note] : [])];
  return {
    kind: "done",
    next: applied.next,
    result: applied.result,
    called: true,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(gap ? { gap: gap.gap } : {}),
    ...(gap?.stop ? { stop: gap.stop } : {}),
  };
}

/**
 * Zweiter Versuch bei einer Lücke (Plan 0048, E13): nur nach `extrahiert`, mit Vorzustand, nicht für `kandidaten` und
 * nur mit `mayRetry` (Entdecken: nie). Welche Antwort gilt, entscheidet `pickGapAnswer` (`lib/refresh.ts`).
 * Scheitert der zweite Versuch, gilt die erste; ein Abbruch schreibt die erste und endet danach.
 */
async function gapRetry(
  o: RefreshOptions,
  ctx: RefreshContext,
  run: {
    input: ExtractInput;
    key: Parameters<typeof applyOutcome>[1];
    applied: RefreshApplied;
    first: ExtractOutcome;
    tag: (cs: readonly CallRecord[]) => CallRecord[];
  },
  calls: CallRecord[],
): Promise<
  | {
      applied: RefreshApplied;
      final: ExtractOutcome;
      gap: UnitGap;
      note: string;
      stop?: NonNullable<Extract<UnitRun, { kind: "done" }>["stop"]>;
    }
  | undefined
> {
  const { first, applied } = run;
  const prev = ctx.prev;
  if (!o.mayRetry || ctx.unit.id === KANDIDATEN || prev?.inputHash === undefined) return undefined;
  if (first.kind !== "ok" || applied.kind !== "write" || applied.result !== "extrahiert") return undefined;
  const w: GapWindow = { today: o.today, freeDays: o.freeDays };
  const missing = missingFromPrevious(first.events, prev.events, w);
  if (missing.length === 0) return undefined;
  const head = `${ctx.unit.id}: Lücke, ${missing.length} Angebote der Vornacht fehlten (${missing.map((e) => `„${e.title}“`).join(", ")})`;
  const keepFirst = (why: string, stop?: { kind: "abort"; abort: "auth" | "limit" } | { kind: "abgebrochen" }) => ({
    applied,
    final: first,
    gap: { before: missing.length },
    note: `${head}; ${why}`,
    ...(stop ? { stop } : {}),
  });
  if (!o.mayRetry(calls)) return keepFirst("kein zweiter Versuch (Bremse oder Zeitbudget)");
  if (o.signal.aborted) return keepFirst("kein zweiter Versuch (Abbruch)", { kind: "abgebrochen" });
  let second: Awaited<ReturnType<Extractor>>;
  try {
    second = await o.extractor({ ...run.input, strong: true }, o.signal);
  } catch (e) {
    if (o.signal.aborted) return keepFirst("zweiter Versuch abgebrochen", { kind: "abgebrochen" });
    second = { outcome: { kind: "fehler", reason: e instanceof Error ? e.message : String(e) }, calls: [] };
  }
  calls.push(...run.tag(second.calls));
  const out = second.outcome;
  if (out.kind === "abort") return keepFirst("zweiter Versuch abgebrochen", { kind: "abort", abort: out.abort });
  if (out.kind === "fehler") {
    if (o.signal.aborted) return keepFirst("zweiter Versuch abgebrochen", { kind: "abgebrochen" });
    return keepFirst(`zweiter Versuch gescheitert (${out.reason})`);
  }
  const chosen = pickGapAnswer(first.events, out.events, prev.events, w);
  const fromSecond = missingFromPrevious(out.events, prev.events, w).length;
  const after = chosen === "second" ? fromSecond : missing.length;
  return {
    applied: chosen === "second" ? applyOutcome(ctx, run.key, out) : applied,
    final: chosen === "second" ? out : first,
    gap: { before: missing.length, after, chosen },
    note: `${head}; zweiter Versuch: ${fromSecond} fehlen, gilt ${chosen === "second" ? "der zweite" : "der erste"}`,
  };
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
  const gaps: Record<string, UnitGap> = {};
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
      ...(v1 && unit.id === KANDIDATEN ? { prevSources: v1.sources } : {}),
      keyParts: o.keyParts,
      today: o.today,
      now: o.now,
      freeDays: o.freeDays,
      ...(prev?.held && o.acceptHeld?.(prev.held.since) ? { acceptHeld: true } : {}),
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
    if (r.gap) gaps[unit.id] = r.gap;
    if (r.stop) stop = r.stop;
  }
  const withGaps = Object.keys(gaps).length > 0 ? { gaps } : {};

  // entfernte Seiten zählen als erledigt, sonst blieben verwaiste Einheiten für immer (Arch-Review m2)
  const done = units.every((u) => next[u.id]?.inputHash !== undefined || next[u.id]?.removedAt !== undefined);
  const dropped = done ? orphans : [];
  if (!done) for (const id of orphans) if (prevUnits[id]) next[id] = prevUnits[id];

  const write = (): void => {
    const beilagen = nextBeilagen(o.fetched.beilagen, prevRaw && isV2(prevRaw) ? prevRaw.beilagen : undefined, o.now);
    writeRaw(outDir, o.provider.id, { version: 2, units: next, ...(beilagen ? { beilagen } : {}) });
  };
  const unitList = units.map((u) => ({ id: u.id, result: results[u.id] ?? "offen", events: next[u.id]?.events ?? [] }));
  // ohne Rohdatei, aber mit Angeboten im Vorstand: wie eine Umstellung gegen diese Angebote geprüft
  // eine V1-Datei ohne inputHash (nie extrahiert, Vorstand aus offers.json) wird gegen den Vorstand geprüft (Arch-Review 3, m2)
  const legacy = v1
    ? v1.inputHash !== undefined
      ? eventUnits(v1.events, o.today)
      : (o.prevOfferCount ?? 0)
    : prevRaw === undefined && (o.prevOfferCount ?? 0) > 0
      ? o.prevOfferCount
      : undefined;
  if (legacy !== undefined) {
    // Umstellung (E7): nur ganz oder mit `--umstellen`; sonst bleibt die V1-Datei unverändert (bzw. es gibt keine)
    const m = migrate({ old: legacy, units: unitList, today: o.today });
    if (stop) return { ...stop, calls, ...withGaps, ...(warnings.length > 0 ? { warnings } : {}) };
    // eine offene Einheit (Zeitbudget, Bremse) hat keinen Stand: auch `--umstellen` schreibt dann nicht, sonst fielen
    // ihre alten Angebote samt IDs weg (Arch-Review M2)
    const open = unitList.some((u) => u.result === "offen");
    // Ausfall und offene Einheiten zählen wie sonst (Ampel, 20-%-Regel; Arch-Review 2, M1); der Grund steht in `migration`
    const summary = summarize(unitList.map((u) => u.result));
    const visible = ["ausgefallen", "fehler", "offen", "teilausfall"].includes(summary);
    if (open || (!m.ok && !o.forceMigrate))
      return {
        kind: "done",
        result: visible ? summary : "umstellung-ausstehend",
        units: results,
        called,
        calls,
        migration: m.ok ? "Lauf vorzeitig beendet" : m.reason,
        ...(warnings.length > 0 ? { warnings } : {}),
        ...withGaps,
      };
    write();
  } else if (Object.values(results).some((r) => r !== "offen") || dropped.length > 0) write();
  if (stop) return { ...stop, calls, ...withGaps, ...(warnings.length > 0 ? { warnings } : {}) };
  return {
    kind: "done",
    result: summarize(unitList.map((u) => u.result)),
    units: results,
    called,
    calls,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(dropped.length > 0 ? { dropped } : {}),
    ...withGaps,
  };
}
