/**
 * `refreshProvider` (Plan 0032, E1/E5): einziger Weg, auf dem Rohdaten entstehen. Liest den Zustand des Anbieters,
 * fragt die reine Regel (`lib/refresh.ts`), ruft bei Bedarf den Extraktor und schreibt den neuen Zustand. Nachtlauf
 * und Entdecken (Stufe 4) rufen dieselbe Funktion.
 */
import type { Provider } from "../../../src/domain/schema.ts";
import type { CallRecord, ExtractInput, ExtractKeyParts, Extractor } from "../lib/extract.ts";
import { applyOutcome, type FetchedProvider, planRefresh, type RefreshResult } from "../lib/refresh.ts";
import { RAW_DIR, readRaw, writeRaw } from "./files.ts";

export interface RefreshOptions {
  provider: Provider;
  fetched: FetchedProvider;
  /** Angebote des Anbieters im Vorstand (`offerUnits`) */
  prevOfferCount: number;
  extractor: Extractor;
  signal: AbortSignal;
  keyParts: ExtractKeyParts;
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
  const { outcome, calls } = await o.extractor(input, o.signal);
  // Ein fertiges Ergebnis zählt auch nach dem Abbruch; ein Fehler durch den Abbruch nicht
  if (outcome.kind === "fehler" && o.signal.aborted) return { kind: "abgebrochen", calls };
  const applied = applyOutcome(ctx, plan.key, outcome);
  if (applied.kind === "abort") return { kind: "abort", abort: applied.abort, calls };
  writeRaw(outDir, o.provider.id, applied.next);
  const warnings = outcome.kind === "ok" ? outcome.warnings : undefined;
  return { kind: "done", result: applied.result, called: true, calls, ...(warnings ? { warnings } : {}) };
}
