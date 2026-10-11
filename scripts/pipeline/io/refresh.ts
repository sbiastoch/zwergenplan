/**
 * `refreshProvider` (Plan 0032, E1/E5): einziger Weg, auf dem Rohdaten entstehen. Liest den Zustand des Anbieters,
 * fragt die reine Regel (`lib/refresh.ts`), ruft bei Bedarf den Extraktor und schreibt den neuen Zustand. Nachtlauf
 * und Entdecken (Stufe 4) rufen dieselbe Funktion.
 */
import type { Provider } from "../../../src/domain/schema.ts";
import type { CallRecord, ExtractInput, ExtractKeyParts, Extractor } from "../lib/extract.ts";
import {
  afterStrongRetry,
  applyOutcome,
  type FetchedProvider,
  needsStrongRetry,
  planRefresh,
  type RefreshResult,
  unconfirmedCollapse,
} from "../lib/refresh.ts";
import { RAW_DIR, readRaw, writeRaw } from "./files.ts";

export interface RefreshOptions {
  provider: Provider;
  fetched: FetchedProvider;
  /** Angebote des Anbieters im Vorstand (`offerUnits`) */
  prevOfferCount: number;
  extractor: Extractor;
  signal: AbortSignal;
  keyParts: ExtractKeyParts;
  /**
   * Darf nach einem Einbruch ein zweiter Versuch mit dem Fallback-Modell laufen (Bremse, Zeitbudget, verschiedene
   * Modelle)? Ohne Angabe gibt es keinen und der Einbruch wird wie bisher zurückgehalten (Entdecken: nie ein Einbruch).
   */
  mayRetry?: (own: readonly CallRecord[]) => boolean;
  /** YYYY-MM-DD, Europe/Berlin */
  today: string;
  /** Abrufzeit mit Offset */
  now: string;
  /** Zustand lesen (Standard data/raw) */
  rawDir?: string;
  /** Zustand schreiben (Standard wie `rawDir`; `--dry-run` schreibt nach runs/<datum>/raw) */
  outDir?: string;
}

export type RefreshOutcome =
  /** `warnings`: Hinweise der Prüfung zur neuen Antwort (`validateRaw`), nur wenn es welche gibt */
  | { kind: "done"; result: RefreshResult; called: boolean; calls: CallRecord[]; warnings?: string[] }
  /** Auth oder Limit (E2): Anbieter unverändert, der Lauf endet geordnet */
  | { kind: "abort"; abort: "auth" | "limit"; calls: CallRecord[] }
  /** Lauf wurde während des Aufrufs abgebrochen: Anbieter unverändert */
  | { kind: "abgebrochen"; calls: CallRecord[] };

export async function refreshProvider(o: RefreshOptions): Promise<RefreshOutcome> {
  const rawDir = o.rawDir ?? RAW_DIR;
  const outDir = o.outDir ?? rawDir;
  const ctx = {
    provider: o.provider,
    fetched: o.fetched,
    prev: readRaw(rawDir, o.provider.id),
    prevOfferCount: o.prevOfferCount,
    keyParts: o.keyParts,
    today: o.today,
    now: o.now,
  };
  const plan = planRefresh(ctx);
  if (plan.kind === "keep") {
    writeRaw(outDir, o.provider.id, plan.next);
    return { kind: "done", result: plan.result, called: false, calls: [] };
  }
  if (o.signal.aborted) return { kind: "abgebrochen", calls: [] };
  const input: ExtractInput = {
    provider: o.provider,
    text: o.fetched.text,
    pageUrls: o.fetched.pages.map((p) => p.url),
    candidates: o.fetched.candidates,
    allowedUrls: o.fetched.allowedUrls,
    today: o.today,
  };
  const { outcome, calls: first } = await o.extractor(input, o.signal);
  const calls = [...first];
  // Ein fertiges Ergebnis zählt auch nach dem Abbruch; ein Fehler durch den Abbruch nicht
  if (outcome.kind === "fehler" && o.signal.aborted) return { kind: "abgebrochen", calls };
  let applied = applyOutcome(ctx, plan.key, outcome);
  let final = outcome;
  // Einbruch ohne Fallback-Modell: ein zweiter Versuch nur mit ihm (Plan 0032, „Einbruch → …“)
  if (o.mayRetry && needsStrongRetry(applied, calls)) {
    if (o.signal.aborted) return { kind: "abgebrochen", calls };
    if (!o.mayRetry(calls)) applied = unconfirmedCollapse(ctx, "kein zweiter Versuch: Bremse oder Zeitbudget");
    else {
      let retry: Awaited<ReturnType<Extractor>>;
      try {
        retry = await o.extractor({ ...input, strong: true }, o.signal);
      } catch (e) {
        // die Aufrufe des ersten Versuchs zählen trotzdem (Bremse, kosten.jsonl)
        if (o.signal.aborted) return { kind: "abgebrochen", calls };
        retry = { outcome: { kind: "fehler", reason: (e as Error).message }, calls: [] };
      }
      calls.push(...retry.calls);
      if (retry.outcome.kind === "fehler" && o.signal.aborted) return { kind: "abgebrochen", calls };
      applied = afterStrongRetry(ctx, applyOutcome(ctx, plan.key, retry.outcome));
      final = retry.outcome;
    }
  }
  if (applied.kind === "abort") return { kind: "abort", abort: applied.abort, calls };
  writeRaw(outDir, o.provider.id, applied.next);
  const warnings = final.kind === "ok" ? final.warnings : undefined;
  return { kind: "done", result: applied.result, called: true, calls, ...(warnings ? { warnings } : {}) };
}
