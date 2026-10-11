/**
 * Kosten und Grenzen eines Laufs (Plan 0032, E8), reine Logik: Zeilen für `runs/<datum>/kosten.jsonl`, Summen für
 * den Bericht, Bremsen `MAX_CALLS`/`MAX_TOKENS` und die Zeile für `data/kosten.csv`.
 *
 * `costUsd` ist die Schätzung der CLI zum API-Gegenwert, nicht der Abo-Preis; Bericht und CSV beschriften es so.
 * „Tokens ein“ zählt Eingabe, Cache lesen und Cache schreiben zusammen (was das Modell gelesen hat), „Tokens aus“ die
 * Ausgabe samt Thinking. Die Bremse vergleicht die Summe aus beiden.
 */
import type { CallRecord } from "./extract.ts";

/** Lauf, zu dem ein Aufruf gehört (E7 bringt `entdecken`) */
type RunKind = "nacht";

export interface CostLineContext {
  run: RunKind;
  /** YYYY-MM-DD, Europe/Berlin */
  date: string;
}

/** `kosten.jsonl`: je Aufruf eine Zeile, Felder wie `CallRecord` plus Lauf und Datum. */
export function costJsonl(calls: readonly CallRecord[], ctx: CostLineContext): string {
  return calls.map((c) => `${JSON.stringify({ run: ctx.run, date: ctx.date, ...c })}\n`).join("");
}

interface Totals {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
}

export interface CostSummary {
  total: Totals;
  byStepModel: Array<Totals & { step: CallRecord["step"]; model: string }>;
  /** je Anbieter mit Aufruf, teuerste zuerst; `failed` = Aufrufe ohne gültige Antwort (Wiederholung, Fallback) */
  providers: Array<{ providerId: string; calls: number; costUsd: number; failed: number }>;
  /** Schätzung je extrahiertem Anbieter (Schnitt über `providers`) */
  perProviderUsd: number;
  /** durch den Cache gesparte Aufrufe (Anbieter ohne Modellaufruf, E4) */
  cachedCalls: number;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const tokensIn = (c: CallRecord) => c.inputTokens + c.cacheReadTokens + c.cacheCreationTokens;

function totalsOf(calls: readonly CallRecord[]): Totals {
  return {
    calls: calls.length,
    tokensIn: calls.reduce((n, c) => n + tokensIn(c), 0),
    tokensOut: calls.reduce((n, c) => n + c.outputTokens, 0),
    cacheRead: calls.reduce((n, c) => n + c.cacheReadTokens, 0),
    cacheWrite: calls.reduce((n, c) => n + c.cacheCreationTokens, 0),
    costUsd: round6(calls.reduce((n, c) => n + (c.costUsd ?? 0), 0)),
  };
}

function groupBy<K>(calls: readonly CallRecord[], key: (c: CallRecord) => K): Map<K, CallRecord[]> {
  const out = new Map<K, CallRecord[]>();
  for (const c of calls) {
    const k = key(c);
    const list = out.get(k);
    if (list) list.push(c);
    else out.set(k, [c]);
  }
  return out;
}

export function summarizeCosts(calls: readonly CallRecord[], o: { cached: number }): CostSummary {
  const byStepModel = [...groupBy(calls, (c) => `${c.step}\u0000${c.model}`).values()]
    .flatMap((list) => {
      const [first] = list;
      return first ? [{ step: first.step, model: first.model, ...totalsOf(list) }] : [];
    })
    .sort((a, b) => a.step.localeCompare(b.step) || a.model.localeCompare(b.model));
  const providers = [...groupBy(calls, (c) => c.providerId)]
    .map(([providerId, list]) => ({
      providerId,
      calls: list.length,
      costUsd: totalsOf(list).costUsd,
      failed: list.filter((c) => c.result !== "ok").length,
    }))
    .sort((a, b) => b.costUsd - a.costUsd || a.providerId.localeCompare(b.providerId));
  const total = totalsOf(calls);
  return {
    total,
    byStepModel,
    providers,
    perProviderUsd: providers.length > 0 ? round6(total.costUsd / providers.length) : 0,
    cachedCalls: o.cached,
  };
}

export interface Brakes {
  maxCalls: number;
  maxTokens: number;
}

/** Standard des Nachtlaufs (E8); Entdecken hat eigene (Stufe 4) */
export const NIGHT_BRAKES: Brakes = { maxCalls: 150, maxTokens: 3_000_000 };

/** Bremsen aus der Umgebung (`MAX_CALLS`, `MAX_TOKENS`); leer = Standard, ungültig = Fehler (keine stille Grenze). */
export function parseBrakes(
  env: Readonly<Record<string, string | undefined>>,
  defaults: Brakes = NIGHT_BRAKES,
): { ok: true; brakes: Brakes } | { ok: false; error: string } {
  const read = (name: string, fallback: number): number | string => {
    const raw = env[name];
    if (raw === undefined || raw.trim() === "") return fallback;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : `${name} ungültig: „${raw}“ (ganze Zahl > 0)`;
  };
  const maxCalls = read("MAX_CALLS", defaults.maxCalls);
  const maxTokens = read("MAX_TOKENS", defaults.maxTokens);
  if (typeof maxCalls === "string") return { ok: false, error: maxCalls };
  if (typeof maxTokens === "string") return { ok: false, error: maxTokens };
  return { ok: true, brakes: { maxCalls, maxTokens } };
}

export type BrakeKind = "aufrufe" | "tokens";

/** Erreichte Bremse nach den bisherigen Aufrufen, sonst `undefined`. */
export function brakeHit(calls: readonly CallRecord[], brakes: Brakes): BrakeKind | undefined {
  if (calls.length >= brakes.maxCalls) return "aufrufe";
  const t = totalsOf(calls);
  return t.tokensIn + t.tokensOut >= brakes.maxTokens ? "tokens" : undefined;
}

export const COST_CSV_HEADER =
  "datum,lauf,region,aufrufe,tokens_ein,tokens_aus,usd_schaetzung,abbruch,neue_anbieter,geaenderte_anbieter";

/** Eine Zeile der Zeitreihe `data/kosten.csv` (E8). `usd` ist die Schätzung zum API-Gegenwert, nicht der Abo-Preis. */
export interface CostRow {
  /** YYYY-MM-DD, Europe/Berlin */
  date: string;
  run: RunKind;
  /** Region des Laufs; der Nachtlauf deckt den ganzen Katalog ab (`alle`) */
  region: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  usd: number;
  /** leer, `auth`, `limit`, `zeit`, `aufrufe` oder `tokens` */
  abort: string;
  newProviders: number;
  changedProviders: number;
}

export function costCsvRow(r: CostRow): string {
  return [
    r.date,
    r.run,
    r.region,
    r.calls,
    r.tokensIn,
    r.tokensOut,
    r.usd.toFixed(4),
    r.abort,
    r.newProviders,
    r.changedProviders,
  ].join(",");
}

/** Hängt eine Zeile an den Inhalt von `kosten.csv` an; ohne Datei mit Kopf. */
export function appendCsvRow(existing: string | undefined, row: CostRow): string {
  const base = existing === undefined || existing.trim() === "" ? `${COST_CSV_HEADER}\n` : existing;
  return `${base.endsWith("\n") ? base : `${base}\n`}${costCsvRow(row)}\n`;
}
