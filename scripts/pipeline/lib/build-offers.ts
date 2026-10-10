/**
 * RawBatches + Katalog + Ferien + Altbestand → data/offers.json (Plan 0002, E4–E8).
 * Rein und deterministisch: gleiche Eingabe und gleicher Vorstand, gleiche Ausgabe samt IDs (ADR 0022).
 */
import { validateDataset } from "../../../src/domain/dataset.ts";
import type { Offer, OffersFile, Provider, Session } from "../../../src/domain/schema.ts";
import { berlinDate, fromBerlinLocal } from "../../../src/domain/time.ts";
import type { Source } from "./candidate.ts";
import { expansionWindow, type ProviderCheck, type RawBatch, type RawEvent } from "./raw.ts";
import { expandSchedule } from "./schedule.ts";
import { similarTitle } from "./similar.ts";
import { assignIds, checkIdContinuity, compareOffers, type Draft, unionSessions, windowKey } from "./stable-ids.ts";

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
}

export interface BuildReport {
  offers: number;
  sessions: number;
  providers: Record<ProviderCheck["status"], string[]>;
  failures: Array<{ id: string; reason: string }>;
  drift: Array<{ id: string; drift: string }>;
  /** Abbruchgründe – dann wird nichts geschrieben */
  errors: string[];
  /** Hinweise: geschätzte Enden, weggefallene Events, Zusammenführungen, Übernahmen */
  notes: string[];
}

/** Rangfolge bei Dubletten: Anbieterseite vor den Sammelkalendern (Plan 0002, E7). */
const RANK: Record<Source | "anbieter", number> = { anbieter: 0, "stadt-vk": 1, frankenkids: 2, evtermine: 3 };
const DEFAULT_MINUTES = 60;
const DAY_MS = 86_400_000;

interface Candidate {
  offer: Draft;
  rank: number;
  order: number;
  label: string;
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
  if (e.age && e.age.minMonths > 36) {
    notes.push(`${label}: erst ab ${e.age.minMonths} Monaten – entfällt`);
    return [];
  }
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
  const base: Omit<Offer, "id" | "sessions"> = {
    providerId: e.providerId,
    venueId: e.venueId,
    title: e.title,
    summary: e.summary,
    topics: e.topics,
    format: e.format,
    registration: e.registration,
    cost: e.cost,
    ...(e.price === undefined ? {} : { price: e.price }),
    ...(e.age === undefined ? {} : { age: { minMonths: e.age.minMonths, maxMonths: Math.min(36, e.age.maxMonths) } }),
    ...(opens || deadline
      ? { registrationWindow: { ...(opens ? { opens } : {}), ...(deadline ? { deadline } : {}) } }
      : {}),
    availability: { ...e.availability, checkedAt },
    url: e.url,
    sourceUrl: e.sourceUrl,
  };
  return e.format === "einmalig" ? kept.map((s) => ({ ...base, sessions: [s] })) : [{ ...base, sessions: kept }];
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
  };
  const { notes } = report;
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
        candidates.push({ offer, rank: RANK[e.via ?? "anbieter"], order: order++, label });
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
    for (const other of rest) {
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
    merged.push({ ...best, offer });
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
    high.offer = { ...high.offer, topics: unionTopics(high.offer.topics, low.offer.topics) };
    notes.push(`${low.label}: Dublette von ${high.label} (ranghöhere Quelle) – entfällt`);
    return false;
  });
  // 5. IDs: Zuordnung gegen den Vorstand samt Kursfortschreibung (ADR 0022)
  const assigned = assignIds({
    drafts: kept.map((c) => c.offer),
    previous: input.previous,
    providers: input.providers,
    horizon: input.horizon,
  });
  const offers = assigned.offers;
  notes.push(...assigned.notes);
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
    const s = status.get(providerId);
    if (s?.status === "fehler") return "Prüfung fehlgeschlagen";
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
    offers.push({ ...old, sessions });
    ids.add(old.id);
    notes.push(`${old.id}: aus dem Altbestand übernommen (${reason}, Stand ${old.availability.checkedAt})`);
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
