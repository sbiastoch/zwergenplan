/**
 * RawBatches + Katalog + Ferien + Altbestand → data/offers.json (Plan 0002, E4–E8).
 * Rein und deterministisch: gleiche Eingabe und gleicher Vorstand, gleiche Ausgabe samt IDs (ADR 0022).
 */
import { validateDataset } from "../../../src/domain/dataset.ts";
import type { Offer, OffersFile, Provider, Session } from "../../../src/domain/schema.ts";
import { addDays, addMonths, berlinDate, fromBerlinLocal } from "../../../src/domain/time.ts";
import { fallbackCategory } from "../../../src/domain/topics.ts";
import type { Source } from "./candidate.ts";
import { birthCohort, cohortAge } from "./cohort.ts";
import {
  expansionWindow,
  isV2,
  type ProviderCheck,
  type ProviderRaw,
  providerStatus,
  type RawBatch,
  type RawEvent,
  rawExtracted,
} from "./raw.ts";
import { expandSchedule } from "./schedule.ts";
import { similarTitle } from "./similar.ts";
import { mergeParts } from "./split.ts";
import {
  assignIds,
  checkIdContinuity,
  compareOffers,
  type Draft,
  sameOfferTwice,
  unionSessions,
  windowKey,
} from "./stable-ids.ts";
import { KANDIDATEN, type MatchWindow, matchUnits, unitsOf } from "./units.ts";

export interface BuildInput {
  /** Rohdateien; die Reihenfolge der Namen bestimmt, wer bei Vereinigungen gewinnt */
  batches: ReadonlyArray<{ name: string; batch: RawBatch; checkedAt: string }>;
  providers: readonly Provider[];
  /** bisheriger Stand (fehlt beim ersten Lauf) */
  previous?: OffersFile | undefined;
  freeDays: Readonly<Record<string, string>>;
  horizon: { from: string; to: string };
  /** Zeitpunkt mit Offset */
  generatedAt: string;
  /** Abrufstatus der Sammelkalender (candidates/_status.json) */
  sources: Partial<Record<Source, ProviderCheck["status"]>>;
  /**
   * Zustand je Anbieter aus `data/raw` (Plan 0032, E5): Jeder bearbeitete Anbieter hat einen eigenen Status, auch
   * die mit `coveredBy`. Wer keinen hat (noch nie bearbeitet, Lauf vorzeitig beendet), behält seine Angebote aus
   * dem Vorstand.
   */
  perProviderStatus?: boolean;
  /**
   * Mit `perProviderStatus`: Anbieter, deren Events aus einer Extraktion stammen (`inputHash` in data/raw). Sie
   * bekommen nichts aus dem Vorstand, auch bei `fehler`: Ihre alten Events stehen schon in den Rohdaten, eine
   * zusätzliche Übernahme ergäbe Dubletten, wenn die Zuordnung eine neue ID vergibt (Arch-Review S2, m2).
   */
  extracted?: ReadonlySet<string>;
}

/** Datenhorizont von `data/offers.json` im Nachtlauf: heute + 12 Monate (Plan 0032, E5; ADR 0003 bisher 4). */
export const HORIZON_MONTHS = 12;

/**
 * `data/raw/<id>.json` → Rohdateien für `buildOffers` (Plan 0032, E5; Plan 0048, E6). Anbieter, die nicht (mehr) im
 * Katalog stehen, und Events mit einem Ort, den der Anbieter nicht (mehr) hat, entfallen mit Hinweis statt den Build zu
 * brechen. Im neuen Format (V2) gleicht `matchUnits` die Einheiten eines Anbieters ab (E12), dann vereinigt
 * `mergeParts` sie wie die Teile einer großen Eingabe (zuerst Einheiten mit `ok`, dann im Fehler, je in
 * Katalogreihenfolge, `kandidaten` zuletzt); so legt sich dasselbe Angebot von zwei Seiten vor Schritt 3 zusammen. Jedes
 * übrige Event kommt in den Batch seiner Einheit (`<id>#<nn>`, Katalogindex) mit deren `checkedAt`.
 */
export function batchesFromRaw(
  raws: Readonly<Record<string, ProviderRaw>>,
  providers: readonly Provider[],
  window: MatchWindow,
): {
  batches: BuildInput["batches"];
  extracted: Set<string>;
  notes: string[];
  /** Einheit je Batch `<id>#<nn>` (Ursprung für das ID-Gate, Plan 0049, Nachtrag 2) */
  unitOf: Record<string, string>;
} {
  const notes: string[] = [];
  const extracted = new Set<string>();
  const unitOf: Record<string, string> = {};
  const byId = new Map(providers.map((p) => [p.id, p] as const));
  const batches: Array<BuildInput["batches"][number]> = [];
  for (const [id, raw] of Object.entries(raws).sort(([a], [b]) => a.localeCompare(b))) {
    const p = byId.get(id);
    if (p?.role !== "anbieter") {
      notes.push(`data/raw/${id}.json: kein Anbieter im Katalog – entfällt`);
      continue;
    }
    if (rawExtracted(raw)) extracted.add(id);
    const venues = new Set(p.venues.map((v) => v.id));
    const own = (e: RawEvent) => {
      if (e.providerId === id && venues.has(e.venueId)) return true;
      notes.push(`data/raw/${id}.json „${e.title}“: Ort ${e.providerId}/${e.venueId} nicht im Katalog – entfällt`);
      return false;
    };
    const s = providerStatus(raw);
    const check: ProviderCheck = { status: s.status, ...(s.reason ? { reason: s.reason } : {}), checked: [] };
    if (!isV2(raw)) {
      batches.push({
        name: id,
        checkedAt: raw.checkedAt,
        batch: { providers: { [id]: check }, events: raw.events.filter(own) },
      });
      continue;
    }
    // Katalogindex je Kennung; verwaiste Einheiten (geänderte URL, E1) danach, `kandidaten` zuletzt
    const order = new Map(
      unitsOf(p, { candidates: true, hadKandidaten: true }).map((u, i) => [u.id, u.own ?? i] as const),
    );
    // verwaiste Einheiten (nicht mehr im Katalog) durchgezählt nach dem Katalog, `kandidaten` zuletzt (Arch-Review 2, m2)
    const orphans = Object.keys(raw.units)
      .filter((u) => u !== KANDIDATEN && !order.has(u))
      .sort();
    const indexOf = (unit: string) =>
      unit === KANDIDATEN
        ? p.programme.length + orphans.length
        : (order.get(unit) ?? p.programme.length + orphans.indexOf(unit));
    const units = Object.entries(raw.units)
      .sort(([a], [b]) => indexOf(a) - indexOf(b) || a.localeCompare(b))
      .map(([unit, u]) => ({ id: unit, failed: u.status === "fehler", events: u.events.filter(own), state: u }));
    const matched = matchUnits(units, window);
    notes.push(...matched.notes.map((n) => `data/raw/${id}.json: ${n}`));
    const merged = mergeParts(
      matched.units.map((u) => u.events),
      { from: window.horizon.from, to: window.horizon.to, freeDays: window.freeDays },
    );
    notes.push(...merged.notes.map((n) => `data/raw/${id}.json: ${n}`));
    matched.units.forEach((u, k) => {
      const state = raw.units[u.id];
      if (!state) return;
      const events = merged.events.filter((_, i) => merged.from[i] === k);
      const name = `${id}#${String(indexOf(u.id)).padStart(2, "0")}`;
      unitOf[name] = u.id;
      batches.push({
        name,
        checkedAt: state.checkedAt,
        batch: { providers: { [id]: check }, events },
      });
    });
  }
  return { batches, extracted, notes, unitOf };
}

/**
 * Horizont des Nachtlaufs ab `today` (YYYY-MM-DD, Europe/Berlin) und die Spanne der freien Tage, die er dafür lädt:
 * ein Jahr zurück (Abgleich mit dem Vorstand) bis zwei Jahre über den Horizont (Ausdehnung der Regeltermine).
 */
export function nightlyWindow(today: string): {
  horizon: { from: string; to: string };
  freeDaysSpan: { from: string; to: string };
} {
  const horizon = { from: today, to: addMonths(today, HORIZON_MONTHS) };
  return { horizon, freeDaysSpan: { from: addMonths(horizon.from, -12), to: addMonths(horizon.to, 24) } };
}

/**
 * Der Build des Nachtlaufs aus dem Zustand je Anbieter (`data/raw`), rein: `batchesFromRaw`, dann `buildOffers` mit
 * Zustand je Anbieter. Gemeinsam für `pipeline nightly`, `--build-only` und den Test der ID-Kontinuität
 * (`id-continuity.test.ts`, Plan 0049, Nachtrag 2, B7), damit der Test genau den Code des Nachtlaufs prüft.
 */
export function buildFromState(o: {
  raws: Readonly<Record<string, ProviderRaw>>;
  catalog: readonly Provider[];
  previous: OffersFile | undefined;
  today: string;
  /** über `nightlyWindow(today).freeDaysSpan` geladen */
  freeDays: Readonly<Record<string, string>>;
  generatedAt: string;
  sources: BuildInput["sources"];
}): { file?: OffersFile; report: BuildReport; notes: string[] } {
  const { horizon } = nightlyWindow(o.today);
  // vor `buildOffers`: Abgleich und Vereinigung der Einheiten brauchen die freien Tage (Plan 0048, E6)
  const { batches, extracted, notes } = batchesFromRaw(o.raws, o.catalog, {
    previous: o.previous?.offers,
    horizon,
    freeDays: o.freeDays,
  });
  const built = buildOffers({
    batches,
    providers: o.catalog,
    previous: o.previous,
    freeDays: o.freeDays,
    horizon,
    generatedAt: o.generatedAt,
    sources: o.sources,
    perProviderStatus: true,
    extracted,
  });
  return { ...built, notes };
}

export interface BuildReport {
  offers: number;
  sessions: number;
  providers: Record<ProviderCheck["status"], string[]>;
  failures: Array<{ id: string; reason: string }>;
  drift: Array<{ id: string; drift: string }>;
  /** Abbruchgründe – dann wird nichts geschrieben */
  errors: string[];
  /** Batch je vergebener ID, aus der Zuordnung dieses Laufs (nicht aus dem Altbestand; ID-Gate, Plan 0049, Nachtrag 2) */
  origins: Record<string, string>;
  /** Hinweise: geschätzte Enden, weggefallene Events, Zusammenführungen, Übernahmen */
  notes: string[];
  /** Angebote, deren `category` aus den Themen abgeleitet ist (Übergang Plan 0037, E5; entfällt in Stufe C) */
  derivedCategories: number;
}

/** Rangfolge bei Dubletten: Anbieterseite vor den Sammelkalendern (Plan 0002, E7). */
const RANK: Record<Source | "anbieter", number> = { anbieter: 0, "stadt-vk": 1, frankenkids: 2, evtermine: 3 };
const DEFAULT_MINUTES = 60;
const DAY_MS = 86_400_000;

export interface Candidate {
  offer: Draft;
  rank: number;
  order: number;
  label: string;
  /** Name des Batches, aus dem der Kandidat stammt */
  batch: string;
  /** `category` fehlte im Rohevent und kommt aus den Themen (Plan 0037, E5) */
  derivedCategory: boolean;
  /** ID-Erbe aus `RawEvent.keepIds` (Plan 0049, Nachtrag 2, B3); `null`: zwei verschiedene trafen zusammen, keins gilt */
  keepId?: string | null;
}

/**
 * Erbe beim Zusammenlegen zweier Kandidaten: Das erste gilt; zwei verschiedene heben sich auf (`null`), damit keine
 * ID still auf ein anderes Angebot wandert (ADR 0022: lieber neu als vertauscht).
 */
function mergeKeep(a: Candidate, b: Candidate, notes: string[]): Candidate["keepId"] {
  if (a.keepId === null || b.keepId === null) return null;
  if (a.keepId !== undefined && b.keepId !== undefined && a.keepId !== b.keepId) {
    notes.push(`${a.label}: ID-Erbe ${a.keepId} und ${b.keepId} treffen zusammen – keins gilt`);
    return null;
  }
  return a.keepId ?? b.keepId;
}
const withKeep = (c: Candidate, keepId: Candidate["keepId"]): Candidate => {
  const { keepId: _k, ...rest } = c;
  return keepId === undefined ? rest : { ...rest, keepId };
};

/** Erbe eines Entwurfs: die ID zum ersten seiner Termine, den `keepIds` nennt (Vergleich als Zeitpunkt). */
function keepOf(e: RawEvent, offer: Draft): string | undefined {
  if (!e.keepIds) return undefined;
  const byTime = new Map(Object.entries(e.keepIds).map(([start, id]) => [Date.parse(start), id] as const));
  for (const s of offer.sessions) {
    const id = byTime.get(Date.parse(s.start));
    if (id !== undefined) return id;
  }
  return undefined;
}

function addMinutesLocal(local: string, minutes: number): string {
  const [d, t] = local.split("T") as [string, string];
  const [y, mo, da] = d.split("-").map(Number) as [number, number, number];
  const [h, mi] = t.split(":").map(Number) as [number, number];
  return new Date(Date.UTC(y, mo - 1, da, h, mi + minutes)).toISOString().slice(0, 16);
}

const berlinDay = (instant: string) => {
  const { year, month, day } = berlinDate(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const sameAttributes = (a: Draft, b: Draft) =>
  a.format === b.format &&
  a.registration === b.registration &&
  a.cost === b.cost &&
  JSON.stringify(a.age ?? null) === JSON.stringify(b.age ?? null);

const unionTopics = (a: Offer["topics"], b: Offer["topics"]) => [...new Set([...a, ...b])];

/** Ein Rohevent → 0…n Angebote ohne ID (einmalig wird je Termin zerlegt). */
function fromRaw(e: RawEvent, checkedAt: string, input: BuildInput, label: string, notes: string[]): Draft[] {
  const { from, to } = input.horizon;
  const occurrences = expandSchedule(e.schedule, {
    to: expansionWindow(e, to),
    freeDays: input.freeDays,
    ...(e.format === "kurs" ? {} : { from }), // Kurse behalten ihre vergangenen Termine (Serien-ICS)
  });
  const sessions: Session[] = [];
  let estimated = 0;
  for (const o of occurrences) {
    let start: string;
    try {
      start = fromBerlinLocal(o.start);
    } catch (err) {
      notes.push(`${label}: Termin ${o.start} entfällt – ${(err as Error).message}`);
      continue;
    }
    let end: string | undefined;
    if (o.end !== undefined && o.end > o.start) {
      try {
        end = fromBerlinLocal(o.end);
      } catch {
        end = undefined;
      }
    }
    if (end === undefined) {
      estimated++;
      try {
        end = fromBerlinLocal(addMinutesLocal(o.start, DEFAULT_MINUTES));
      } catch {
        // Beginn + 60 Min. fällt in die fehlende Stunde (März): Ortszeit + 2 h = real 60 Min.
        end = fromBerlinLocal(addMinutesLocal(o.start, DEFAULT_MINUTES * 2));
      }
    }
    sessions.push({ start, end });
  }
  if (estimated > 0) notes.push(`${label}: Endzeit bei ${estimated} Termin(en) auf ${DEFAULT_MINUTES} Min. geschätzt`);

  const inHorizon = (s: Session) => berlinDay(s.start) >= from && berlinDay(s.start) <= to;
  const kept = e.format === "kurs" ? sessions : sessions.filter(inHorizon);
  if (kept.length === 0) {
    notes.push(`${label}: kein Termin im Horizont – entfällt`);
    return [];
  }
  if (e.format === "kurs" && berlinDay(kept.at(-1)?.start ?? "") < from) {
    notes.push(`${label}: Kurs ist schon vorbei – entfällt`);
    return [];
  }
  if (e.format === "kurs" && berlinDay(kept[0]?.start ?? "") > to) {
    notes.push(`${label}: Kurs beginnt nach dem Horizont – entfällt`);
    return [];
  }
  // Geburtszeitraum im Titel schlägt die Altersangabe des Modells, nur bei Kurs und Einzeltermin (Plan 0053, E3):
  // Eine regelmäßige Gruppe wächst mit, ein festes Alter wäre dort ab dem nächsten Monat falsch.
  const cohort = e.format === "regelmaessig" ? undefined : birthCohort(e.title);
  const ageAt = (s: Session) => (cohort && cohortAge(cohort, s.start)) ?? e.age;
  // Mit Geburtszeitraum wächst das Alter von Termin zu Termin: Einzeltermine je Termin prüfen, sonst entstünde ein
  // späterer mit minMonths > 36 (ungültiges AgeRange, Build rot; Arch-Review Plan 0053, M1). Kurse am ersten Termin.
  const tooOld = (s: Session) => (ageAt(s)?.minMonths ?? 0) > 36;
  const young = e.format === "einmalig" ? kept.filter((s) => !tooOld(s)) : kept;
  const [first] = young;
  if (!first || tooOld(first)) {
    const min = kept[0] && ageAt(kept[0])?.minMonths;
    notes.push(`${label}: erst ab ${min} Monaten – entfällt`);
    return [];
  }
  if (young.length < kept.length)
    notes.push(`${label}: ${kept.length - young.length} Termin(e) erst ab über 36 Monaten – entfallen`);
  const local = (t: string | undefined) => {
    if (t === undefined) return undefined;
    try {
      return fromBerlinLocal(t);
    } catch (err) {
      notes.push(`${label}: Anmeldefrist ${t} entfällt – ${(err as Error).message}`);
      return undefined;
    }
  };
  const window = e.registrationWindow;
  const opens = local(window?.opens);
  const deadline = local(window?.deadline);
  const capped = (s: Session) => {
    const age = ageAt(s);
    return age === undefined ? {} : { age: { minMonths: age.minMonths, maxMonths: Math.min(36, age.maxMonths) } };
  };
  const base: Omit<Offer, "id" | "sessions" | "age"> = {
    providerId: e.providerId,
    venueId: e.venueId,
    title: e.title,
    summary: e.summary,
    // Übergang Plan 0037 (E5): Rückfall für Stände ohne category; entfällt in Stufe C
    category: e.category ?? fallbackCategory(e.topics),
    topics: e.topics,
    format: e.format,
    registration: e.registration,
    cost: e.cost,
    ...(e.price === undefined ? {} : { price: e.price }),
    ...(opens || deadline
      ? { registrationWindow: { ...(opens ? { opens } : {}), ...(deadline ? { deadline } : {}) } }
      : {}),
    availability: { ...e.availability, checkedAt },
    url: e.url,
    sourceUrl: e.sourceUrl,
  };
  // Einzeltermine je Termin, sonst am ersten Termin (ein Kurs passt zum Alter bei Beginn, ADR 0007)
  return e.format === "einmalig"
    ? young.map((s) => ({ ...base, ...capped(s), sessions: [s] }))
    : [{ ...base, ...capped(first), sessions: young }];
}

/**
 * Kurs mit Geburtszeitraum: das Alter am wirklichen Kursbeginn, also erst nach der Fortschreibung um vergangene
 * Termine (`assignIds`). `fromRaw` kennt nur die Termine der Quelle ab heute (Plan 0053, E3).
 */
function courseCohortAge(offer: Offer): Offer {
  const cohort = offer.format === "kurs" ? birthCohort(offer.title) : undefined;
  const [first] = offer.sessions;
  const age = cohort && first && cohortAge(cohort, first.start);
  return age ? { ...offer, age: { minMonths: age.minMonths, maxMonths: Math.min(36, age.maxMonths) } } : offer;
}

/**
 * Schritt 4b: Dubletten gleicher Quelle (Plan 0038, E1; ADR 0031). Unter Kandidaten gleichen Rangs entfällt, wer einem
 * schon behaltenen doppelt ist (`sameOfferTwice`). Vorn stehen die, deren Fensterschlüssel im Vorstand vorkommt, dann
 * gilt `order`; so springt der Titel nicht mit der Reihenfolge des Modells. Der Bleibende behält alles außer den
 * Themen (vereinigt), auch `derivedCategory`; Termine werden nicht vereinigt (meist herausgenommene Ferientage).
 * Rein: Die Eingabe bleibt unverändert, `kept` steht in ihrer Reihenfolge.
 */
export function dropSameSourceDuplicates(
  candidates: readonly Candidate[],
  previousWindowKeys: ReadonlySet<string>,
  from: string,
): { kept: Candidate[]; notes: string[] } {
  const notes: string[] = [];
  const inPrevious = (c: Candidate) => (previousWindowKeys.has(windowKey(c.offer, from)) ? 0 : 1);
  const sorted = candidates
    .map((c, index) => ({ c, index, previous: inPrevious(c) }))
    .sort((a, b) => a.previous - b.previous || a.c.order - b.c.order);
  const survivors: Array<{ c: Candidate; index: number }> = [];
  for (const { c: low, index } of sorted) {
    const high = survivors.find(({ c }) => c.rank === low.rank && sameOfferTwice(c.offer, low.offer, from));
    if (high === undefined) {
      survivors.push({ c: { ...low }, index });
      continue;
    }
    high.c = withKeep(
      { ...high.c, offer: { ...high.c.offer, topics: unionTopics(high.c.offer.topics, low.offer.topics) } },
      mergeKeep(high.c, low, notes),
    );
    notes.push(`${low.label}: Dublette von ${high.c.label} (gleiche Quelle, gleiche Termine) – entfällt`);
  }
  return { kept: survivors.sort((a, b) => a.index - b.index).map(({ c }) => c), notes };
}

/** Mindestpause vor einem neuen Durchgang unter alter ID (Plan 0043, E1) */
const NEW_RUN_GAP_DAYS = 14;

/**
 * Neuer Kursdurchgang unter alter ID (Plan 0043, E1): Beide sind Kurse, der erste Termin, den der Vorgänger nicht
 * hatte, lag schon in dessen Horizont (hätte also im alten Stand stehen können) und beginnt mindestens 14 Berliner
 * Kalendertage nach dessen letztem Termin. Das nächtliche Wachsen unbefristeter Angebote mit dem Horizont (Review 4,
 * B1) und angehängte Nachholtermine zählen nicht, regelmäßige Angebote nie: Anbieter, die nur die nächsten Termine
 * nennen, hängen sonst bei jedem neuen Monatstermin wieder „Neu“ an (Arch-Review M1).
 */
export function isNewRun(
  previous: Pick<Offer, "format" | "sessions">,
  next: Pick<Offer, "format" | "sessions">,
  previousHorizonTo: string,
): boolean {
  if (previous.format !== "kurs" || next.format !== "kurs") return false;
  const known = new Set(previous.sessions.map((s) => Date.parse(s.start)));
  const firstNew = next.sessions.find((s) => !known.has(Date.parse(s.start)));
  const last = previous.sessions.at(-1);
  if (firstNew === undefined || last === undefined) return false;
  const day = berlinDay(firstNew.start);
  return day <= previousHorizonTo && day >= addDays(berlinDay(last.start), NEW_RUN_GAP_DAYS);
}

/** `listedAt` hängt an der ID (ADR 0022): vom Vorgänger übernommen, auch „fehlt“; neu oder neuer Durchgang: jetzt. */
function withListedAt(offer: Offer, previous: Offer | undefined, input: BuildInput): Offer {
  const horizonTo = input.previous?.horizon.to;
  if (previous === undefined || (horizonTo !== undefined && isNewRun(previous, offer, horizonTo)))
    return { ...offer, listedAt: input.generatedAt };
  return previous.listedAt === undefined ? offer : { ...offer, listedAt: previous.listedAt };
}

/** Gleicher Ort (≤ 50 m), gleicher Beginn, ähnlicher Titel, aber verschiedene Anbieter – meist derselbe Kurs zweimal erfasst. */
function crossProviderDuplicates(offers: readonly Offer[], providers: readonly Provider[]): string[] {
  const geo = new Map(
    providers.flatMap((p) => (p.role === "anbieter" ? p.venues.map((v) => [v.id, v.geo] as const) : [])),
  );
  const near = (a: string, b: string) => {
    const ga = geo.get(a);
    const gb = geo.get(b);
    return !!ga && !!gb && Math.hypot((ga.lat - gb.lat) * 110_540, (ga.lon - gb.lon) * 72_000) <= 50;
  };
  const out: string[] = [];
  offers.forEach((a, i) => {
    for (const b of offers.slice(i + 1)) {
      if (a.providerId === b.providerId || !near(a.venueId, b.venueId) || !similarTitle(a.title, b.title)) continue;
      const starts = new Set(a.sessions.map((s) => Date.parse(s.start)));
      if (b.sessions.some((s) => starts.has(Date.parse(s.start))))
        out.push(`Mögliche Dublette über Anbieter: ${a.id} und ${b.id} – nur beim tatsächlichen Veranstalter erfassen`);
    }
  });
  return out;
}

export function buildOffers(input: BuildInput): { file?: OffersFile; report: BuildReport } {
  const report: BuildReport = {
    offers: 0,
    sessions: 0,
    providers: { ok: [], "keine-termine": [], fehler: [] },
    failures: [],
    drift: [],
    errors: [],
    notes: [],
    derivedCategories: 0,
    origins: {},
  };
  const { notes } = report;
  /** Angebote mit abgeleiteter Kategorie je Anbieter (Plan 0037, E5) */
  const derived = new Map<string, number>();
  const countDerived = (providerId: string) => derived.set(providerId, (derived.get(providerId) ?? 0) + 1);
  const batches = [...input.batches].sort((a, b) => a.name.localeCompare(b.name));
  const status = new Map<string, ProviderCheck>();
  for (const { batch } of batches) for (const [id, check] of Object.entries(batch.providers)) status.set(id, check);
  for (const [id, check] of [...status.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    report.providers[check.status].push(id);
    if (check.status === "fehler") report.failures.push({ id, reason: check.reason ?? "ohne Grund" });
    if (check.drift) report.drift.push({ id, drift: check.drift });
  }

  // 1. Rohevents → Kandidaten
  const candidates: Candidate[] = [];
  let order = 0;
  for (const { name, batch, checkedAt } of batches) {
    batch.events.forEach((e, i) => {
      const label = `${name}#${i} „${e.title}“`;
      for (const offer of fromRaw(e, checkedAt, input, label, notes)) {
        const keepId = keepOf(e, offer);
        candidates.push({
          offer,
          rank: RANK[e.via ?? "anbieter"],
          order: order++,
          label,
          batch: name,
          derivedCategory: e.category === undefined,
          ...(keepId === undefined ? {} : { keepId }),
        });
      }
    });
  }

  // 2. Die Kursfortschreibung hängt an der Zuordnung (Schritt 5, ADR 0022)
  const previous = input.previous?.offers ?? [];

  // 3. Gleicher Fensterschlüssel (Plan 0015 E14, m3): Rang, dann Vereinigung (regelmäßig) bzw. Dublette (Kurs/Einzeltermin)
  const byKey = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = windowKey(c.offer, input.horizon.from);
    byKey.set(key, [...(byKey.get(key) ?? []), c]);
  }
  const merged: Candidate[] = [];
  for (const [key, group] of byKey) {
    const sorted = [...group].sort((a, b) => a.rank - b.rank || a.order - b.order);
    const [best, ...rest] = sorted as [Candidate, ...Candidate[]];
    let offer = best.offer;
    let keep = best;
    for (const other of rest) {
      keep = withKeep(keep, mergeKeep(keep, other, notes));
      // `category` bleibt die von `best`: ranghöhere Quelle, bei gleichem Rang das frühere Event (Plan 0037, E6)
      offer = { ...offer, topics: unionTopics(offer.topics, other.offer.topics) };
      if (other.rank !== best.rank) {
        notes.push(`${other.label}: Dublette von ${best.label} (ranghöhere Quelle) – entfällt`);
      } else if (offer.format !== "regelmaessig") {
        offer = { ...offer, sessions: unionSessions(offer.sessions, other.offer.sessions) };
        notes.push(`${other.label}: gleicher Schlüssel wie ${best.label} – Termine zusammengeführt`);
      } else if (offer.title !== other.offer.title) {
        report.errors.push(
          `Schlüssel ${key}: „${offer.title}“ und „${other.offer.title}“ unterscheiden sich erst nach der Kürzung auf 60 Zeichen – Titel vorne unterscheidbar machen`,
        );
      } else if (sameAttributes(offer, other.offer)) {
        offer = { ...offer, sessions: unionSessions(offer.sessions, other.offer.sessions) };
        notes.push(`${other.label}: Termine mit ${best.label} vereinigt`);
      } else {
        report.errors.push(
          `Schlüssel ${key}: ${best.label} und ${other.label} haben gleichen Titel und Ort, aber andere Merkmale – Titel eindeutig machen, z. B. mit Altersangabe`,
        );
      }
    }
    merged.push({ ...withKeep(best, keep.keepId), offer });
  }

  // 4. Dubletten über Titel hinweg: gleicher Anbieter/Ort/Beginn, ähnlicher Titel, rangniedere Quelle entfällt
  const kept = merged.filter((low) => {
    const high = merged.find(
      (h) =>
        h !== low &&
        h.rank < low.rank &&
        h.offer.providerId === low.offer.providerId &&
        h.offer.venueId === low.offer.venueId &&
        similarTitle(h.offer.title, low.offer.title) &&
        h.offer.sessions.some((s) => low.offer.sessions.some((l) => Date.parse(l.start) === Date.parse(s.start))),
    );
    if (!high) return true;
    // `category` bleibt die von `high` (Plan 0037, E6), nur die Themen werden vereinigt
    high.offer = { ...high.offer, topics: unionTopics(high.offer.topics, low.offer.topics) };
    const keepId = mergeKeep(high, low, notes);
    if (keepId !== undefined) high.keepId = keepId;
    notes.push(`${low.label}: Dublette von ${high.label} (ranghöhere Quelle) – entfällt`);
    return false;
  });
  // 4b. Dubletten gleicher Quelle: gleicher Rang, gleiches Angebot zweimal (Plan 0038, E1; ADR 0031)
  const previousWindowKeys = new Set(previous.map((o) => windowKey(o, input.horizon.from)));
  const deduped = dropSameSourceDuplicates(kept, previousWindowKeys, input.horizon.from);
  notes.push(...deduped.notes);
  // 5. IDs: Zuordnung gegen den Vorstand samt Kursfortschreibung (ADR 0022)
  const assigned = assignIds({
    drafts: deduped.kept.map((c) => c.offer),
    keepIds: deduped.kept.map((c) => c.keepId ?? undefined),
    previous: input.previous,
    providers: input.providers,
    horizon: input.horizon,
  });
  assigned.offers.forEach((o, i) => {
    const c = deduped.kept[assigned.sources[i] ?? -1];
    if (c) report.origins[o.id] = c.batch;
  });
  const previousById = new Map(previous.map((o) => [o.id, o] as const));
  const offers = assigned.offers.map((o) => courseCohortAge(withListedAt(o, previousById.get(o.id), input)));
  notes.push(...assigned.notes);
  for (const c of deduped.kept) if (c.derivedCategory) countDerived(c.offer.providerId);
  // 6. braucht IDs, deshalb nach der Zuordnung
  notes.push(...crossProviderDuplicates(offers, input.providers));

  // 7. Übernahme aus dem Altbestand (E8): Fehler, ausgefallener Sammelkalender, nicht geprüft
  const providerById = new Map(input.providers.map((p) => [p.id, p] as const));
  const failedSources = new Set(
    input.providers
      .filter((p) => p.role === "aggregator" && p.adapter !== undefined && input.sources[p.adapter] === "fehler")
      .map((p) => p.id),
  );
  const carryReason = (providerId: string): string | undefined => {
    const p = providerById.get(providerId);
    if (p?.role !== "anbieter") return undefined;
    if (input.perProviderStatus && input.extracted?.has(providerId)) return undefined;
    const s = status.get(providerId);
    if (s?.status === "fehler") return "Prüfung fehlgeschlagen";
    if (s === undefined && input.perProviderStatus) return "noch nicht bearbeitet";
    if (s === undefined && p.coveredBy !== undefined && failedSources.has(p.coveredBy))
      return `${p.coveredBy} nicht erreichbar`;
    if (s === undefined && p.coveredBy === undefined) return "in diesem Lauf nicht geprüft";
    return undefined;
  };
  const ids = new Set(offers.map((o) => o.id));
  const cutoff = Date.parse(input.generatedAt) - DAY_MS;
  for (const old of previous) {
    const reason = carryReason(old.providerId);
    if (reason === undefined || ids.has(old.id)) continue;
    const owner = providerById.get(old.providerId);
    const venueOk = owner?.role === "anbieter" && owner.venues.some((v) => v.id === old.venueId);
    if (!venueOk) continue;
    const sessions =
      old.format === "kurs" ? old.sessions : old.sessions.filter((s) => berlinDay(s.start) >= input.horizon.from);
    if (sessions.length === 0 || Date.parse(sessions.at(-1)?.end ?? "") < cutoff) continue;
    // Übergang Plan 0037 (E5): Rückfall für Stände ohne category; entfällt in Stufe C. Ab Stufe B nur noch im Speicher
    // erreichbar, denn `readPreviousOffers` lehnt einen Bestand ohne category per Schema ab.
    if (old.category === undefined) countDerived(old.providerId);
    offers.push({ ...old, category: old.category ?? fallbackCategory(old.topics), sessions });
    ids.add(old.id);
    notes.push(`${old.id}: aus dem Altbestand übernommen (${reason}, Stand ${old.availability.checkedAt})`);
  }

  for (const [providerId, n] of [...derived].sort(([a], [b]) => a.localeCompare(b))) {
    report.derivedCategories += n;
    notes.push(
      `${providerId}: ${n} ${n === 1 ? "Angebot" : "Angebote"} ohne category – aus den Themen abgeleitet (Übergang Plan 0037)`,
    );
  }

  // 8. Sortierung (Plan 0015 E13), Prüfung
  offers.sort(compareOffers);
  const file: OffersFile = { generatedAt: input.generatedAt, horizon: input.horizon, offers };
  const result = validateDataset(input.providers, file);
  if (!result.ok) report.errors.push(...result.errors);
  report.errors.push(...checkIdContinuity(input.previous, offers));
  report.offers = offers.length;
  report.sessions = offers.reduce((n, o) => n + o.sessions.length, 0);
  return report.errors.length > 0 ? { report } : { file, report };
}
