/**
 * Zustand je Anbieter und Schutz des Bestands (Plan 0032, E5), rein. Entscheidet nur:
 * 1. `planRefresh`: Braucht der Anbieter einen Modellaufruf, oder steht der neue Zustand schon fest?
 * 2. `applyOutcome`: neuer Zustand aus altem Zustand und Ergebnis der Extraktion.
 * Abrufen, Extrahieren und Schreiben liegen in `io/refresh.ts`.
 *
 * Grundsatz: `inputHash` (mit `dated`) ist immer der Schlüssel der Eingabe, aus der `events` stammen. Ein Fehler speichert den
 * neuen Schlüssel also nie; die nächste Nacht versucht es erneut, statt den Fehler zu cachen.
 */
import type { Offer, Provider } from "../../../src/domain/schema.ts";
import type { Candidate, Source } from "./candidate.ts";
import type { CallRecord, ExtractKeyParts, ExtractOutcome } from "./extract.ts";
import { catalogExcerpt, datedFrom, type ExtractKey, extractKey, sameKey } from "./normalize.ts";
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
  /** `seiten`: eigene Programmseiten (Kandidaten ergänzen); `kandidaten`: nur Kandidaten (`coveredBy`, `skipCrawl`) */
  via: "seiten" | "kandidaten";
  /** Adapter des Sammelkalenders aus `coveredBy` */
  ownAdapter?: Source;
  /** Sammelkalender dieses Laufs mit Ausfall oder Teilausfall (Warnungen), mit Grund */
  adapterIssues: Partial<Record<Source, string>>;
}

export interface RefreshContext {
  provider: Provider;
  fetched: FetchedProvider;
  /** `data/raw/<id>.json` der Vornacht, fehlt beim ersten Mal */
  prev: ProviderRaw | undefined;
  /** Angebote des Anbieters im Vorstand `data/offers.json` (`offerUnits`); „alt“ für den ersten Lauf (E5) */
  prevOfferCount: number;
  keyParts: ExtractKeyParts;
  /** YYYY-MM-DD, Europe/Berlin: Stichtag für die datierten Bestandteile des Schlüssels */
  today: string;
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
  | "leer"
  | "fehler";

export type RefreshPlan =
  | { kind: "keep"; next: ProviderRaw; result: RefreshResult }
  | { kind: "extract"; key: ExtractKey };

export type RefreshApplied =
  | { kind: "write"; next: ProviderRaw; result: RefreshResult }
  | { kind: "abort"; abort: "auth" | "limit" };

/** `model` eines Zustands aus leerer Eingabe: kein Aufruf, also kein Modell. */
export const NO_INPUT_MODEL = "ohne-eingabe";

/** Einbruchschutz (E5): ab so vielen alten Angeboten … */
const COLLAPSE_MIN_OLD = 3;

const statusOf = (events: readonly RawEvent[]): "ok" | "keine-termine" => (events.length > 0 ? "ok" : "keine-termine");

/** Schlüssel der Eingabe dieses Laufs (E4). */
function keyOf(ctx: RefreshContext): ExtractKey {
  return extractKey(
    { pages: ctx.fetched.pages, candidates: ctx.fetched.candidates },
    { ...ctx.keyParts, catalog: catalogExcerpt(ctx.provider) },
    { today: ctx.today },
  );
}

/** Schlüssel zum Speichern: `dated` nur ab heute und nur, wenn es datierte Bestandteile gibt. */
function stored(key: { inputHash: string; dated?: Record<string, string> | undefined }, today: string) {
  const dated = datedFrom(key.dated ?? {}, today);
  return { inputHash: key.inputHash, ...(Object.keys(dated).length > 0 ? { dated } : {}) };
}

/** Sammelkalender, die zur Eingabe beigetragen haben. */
const sourcesOf = (candidates: readonly Candidate[]): Source[] => [...new Set(candidates.map((c) => c.source))].sort();

/**
 * Events gezählt wie Angebote in `offers.json` (E5: „alt“ ohne Raw-Datei kommt von dort): `build` zerlegt Einzeltermine
 * je Datum in eigene Angebote, alles andere ist ein Angebot je Event. Termine vor `today` zählen nicht: Alte Events
 * altern ohne Neu-Extraktion, die neue Antwort kennt nur Künftiges; sonst sähe das wie ein Einbruch aus. Der Vorstand
 * (`prevOfferCount`, ohne Raw-Datei) braucht das nicht: `offers.json` enthält schon nichts Vergangenes.
 */
const eventUnits = (events: readonly RawEvent[], today: string) =>
  events.reduce((n, e) => {
    if (e.schedule.kind !== "dates") return n + 1;
    const future = e.schedule.dates.filter((d) => (d.end ?? d.start).slice(0, 10) >= today).length;
    return n + (e.format === "einmalig" ? future : Math.min(future, 1));
  }, 0);

/** Zahl der Angebote eines Anbieters im Vorstand (E5: „alt“ ohne Raw-Datei). */
export function offerUnits(offers: readonly Offer[], providerId: string): number {
  return offers.filter((o) => o.providerId === providerId).length;
}

/**
 * Ausfall eines Sammelkalenders, der zu diesem Anbieter beiträgt (E5: „Adapter ausgefallen, auch teilweise“). Relevant
 * sind der eigene Adapter (`coveredBy`), die Quellen der Vornacht (`sources`) und die dieses Laufs. Ohne fehlende
 * Kandidaten bemerkte das sonst niemand: Der Anbieter würde ohne sie neu extrahiert, ihre Angebote fielen weg und
 * bekämen bei der Rückkehr neue IDs (Arch-Review S2, B1). Ein Anbieter nur mit Kandidaten, dessen Quellen noch
 * unbekannt sind (`skipCrawl`, erster Lauf), hängt an jedem Adapter.
 */
function adapterFailure(ctx: RefreshContext): string | undefined {
  const { fetched, prev } = ctx;
  const relevant = new Set<string>([
    ...(prev?.sources ?? []),
    ...sourcesOf(fetched.candidates),
    ...(fetched.ownAdapter ? [fetched.ownAdapter] : []),
  ]);
  const any = fetched.via === "kandidaten" && relevant.size === 0;
  const hit = Object.entries(fetched.adapterIssues)
    .sort(([a], [b]) => a.localeCompare(b))
    .find(([s]) => any || relevant.has(s));
  return hit ? `${hit[0]}: ${hit[1]}` : undefined;
}

/**
 * `via` setzt der Code (E4): die Quelle des Kandidaten, dessen `detailUrl` die `sourceUrl` des Events ist; sonst
 * keine. Nur `sourceUrl` (Herkunft), nicht `url`: Ein Sammelkalender verlinkt oft die Seite des Anbieters.
 */
export function assignVia(events: readonly RawEvent[], candidates: readonly Candidate[]): RawEvent[] {
  const byUrl = new Map<string, Source>();
  for (const c of candidates) if (!byUrl.has(c.detailUrl)) byUrl.set(c.detailUrl, c.source);
  return events.map(({ via: _model, ...e }) => {
    const via = byUrl.get(e.sourceUrl);
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
function adopted(ctx: RefreshContext, key: ExtractKey, model: string, events: RawEvent[]): ProviderRaw {
  const { prev, now } = ctx;
  const same = prev?.changedAt !== undefined && JSON.stringify(prev.events) === JSON.stringify(events);
  return {
    events,
    ...stored({ inputHash: key.hash, dated: key.dated }, ctx.today),
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
  const down = adapterFailure(ctx);
  if (down) return { kind: "keep", next: failed(ctx, down), result: "ausgefallen" };
  const key = keyOf(ctx);
  if (prev?.inputHash !== undefined && sameKey(prev, key, ctx.today)) {
    // Seite unverändert (bis auf Vergangenes): alte Events bestätigt; ein offenes pending zu einer anderen Eingabe ist
    // hinfällig; `dated` verliert die vergangenen Tage
    const { reason: _r, failingSince: _f, pending: _p, dated: _d, inputHash, ...rest } = prev;
    const next = { ...rest, ...stored({ inputHash, dated: prev.dated }, ctx.today), status: statusOf(prev.events) };
    return { kind: "keep", next: { ...next, checkedAt: now }, result: "unveraendert" };
  }
  if (prev?.pending && sameKey(prev.pending, key, ctx.today)) {
    const { model, events } = prev.pending;
    return { kind: "keep", next: adopted(ctx, key, model, events), result: "pending-uebernommen" };
  }
  if (fetched.status === "leer") {
    // keine Eingabe, kein Aufruf: bewertet wie eine leere Antwort (der Einbruchschutz gilt auch hier)
    const r = adopt(ctx, key, NO_INPUT_MODEL, []);
    return { kind: "keep", next: r.next, result: r.result === "extrahiert" ? "leer" : r.result };
  }
  return { kind: "extract", key };
}

export function applyOutcome(ctx: RefreshContext, key: ExtractKey, outcome: ExtractOutcome): RefreshApplied {
  if (outcome.kind === "abort") return { kind: "abort", abort: outcome.abort };
  if (outcome.kind === "fehler") return { kind: "write", next: failed(ctx, outcome.reason), result: "fehler" };
  return { kind: "write", ...adopt(ctx, key, outcome.model, assignVia(outcome.events, ctx.fetched.candidates)) };
}

/**
 * Zweiter Versuch mit dem Fallback-Modell (Plan 0032, „Einbruch → ein Versuch mit dem Fallback-Modell“): nur nach einem
 * Einbruch, an dem das Fallback-Modell nicht beteiligt war. Eine leere Antwort ist gültig, deshalb fragte der Ablauf aus
 * E4 das Fallback-Modell sonst nie, und der Anbieter hinge am Einbruchschutz fest.
 */
export function needsStrongRetry(applied: RefreshApplied, calls: readonly CallRecord[]): boolean {
  return applied.kind === "write" && applied.result === "einbruch" && !calls.some((c) => c.step === "fallback");
}

/**
 * Einbruch, den das Fallback-Modell nicht bestätigen konnte (Fehler, Bremse, Zeitbudget): Bestand bleibt, aber **ohne**
 * `pending`. Ein `pending` aus dem schwachen Modell übernähme die nächste Nacht bei gleicher Eingabe ungeprüft (E5);
 * so versucht sie es stattdessen erneut (Plan-Review B1).
 */
export function unconfirmedCollapse(ctx: RefreshContext, why: string): RefreshApplied {
  // auch ein älteres `pending` fällt weg: Es könnte bei Rückkehr zu seiner Eingabe sonst übernommen werden
  const { pending: _p, ...next } = failed(ctx, `Einbruch nicht bestätigt (${why}), Bestand bleibt`);
  return { kind: "write", next, result: "einbruch" };
}

/** Ergebnis nach dem zweiten Versuch: Sein Ergebnis gilt; `fehler` heißt unbestätigt. Ein Abbruch geht durch. */
export function afterStrongRetry(ctx: RefreshContext, second: RefreshApplied): RefreshApplied {
  return second.kind === "write" && second.result === "fehler"
    ? unconfirmedCollapse(ctx, `Fallback-Modell: ${second.next.reason ?? "Fehler"}`)
    : second;
}

/** Neue Events übernehmen oder als Einbruch zurückhalten (E5). */
function adopt(
  ctx: RefreshContext,
  key: ExtractKey,
  model: string,
  events: RawEvent[],
): { next: ProviderRaw; result: "extrahiert" | "einbruch" } {
  const { prev, now } = ctx;
  const old = prev?.inputHash !== undefined ? eventUnits(prev.events, ctx.today) : ctx.prevOfferCount;
  const fresh = eventUnits(events, ctx.today);
  if (old >= COLLAPSE_MIN_OLD && fresh < old / 2) {
    const pending = { ...stored({ inputHash: key.hash, dated: key.dated }, ctx.today), model, events };
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
    return { next, result: "einbruch" };
  }
  return { next: adopted(ctx, key, model, events), result: "extrahiert" };
}
