/**
 * Zustand je Einheit und Schutz des Bestands (Plan 0032, E5; Plan 0048, E5), rein. Entscheidet nur:
 * 1. `planRefresh`: Braucht die Einheit einen Modellaufruf, oder steht der neue Zustand schon fest?
 * 2. `applyOutcome`: neuer Zustand aus altem Zustand und Ergebnis der Extraktion.
 * 3. `summarize` und `migrate`: Ergebnis je Anbieter und Umstellung vom alten Format (E7).
 * Abrufen, Extrahieren und Schreiben liegen in `io/refresh.ts`.
 *
 * Grundsatz: `inputHash` (mit `dated`) ist immer der Schlüssel der Eingabe, aus der `events` stammen. Ein Fehler speichert den
 * neuen Schlüssel also nie; die nächste Nacht versucht es erneut, statt den Fehler zu cachen.
 */
import type { Anbieter, Offer } from "../../../src/domain/schema.ts";
import { addDays, berlinIsoDate } from "../../../src/domain/time.ts";
import type { Candidate, Source } from "./candidate.ts";
import type { CallRecord, ExtractKeyParts, ExtractOutcome } from "./extract.ts";
import { catalogExcerpt, datedFrom, type ExtractKey, extractKey, sameKey } from "./normalize.ts";
import { expansionWindow, type FailureClass, type RawEvent, type UnitState } from "./raw.ts";
import { type ExpandWindow, expandSchedule } from "./schedule.ts";
import { similarTitle } from "./similar.ts";
import { KANDIDATEN } from "./units.ts";

/** Ergebnis des Abrufs einer Einheit (`io/fetch-inputs.ts`, Plan 0048, E2). */
export interface FetchedUnit {
  /** Kennung (`lib/units.ts`) */
  id: string;
  /** `leer`: weder Seiten noch Kandidaten (etwa `kandidaten` ohne Treffer); `fehler`: eigene Seite oder Adapter */
  status: "ok" | "leer" | "fehler";
  reason?: string;
  /** nur bei `fehler` aus dem Abruf der eigenen Seite (E8) */
  klasse?: FailureClass;
  /** abgerufene Seiten wie abgerufen (eigene Seite, dann Beilagen); normalisiert wird im Schlüssel */
  pages: ReadonlyArray<{ url: string; text: string }>;
  candidates: readonly Candidate[];
  /** Eingabetext fürs Modell */
  text: string;
  /** erlaubte `sourceUrl` (E4): Seiten, Redirect-Ziele, Kandidaten */
  allowedUrls: readonly string[];
}

/** Ergebnis des Abrufs eines Anbieters: Einheiten, Beilagen und was auf Anbieterebene bleibt (E2). */
export interface FetchedProvider {
  /** Gesamtstatus des Abrufs wie früher (Bericht `hashes.json`, Ertragsbeweis des Entdeckens) */
  status: "ok" | "leer" | "fehler";
  reason?: string;
  /** Eingabetext aller Seiten und Kandidaten (Ertragsbeweis: Babybezug im Text; Probe `pipeline extract`) */
  text: string;
  /** Gesamtsicht für Probe und `eval freeze`: alle abgerufenen Seiten, Kandidaten und erlaubten URLs */
  pages: ReadonlyArray<{ url: string; text: string }>;
  candidates: readonly Candidate[];
  allowedUrls: readonly string[];
  /** `seiten`: eigene Programmseiten (Kandidaten ergänzen); `kandidaten`: nur Kandidaten (`coveredBy`, `skipCrawl`) */
  via: "seiten" | "kandidaten";
  /** Adapter des Sammelkalenders aus `coveredBy` */
  ownAdapter?: Source;
  /** Sammelkalender dieses Laufs mit Ausfall oder Teilausfall (Warnungen), mit Grund */
  adapterIssues: Partial<Record<Source, string>>;
  units: readonly FetchedUnit[];
  /** Abruf der Beilagen (`use: verfuegbarkeit`) je Kennung */
  beilagen: Readonly<Record<string, { ok: true } | { ok: false; reason: string; klasse: FailureClass }>>;
}

export interface RefreshContext {
  provider: Anbieter;
  /** Katalogauszug der Einheit (`unitExcerpt`): geht in den Schlüssel */
  excerpt: Anbieter;
  unit: FetchedUnit;
  fetched: Pick<FetchedProvider, "via" | "ownAdapter" | "adapterIssues">;
  /** Zustand der Einheit aus der Vornacht, fehlt bei einer neuen Einheit */
  prev: UnitState | undefined;
  /**
   * Nur bei neuer Einheit: künftige Angebote, gegen die ihre erste Extraktion geprüft wird (verwaiste Einheiten nach
   * geänderter URL, E1). Fehlt sie, gibt es keine Einbruchprüfung (neue Seite, Umstellung: die prüft `migrate`).
   */
  baseline?: number;
  /**
   * Sammelkalender der Vornacht, wenn es keinen Zustand der Einheit gibt (Umstellung aus V1: dort stehen sie am
   * Anbieter). Sonst erkennte `adapterFailure` einen Ausfall nicht, und die Kandidaten-Angebote fielen weg (Arch-Review 3, M1).
   */
  prevSources?: readonly Source[];
  keyParts: ExtractKeyParts;
  /** YYYY-MM-DD, Europe/Berlin: Stichtag für die datierten Bestandteile des Schlüssels */
  today: string;
  /** Abrufzeit mit Offset */
  now: string;
  /** freie Tage für `hasFuture` */
  freeDays: ExpandWindow["freeDays"];
}

/** Was mit der Einheit geschah, für Bericht und Statistik. */
export type RefreshResult =
  | "unveraendert"
  | "pending-uebernommen"
  | "ausgefallen"
  | "entfernt"
  | "extrahiert"
  | "einbruch"
  | "leer"
  | "fehler";

export type RefreshPlan =
  | { kind: "keep"; next: UnitState; result: RefreshResult }
  | { kind: "extract"; key: ExtractKey };

export type RefreshApplied =
  | { kind: "write"; next: UnitState; result: RefreshResult }
  | { kind: "abort"; abort: "auth" | "limit" };

/** `model` eines Zustands aus leerer Eingabe: kein Aufruf, also kein Modell. */
export const NO_INPUT_MODEL = "ohne-eingabe";

/** Einbruchschutz (E5): ab so vielen alten Angeboten zählt „weniger als die Hälfte“ … */
const COLLAPSE_MIN_OLD = 3;
/**
 * Entfernte Seite (ADR 0033, Punkt 3; Plan 0048, E5, N2): so viele Kalendertage ununterbrochen `dauerhaft` (404/410).
 * Zwei Wochen Meldung im Wächter vorher; ein Link ins Leere ist besser als einer auf einen Kurs, der nicht mehr gilt.
 */
const REMOVED_AFTER_DAYS = 14;

const statusOf = (events: readonly RawEvent[]): "ok" | "keine-termine" => (events.length > 0 ? "ok" : "keine-termine");

/** Schlüssel der Eingabe dieses Laufs (E4) mit dem Auszug der Einheit (Plan 0048, E3). */
function keyOf(ctx: RefreshContext): ExtractKey {
  return extractKey(
    { pages: ctx.unit.pages, candidates: ctx.unit.candidates },
    { ...ctx.keyParts, catalog: catalogExcerpt(ctx.excerpt) },
    { today: ctx.today },
  );
}

/** Schlüssel zum Speichern: `dated` nur ab heute und nur, wenn es datierte Bestandteile gibt. */
function stored(key: { inputHash: string; dated?: Record<string, string> | undefined }, today: string) {
  const dated = datedFrom(key.dated ?? {}, today);
  return { inputHash: key.inputHash, ...(Object.keys(dated).length > 0 ? { dated } : {}) };
}

/** Sammelkalender, die zur Eingabe beigetragen haben; gespeichert nur bei `kandidaten`. */
const sourcesOf = (candidates: readonly Candidate[]): Source[] => [...new Set(candidates.map((c) => c.source))].sort();
const withSources = (ctx: RefreshContext) =>
  ctx.unit.id === KANDIDATEN ? { sources: sourcesOf(ctx.unit.candidates) } : {};

/**
 * Events gezählt wie Angebote in `offers.json` (E5): `build` zerlegt Einzeltermine je Datum in eigene Angebote, alles
 * andere ist ein Angebot je Event. Termine vor `today` zählen nicht: Alte Events altern ohne Neu-Extraktion, die neue
 * Antwort kennt nur Künftiges; sonst sähe das wie ein Einbruch aus.
 */
export const eventUnits = (events: readonly RawEvent[], today: string) =>
  events.reduce((n, e) => {
    if (e.schedule.kind !== "dates") return n + 1;
    const future = e.schedule.dates.filter((d) => (d.end ?? d.start).slice(0, 10) >= today).length;
    return n + (e.format === "einmalig" ? future : Math.min(future, 1));
  }, 0);

/** Zahl der Angebote eines Anbieters im Vorstand (`pipeline status`). */
export function offerUnits(offers: readonly Offer[], providerId: string): number {
  return offers.filter((o) => o.providerId === providerId).length;
}

/**
 * Hat eines der Events einen Termin ab `today` (E5, `emptySince`)? Anders als `eventUnits` über `expandSchedule`: Eine
 * Regel mit abgelaufenem `until` oder erschöpftem `count` zählt nicht.
 */
export function hasFuture(events: readonly RawEvent[], today: string, freeDays: ExpandWindow["freeDays"]): boolean {
  const to = addDays(today, 400);
  return events.some((e) =>
    expandSchedule(e.schedule, { to: expansionWindow(e, to), freeDays, from: today }).some(
      (o) => (o.end ?? o.start).slice(0, 10) >= today,
    ),
  );
}

/**
 * Lücke gegen den Vorzustand (Plan 0048, E13): Events aus `reference` mit künftigem Beginn, die keine Fassung in `fresh`
 * deckt. Gedeckt heißt gleicher Ort, ähnlicher Titel und ein gemeinsamer künftiger Beginn. Zugeordnet wird je Beginn:
 * Jeder Zeitpunkt eines neuen Events deckt höchstens ein altes. So brauchen zwei parallele Kurse zur selben Zeit zwei
 * neue Fassungen, eine Regel, die mehrere alte Einzeltermine bündelt, deckt aber alle.
 */
export function missingFromPrevious(
  fresh: readonly RawEvent[],
  reference: readonly RawEvent[],
  w: { today: string; freeDays: ExpandWindow["freeDays"] },
): RawEvent[] {
  const to = addDays(w.today, 400);
  const starts = (e: RawEvent) =>
    expandSchedule(e.schedule, { to: expansionWindow(e, to), freeDays: w.freeDays, from: w.today })
      .filter((o) => (o.end ?? o.start).slice(0, 10) >= w.today)
      .map((o) => Date.parse(o.start));
  const open = fresh.map((e) => ({ e, slots: new Set(starts(e)) }));
  return reference.filter((old) => {
    const own = starts(old);
    if (own.length === 0) return false;
    for (const f of open) {
      if (f.e.venueId !== old.venueId || !similarTitle(f.e.title, old.title)) continue;
      const hit = own.filter((s) => f.slots.has(s));
      if (hit.length === 0) continue;
      for (const s of hit) f.slots.delete(s);
      return false;
    }
    return true;
  });
}

/**
 * Welche von zwei Antworten gilt nach einem zweiten Versuch wegen einer Lücke (E13, Review 2, M3)? Jede wird gegen den
 * Vorzustand plus die neuen Events der anderen Antwort gezählt (neu = von der Vornacht nicht gedeckt): So verliert eine
 * Antwort, die einen alten Kurs wiederfindet, dafür aber einen neu gefundenen weglässt. Bei Gleichstand die erste.
 */
export function pickGapAnswer(
  first: readonly RawEvent[],
  second: readonly RawEvent[],
  prev: readonly RawEvent[],
  w: { today: string; freeDays: ExpandWindow["freeDays"] },
): "first" | "second" {
  const score = (own: readonly RawEvent[], other: readonly RawEvent[]) =>
    missingFromPrevious(own, [...prev, ...missingFromPrevious(prev, other, w)], w).length;
  return score(second, first) < score(first, second) ? "second" : "first";
}

/**
 * Ausfall eines Sammelkalenders, der zur Einheit `kandidaten` beiträgt (E5: „Adapter ausgefallen, auch teilweise“).
 * Relevant sind der eigene Adapter (`coveredBy`), die Quellen der Vornacht (`sources`) und die dieses Laufs. Ohne
 * fehlende Kandidaten bemerkte das sonst niemand: Ihre Angebote fielen weg und bekämen bei der Rückkehr neue IDs
 * (Arch-Review S2, B1). Ein Anbieter nur mit Kandidaten, dessen Quellen noch unbekannt sind, hängt an jedem Adapter.
 */
function adapterFailure(ctx: RefreshContext): string | undefined {
  if (ctx.unit.id !== KANDIDATEN) return undefined;
  const { fetched, prev } = ctx;
  const relevant = new Set<string>([
    ...(prev?.sources ?? ctx.prevSources ?? []),
    ...sourcesOf(ctx.unit.candidates),
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

/**
 * Ausfall: alte Events bleiben, `fehler` mit Grund, Beginn der Fehlerserie bleibt. Die Fehlerklasse kommt nur aus dem
 * Abruf; bleibt sie gleich, bleibt `klasseSince`, wechselt sie, beginnt sie neu (E5).
 */
function failed(ctx: RefreshContext, reason: string, klasse?: FailureClass): UnitState {
  const { prev, now } = ctx;
  const {
    klasse: _k,
    klasseSince: _s,
    ...base
  }: UnitState = prev ?? {
    events: [],
    status: "fehler",
    checkedAt: now,
    ...withSources(ctx),
  };
  const since = klasse !== undefined && prev?.klasse === klasse ? prev.klasseSince : now;
  return {
    ...base,
    status: "fehler",
    reason,
    failingSince: prev?.failingSince ?? now,
    ...(klasse !== undefined && since !== undefined ? { klasse, klasseSince: since } : {}),
  };
}

/**
 * Entfernte Seite (E5): eigene Seite seit mindestens 14 Kalendertagen `dauerhaft`. Events und Schlüssel fallen weg;
 * kehrt die Seite zurück, wird sie neu extrahiert, auch mit unverändertem Inhalt.
 */
function removed(ctx: RefreshContext, next: UnitState): UnitState | undefined {
  if (next.klasse !== "dauerhaft" || next.klasseSince === undefined) return undefined;
  const since = berlinIsoDate(next.klasseSince);
  if (since > addDays(ctx.today, -REMOVED_AFTER_DAYS)) return undefined;
  const { inputHash: _h, dated: _d, model: _m, changedAt: _c, pending: _p, ...rest } = next;
  return {
    ...rest,
    events: [],
    reason: `entfernt: ${ctx.unit.reason ?? "dauerhaft"} seit ${since}`,
    removedAt: ctx.prev?.removedAt ?? ctx.now,
  };
}

/** Übernahme neuer Events: Status aus den Events, Fehlerserie, Klasse und pending enden. */
function adopted(ctx: RefreshContext, key: ExtractKey, model: string, events: RawEvent[]): UnitState {
  const { prev, now } = ctx;
  const same = prev?.changedAt !== undefined && JSON.stringify(prev.events) === JSON.stringify(events);
  return {
    events,
    ...stored({ inputHash: key.hash, dated: key.dated }, ctx.today),
    model,
    status: statusOf(events),
    checkedAt: now,
    changedAt: same && prev?.changedAt ? prev.changedAt : now,
    ...(prev?.emptySince ? { emptySince: prev.emptySince } : {}),
    ...withSources(ctx),
  };
}

/**
 * `emptySince` (E5, ADR 0033, Punkt 3: „hatte künftige Events und hat keine mehr“) in jedem Pfad: gesetzt, wenn die
 * Einheit keine künftigen Termine mehr hat und der Vorzustand Events hatte; gelöscht, sobald es wieder welche gibt.
 */
function withEmptySince(ctx: RefreshContext, next: UnitState): UnitState {
  const { emptySince: _e, ...rest } = next;
  if (hasFuture(next.events, ctx.today, ctx.freeDays)) return rest;
  const since = ctx.prev?.emptySince ?? ((ctx.prev?.events.length ?? 0) > 0 ? ctx.now : undefined);
  return since ? { ...rest, emptySince: since } : rest;
}

function keep(ctx: RefreshContext, next: UnitState, result: RefreshResult): RefreshPlan {
  return { kind: "keep", next: withEmptySince(ctx, next), result };
}

export function planRefresh(ctx: RefreshContext): RefreshPlan {
  const { prev, unit, now } = ctx;
  if (unit.status === "fehler") {
    const next = failed(ctx, unit.reason ?? "Abruf fehlgeschlagen", unit.klasse ?? "voruebergehend");
    const gone = removed(ctx, next);
    return gone ? keep(ctx, gone, "entfernt") : keep(ctx, next, "ausgefallen");
  }
  const down = adapterFailure(ctx);
  if (down) return keep(ctx, failed(ctx, down), "ausgefallen");
  const key = keyOf(ctx);
  if (prev?.inputHash !== undefined && sameKey(prev, key, ctx.today)) {
    // Seite unverändert (bis auf Vergangenes): alte Events bestätigt; ein offenes pending zu einer anderen Eingabe ist
    // hinfällig; `dated` verliert die vergangenen Tage
    const {
      reason: _r,
      failingSince: _f,
      pending: _p,
      dated: _d,
      klasse: _k,
      klasseSince: _s,
      inputHash,
      ...rest
    } = prev;
    const next = { ...rest, ...stored({ inputHash, dated: prev.dated }, ctx.today), status: statusOf(prev.events) };
    return keep(ctx, { ...next, checkedAt: now }, "unveraendert");
  }
  if (prev?.pending && sameKey(prev.pending, key, ctx.today)) {
    const { model, events } = prev.pending;
    return keep(ctx, adopted(ctx, key, model, events), "pending-uebernommen");
  }
  if (unit.status === "leer") {
    // keine Eingabe, kein Aufruf: bewertet wie eine leere Antwort (der Einbruchschutz gilt auch hier)
    const r = adopt(ctx, key, NO_INPUT_MODEL, []);
    return keep(ctx, r.next, r.result === "extrahiert" ? "leer" : r.result);
  }
  return { kind: "extract", key };
}

export function applyOutcome(ctx: RefreshContext, key: ExtractKey, outcome: ExtractOutcome): RefreshApplied {
  if (outcome.kind === "abort") return { kind: "abort", abort: outcome.abort };
  if (outcome.kind === "fehler")
    return { kind: "write", next: withEmptySince(ctx, failed(ctx, outcome.reason)), result: "fehler" };
  const r = adopt(ctx, key, outcome.model, assignVia(outcome.events, ctx.unit.candidates));
  return { kind: "write", next: withEmptySince(ctx, r.next), result: r.result };
}

/**
 * Zweiter Versuch mit dem Fallback-Modell (Plan 0032, „Einbruch → ein Versuch mit dem Fallback-Modell“): nach jedem
 * Einbruch, an dem das Fallback-Modell nicht beteiligt war, auch wenn es das Hauptmodell ist (Plan 0048, E5: die
 * Streuung zwischen zwei Läufen ist groß, ein zweiter Versuch fängt einen Teil davon).
 */
export function needsStrongRetry(applied: RefreshApplied, calls: readonly CallRecord[]): boolean {
  return applied.kind === "write" && applied.result === "einbruch" && !calls.some((c) => c.step === "fallback");
}

/**
 * Einbruch, den das Fallback-Modell nicht bestätigen konnte (Fehler, Bremse, Zeitbudget): Bestand bleibt, aber **ohne**
 * `pending`. Ein `pending` aus dem ersten Versuch übernähme die nächste Nacht bei gleicher Eingabe ungeprüft (E5);
 * so versucht sie es stattdessen erneut (Plan-Review B1).
 */
export function unconfirmedCollapse(ctx: RefreshContext, why: string): RefreshApplied {
  // auch ein älteres `pending` fällt weg: Es könnte bei Rückkehr zu seiner Eingabe sonst übernommen werden
  const { pending: _p, ...next } = failed(ctx, `Einbruch nicht bestätigt (${why}), Bestand bleibt`);
  return { kind: "write", next: withEmptySince(ctx, next), result: "einbruch" };
}

/** Ergebnis nach dem zweiten Versuch: Sein Ergebnis gilt; `fehler` heißt unbestätigt. Ein Abbruch geht durch. */
export function afterStrongRetry(ctx: RefreshContext, second: RefreshApplied): RefreshApplied {
  return second.kind === "write" && second.result === "fehler"
    ? unconfirmedCollapse(ctx, `Fallback-Modell: ${second.next.reason ?? "Fehler"}`)
    : second;
}

/**
 * Einbruch (E5): mindestens 3 alte künftige Angebote und weniger als die Hälfte bleibt, oder (neu, Plan 0048)
 * mindestens 1 altes und 0 neue. So löscht eine leere Antwort auf einer kleinen Seite keine Angebote samt IDs.
 */
const isCollapse = (old: number, fresh: number) =>
  (old >= COLLAPSE_MIN_OLD && fresh < old / 2) || (old >= 1 && fresh === 0);

/** Neue Events übernehmen oder als Einbruch zurückhalten (E5). */
function adopt(
  ctx: RefreshContext,
  key: ExtractKey,
  model: string,
  events: RawEvent[],
): { next: UnitState; result: "extrahiert" | "einbruch" } {
  const { prev, now } = ctx;
  const old = prev?.inputHash !== undefined ? eventUnits(prev.events, ctx.today) : (ctx.baseline ?? 0);
  const fresh = eventUnits(events, ctx.today);
  if (isCollapse(old, fresh)) {
    const pending = { ...stored({ inputHash: key.hash, dated: key.dated }, ctx.today), model, events };
    const next: UnitState =
      prev?.inputHash !== undefined
        ? { ...prev, pending }
        : {
            events: [],
            status: "fehler",
            reason: `Einbruch zurückgehalten (${old} → ${fresh} Angebote), Vorstand bleibt`,
            checkedAt: prev?.checkedAt ?? now,
            failingSince: prev?.failingSince ?? now,
            ...withSources(ctx),
            pending,
          };
    return { next, result: "einbruch" };
  }
  return { next: adopted(ctx, key, model, events), result: "extrahiert" };
}

/** Ergebnis je Anbieter aus den Ergebnissen seiner Einheiten (Bericht, Ampel; Plan 0048, E10). */
export type ProviderResult = RefreshResult | "teilausfall" | "umstellung-ausstehend" | "offen";

const FAILING: ReadonlySet<string> = new Set(["ausgefallen", "fehler", "entfernt"]);

/**
 * Ein Anbieter scheitert (`fehler`/`ausgefallen`) nur, wenn alle Einheiten scheitern; einzelne Seiten im Fehler sind
 * `teilausfall` (gelb, nicht in der 20-%-Regel). Sonst gilt das wichtigste Ergebnis: Einbruch vor Extraktion vor
 * Übernahme vor leer vor unverändert. Eine Einheit, die nicht dran kam, macht den Anbieter `offen`.
 */
export function summarize(results: readonly (RefreshResult | "offen")[]): ProviderResult {
  if (results.length === 0) return "leer";
  if (results.includes("offen")) return "offen";
  const failing = results.filter((r) => FAILING.has(r));
  if (failing.length === results.length) return failing.every((r) => r === "ausgefallen") ? "ausgefallen" : "fehler";
  if (failing.length > 0) return "teilausfall";
  for (const r of ["einbruch", "extrahiert", "pending-uebernommen", "leer"] as const) if (results.includes(r)) return r;
  return "unveraendert";
}

/**
 * Umstellung vom alten Format (E7): Ein Anbieter wechselt nur in V2, wenn alle Einheiten ein gültiges Ergebnis haben
 * (extrahiert oder leer) und die Summe ihrer künftigen Angebote nicht unter die Hälfte der alten fällt (bei mindestens
 * 3 alten). Sonst bleibt die V1-Datei unverändert; `--umstellen` erzwingt nach Prüfung.
 */
export function migrate(input: {
  /** künftige Angebote im alten Stand (`eventUnits` der V1-Datei, ohne Rohdatei die Angebote in `offers.json`) */
  old: number;
  units: ReadonlyArray<{ id: string; result: RefreshResult | "offen"; events: readonly RawEvent[] }>;
  today: string;
}): { ok: true } | { ok: false; reason: string } {
  const bad = input.units.filter((u) => u.result !== "extrahiert" && u.result !== "leer");
  if (bad.length > 0)
    return { ok: false, reason: `ohne gültiges Ergebnis: ${bad.map((u) => `${u.id} (${u.result})`).join(", ")}` };
  const { old } = input;
  const fresh = input.units.reduce((n, u) => n + eventUnits(u.events, input.today), 0);
  if (old >= COLLAPSE_MIN_OLD && fresh < old / 2) return { ok: false, reason: `Einbruch (${old} → ${fresh} Angebote)` };
  return { ok: true };
}
