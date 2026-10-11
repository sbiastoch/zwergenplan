/**
 * Zustand je Anbieter und Schutz des Bestands (Plan 0032, E5), rein. Entscheidet nur:
 * 1. `planRefresh`: Braucht der Anbieter einen Modellaufruf, oder steht der neue Zustand schon fest?
 * 2. `applyOutcome`: neuer Zustand aus altem Zustand und Ergebnis der Extraktion.
 * Abrufen, Extrahieren und Schreiben liegen in `io/refresh.ts`.
 *
 * Grundsatz: `inputHash` ist immer der Schlüssel der Eingabe, aus der `events` stammen. Ein Fehler speichert den
 * neuen Schlüssel also nie; die nächste Nacht versucht es erneut, statt den Fehler zu cachen.
 */
import type { Offer, Provider } from "../../../src/domain/schema.ts";
import type { Candidate, Source } from "./candidate.ts";
import type { ExtractKeyParts, ExtractOutcome } from "./extract-types.ts";
import { catalogExcerpt, extractKey } from "./normalize.ts";
import type { ProviderRaw, RawEvent } from "./raw.ts";

/** Ergebnis des Abrufs eines Anbieters (`io/fetch-inputs.ts`). */
export interface FetchedProvider {
  /** `leer`: weder Seiten noch Kandidaten (etwa `coveredBy` ohne Treffer); `fehler`: Seite oder Adapter ausgefallen */
  status: "ok" | "leer" | "fehler";
  reason?: string;
  /** abgerufene Seiten wie abgerufen; normalisiert wird im Schlüssel */
  pages: ReadonlyArray<{ url: string; text: string }>;
  candidates: readonly Candidate[];
  /** Eingabetext fürs Modell */
  text: string;
  /** erlaubte `sourceUrl` (E4): Seiten, Redirect-Ziele, Kandidaten */
  allowedUrls: readonly string[];
}

export interface RefreshContext {
  provider: Provider;
  fetched: FetchedProvider;
  /** `data/raw/<id>.json` der Vornacht, fehlt beim ersten Mal */
  prev: ProviderRaw | undefined;
  /** Angebote des Anbieters im Vorstand `data/offers.json` (`offerUnits`); „alt“ für den ersten Lauf (E5) */
  prevOfferCount: number;
  keyParts: ExtractKeyParts;
  /** Abrufzeit mit Offset */
  now: string;
}

/** Was mit dem Anbieter geschah, für Bericht und Statistik. */
export type RefreshResult =
  | "unveraendert"
  | "pending-uebernommen"
  | "ausgefallen"
  | "extrahiert"
  | "einbruch"
  | "fehler";

export type RefreshPlan = { kind: "keep"; next: ProviderRaw; result: RefreshResult } | { kind: "extract"; key: string };

export type RefreshApplied =
  | { kind: "write"; next: ProviderRaw; result: RefreshResult }
  | { kind: "abort"; abort: "auth" | "limit" };

/** `model` eines Zustands aus leerer Eingabe: kein Aufruf, also kein Modell. */
export const NO_INPUT_MODEL = "ohne-eingabe";

/** Einbruchschutz (E5): ab so vielen alten Angeboten … */
const COLLAPSE_MIN_OLD = 3;

const statusOf = (events: readonly RawEvent[]): "ok" | "keine-termine" => (events.length > 0 ? "ok" : "keine-termine");

/** Schlüssel der Eingabe dieses Laufs (E4). */
function keyOf(ctx: RefreshContext): string {
  return extractKey(
    { pages: ctx.fetched.pages, candidates: ctx.fetched.candidates },
    { ...ctx.keyParts, catalog: catalogExcerpt(ctx.provider) },
  );
}

/** Sammelkalender, die zur Eingabe beigetragen haben. */
const sourcesOf = (candidates: readonly Candidate[]): Source[] => [...new Set(candidates.map((c) => c.source))].sort();

/** Angebote zählen nach Ort und Titel: Ein Einzeltermin je Datum ist ein Event je Datum, aber ein Angebot. */
const unitKey = (e: { venueId: string; title: string }) => `${e.venueId}|${e.title.trim().toLowerCase()}`;
const eventUnits = (events: readonly RawEvent[]) => new Set(events.map(unitKey)).size;

/** Zahl der Angebote eines Anbieters im Vorstand, gezählt wie `eventUnits` (E5: „alt“ ohne Raw-Datei). */
export function offerUnits(offers: readonly Offer[], providerId: string): number {
  return new Set(offers.filter((o) => o.providerId === providerId).map(unitKey)).size;
}

/** `via` setzt der Code (E4): die Quelle des Kandidaten, auf dessen URL das Event verweist; sonst keine. */
export function assignVia(events: readonly RawEvent[], candidates: readonly Candidate[]): RawEvent[] {
  const byUrl = new Map<string, Source>();
  for (const c of candidates) {
    for (const url of [c.detailUrl, c.ticketUrl]) if (url && !byUrl.has(url)) byUrl.set(url, c.source);
  }
  return events.map(({ via: _model, ...e }) => {
    const via = byUrl.get(e.sourceUrl) ?? byUrl.get(e.url);
    return via ? { ...e, via } : e;
  });
}

/** Ausfall: alte Events bleiben, `fehler` mit Grund, Beginn der Fehlerserie bleibt. */
function failed(ctx: RefreshContext, reason: string): ProviderRaw {
  const { prev, now } = ctx;
  if (!prev) return { events: [], status: "fehler", reason, checkedAt: now, failingSince: now, sources: [] };
  return { ...prev, status: "fehler", reason, failingSince: prev.failingSince ?? now };
}

/** Übernahme neuer Events: Status aus den Events, Fehlerserie und pending enden. */
function adopted(ctx: RefreshContext, key: string, model: string, events: RawEvent[]): ProviderRaw {
  const { prev, now } = ctx;
  const same = prev?.changedAt !== undefined && JSON.stringify(prev.events) === JSON.stringify(events);
  return {
    events,
    inputHash: key,
    model,
    status: statusOf(events),
    checkedAt: now,
    changedAt: same && prev?.changedAt ? prev.changedAt : now,
    sources: sourcesOf(ctx.fetched.candidates),
  };
}

export function planRefresh(ctx: RefreshContext): RefreshPlan {
  const { prev, fetched, now } = ctx;
  if (fetched.status === "fehler")
    return { kind: "keep", next: failed(ctx, fetched.reason ?? "Abruf fehlgeschlagen"), result: "ausgefallen" };
  const key = keyOf(ctx);
  if (prev?.inputHash === key) {
    // Seite unverändert: alte Events bestätigt; ein offenes pending zu einer anderen Eingabe ist hinfällig
    const { reason: _r, failingSince: _f, pending: _p, ...rest } = prev;
    return { kind: "keep", next: { ...rest, status: statusOf(prev.events), checkedAt: now }, result: "unveraendert" };
  }
  if (prev?.pending?.inputHash === key) {
    const { model, events } = prev.pending;
    return { kind: "keep", next: adopted(ctx, key, model, events), result: "pending-uebernommen" };
  }
  if (fetched.status === "leer") {
    const r = applyOutcome(ctx, key, { kind: "ok", events: [], model: NO_INPUT_MODEL });
    if (r.kind === "write") return { kind: "keep", next: r.next, result: r.result };
  }
  return { kind: "extract", key };
}

export function applyOutcome(ctx: RefreshContext, key: string, outcome: ExtractOutcome): RefreshApplied {
  if (outcome.kind === "abort") return { kind: "abort", abort: outcome.abort };
  if (outcome.kind === "fehler") return { kind: "write", next: failed(ctx, outcome.reason), result: "fehler" };
  const events = assignVia(outcome.events, ctx.fetched.candidates);
  const { prev, now } = ctx;
  const old = prev?.inputHash !== undefined ? eventUnits(prev.events) : ctx.prevOfferCount;
  const fresh = eventUnits(events);
  if (old >= COLLAPSE_MIN_OLD && (fresh === 0 || fresh < old / 2)) {
    const pending = { inputHash: key, model: outcome.model, events };
    const next: ProviderRaw =
      prev?.inputHash !== undefined
        ? { ...prev, pending }
        : {
            events: [],
            status: "fehler",
            reason: `Einbruch zurückgehalten (${old} → ${fresh} Angebote), Vorstand bleibt`,
            checkedAt: prev?.checkedAt ?? now,
            failingSince: prev?.failingSince ?? now,
            sources: sourcesOf(ctx.fetched.candidates),
            pending,
          };
    return { kind: "write", next, result: "einbruch" };
  }
  return { kind: "write", next: adopted(ctx, key, outcome.model, events), result: "extrahiert" };
}
