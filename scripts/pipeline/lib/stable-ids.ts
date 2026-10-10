/**
 * Stabile Angebots-IDs (ADR 0022, Plan 0015 E13–E17): Die ID ist gespeichert, nicht abgeleitet. `assignIds` ordnet
 * die Entwürfe eines Laufs dem Vorstand (data/offers.json vor dem Lauf) zu und übernimmt dessen IDs; nur Entwürfe ohne
 * Partner bekommen eine neue. Rein und deterministisch: gleiche Eingabe und gleicher Vorstand ergeben dieselben IDs.
 *
 * Lieber eine neue ID als eine vertauschte: Eine neue ID ist der Zustand vor ADR 0022, eine falsche Zuordnung ließe
 * einen alten Link still auf ein fremdes Angebot zeigen. Deshalb verlangen Stufe 1 und 2 Eindeutigkeit.
 */
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { z } from "zod";
import { validateDataset } from "../../../src/domain/dataset.ts";
import { LEGACY_OFFER_ID_PATTERN, offerKey, SHORT_ID_PATTERN, shortId } from "../../../src/domain/ids.ts";
import { type Offer, OfferFields, OffersFile, type Provider, type Session } from "../../../src/domain/schema.ts";
import { berlinDate } from "../../../src/domain/time.ts";
import { similarTitle } from "./similar.ts";

export type Draft = Omit<Offer, "id">;

export interface IdAssignment {
  offers: Offer[];
  notes: string[];
}

/**
 * Schwellen der Zuordnung (ADR 0004: Änderung nur mit Begründung im Code und im Commit).
 * 0,8 lässt einer Wochengruppe einzelne Ferientage; 0,5 lässt eine Uhrzeit wechseln und einige Termine wegfallen.
 */
export const SAME_SESSIONS = 0.8;
export const SAME_DAYS = 0.5;

const berlinDay = (instant: string) => {
  const { year, month, day } = berlinDate(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/** Schlüssel mit dem ersten Termin (ADR 0006); fehlt ein Termin, der leere Beginn. */
export const keyOf = (o: Draft): string => offerKey({ ...o, firstStart: o.sessions[0]?.start ?? "" });

/** Fensterschlüssel: `offerKey` mit dem ersten Termin ab `from`, ohne Termin im Fenster mit dem ersten (E14, m3). */
export function windowKey(o: Draft, from: string): string {
  const first = o.sessions.find((s) => berlinDay(s.start) >= from) ?? o.sessions[0];
  return offerKey({ ...o, firstStart: first?.start ?? "" });
}

/** Sortierung von data/offers.json (E13): lesbare Diffs nach Anbieter und Titel. */
export function compareOffers(a: Offer, b: Offer): number {
  return (
    a.providerId.localeCompare(b.providerId) ||
    a.title.localeCompare(b.title, "de") ||
    Date.parse(a.sessions[0]?.start ?? "") - Date.parse(b.sessions[0]?.start ?? "") ||
    a.id.localeCompare(b.id)
  );
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) out.set(key(item), [...(out.get(key(item)) ?? []), item]);
  return out;
}

function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return both / (a.size + b.size - both);
}

export function unionSessions(...lists: ReadonlyArray<readonly Session[]>): Session[] {
  const byStart = new Map<number, Session>();
  for (const s of lists.flat()) if (!byStart.has(Date.parse(s.start))) byStart.set(Date.parse(s.start), s);
  return [...byStart.entries()].sort(([a], [b]) => a - b).map(([, s]) => s);
}

interface Side {
  offer: Draft;
  /** Beginn auf die Minute, nur Termine im Vergleichsfenster */
  minutes: Set<number>;
  days: Set<string>;
}

function side(offer: Draft, from: string, to: string): Side {
  const inWindow = offer.sessions.filter((s) => {
    const d = berlinDay(s.start);
    return d >= from && d <= to;
  });
  return {
    offer,
    minutes: new Set(inWindow.map((s) => Math.floor(Date.parse(s.start) / 60_000))),
    days: new Set(inWindow.map((s) => berlinDay(s.start))),
  };
}

export function assignIds(input: {
  /** nach den Dubletten-Schritten von buildOffers */
  drafts: readonly Draft[];
  /** data/offers.json vor dem Lauf (fehlt beim ersten Lauf) */
  previous: OffersFile | undefined;
  /** Katalog, für vorhandene Orte */
  providers: readonly Provider[];
  /** Datenhorizont des Laufs (Berliner Daten) */
  horizon: { from: string; to: string };
}): IdAssignment {
  const { from } = input.horizon;
  const to =
    input.previous && input.previous.horizon.to < input.horizon.to ? input.previous.horizon.to : input.horizon.to;
  const venues = new Set(input.providers.flatMap((p) => (p.role === "anbieter" ? p.venues.map((v) => v.id) : [])));
  const notes: string[] = [];

  // Feste Reihenfolge: Ergebnis unabhängig von der Eingabereihenfolge
  const olds = [...(input.previous?.offers ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const drafts = input.drafts
    .map((d) => ({ d, key: keyOf(d) }))
    .sort((a, b) => a.key.localeCompare(b.key) || JSON.stringify(a.d).localeCompare(JSON.stringify(b.d)));
  const P = olds.map((p) => ({ ...side(p, from, to), id: p.id, window: windowKey(p, from) }));
  const D = drafts.map(({ d, key }) => ({ ...side(d, from, to), key, window: windowKey(d, from) }));

  const partnerOfDraft = new Map<number, number>(); // Entwurf → Vorstand
  const partnerOfOld = new Map<number, number>();
  const stageOf = new Map<number, 0 | 1 | 2>();
  const match = (pi: number, di: number, stage: 0 | 1 | 2) => {
    partnerOfDraft.set(di, pi);
    partnerOfOld.set(pi, di);
    stageOf.set(di, stage);
  };
  const free = <T>(list: readonly T[], taken: ReadonlyMap<number, number>) =>
    list.flatMap((_, i) => (taken.has(i) ? [] : [i]));

  // Stufe 0: gleicher Fensterschlüssel, nur bei genau einem Paar. Fensterschlüssel statt `offerKey`: Ein laufender
  // Kurs, dessen Quelle die vergangenen Termine nicht mehr nennt, hat einen anderen ersten Termin (wie Dubletten, m3).
  const oldsByKey = groupBy(
    P.map((_, i) => i),
    (i) => P[i]?.window ?? "",
  );
  const draftsByKey = groupBy(
    D.map((_, i) => i),
    (i) => D[i]?.window ?? "",
  );
  for (const [key, ds] of draftsByKey) {
    const ps = oldsByKey.get(key) ?? [];
    if (ds.length === 1 && ps.length === 1) match(ps[0] as number, ds[0] as number, 0);
  }

  const sameProvider = (pi: number, di: number) => P[pi]?.offer.providerId === D[di]?.offer.providerId;
  const stage1 = (pi: number, di: number) => {
    const p = P[pi] as (typeof P)[number];
    const d = D[di] as (typeof D)[number];
    if (!sameProvider(pi, di)) return 0;
    if (p.offer.venueId !== d.offer.venueId && venues.has(p.offer.venueId)) return 0;
    const t = jaccard(p.minutes, d.minutes);
    if (t < SAME_SESSIONS) return 0;
    // Titel-Widerspruch: Ähnelt der neue Titel nicht dem alten, aber einem anderen offenen Angebot desselben Anbieters,
    // ist eher ein Schwesterangebot auf den frei gewordenen Platz gerückt (Probelauf, Durchgang 3). Dann kein Treffer.
    if (similarTitle(p.offer.title, d.offer.title)) return t;
    const rival = P.some(
      (q, qi) =>
        qi !== pi &&
        !partnerOfOld.has(qi) &&
        q.offer.providerId === d.offer.providerId &&
        similarTitle(q.offer.title, d.offer.title),
    );
    return rival ? 0 : t;
  };
  const stage2 = (pi: number, di: number) => {
    const p = P[pi] as (typeof P)[number];
    const d = D[di] as (typeof D)[number];
    return (
      sameProvider(pi, di) &&
      p.offer.venueId === d.offer.venueId &&
      p.offer.format === d.offer.format &&
      similarTitle(p.offer.title, d.offer.title) &&
      jaccard(p.days, d.days) >= SAME_DAYS
    );
  };

  // Stufe 1: gleiche Termine, strikt bester Partner für beide Seiten; wiederholt, bis sich nichts mehr ändert
  for (let changed = true; changed; ) {
    changed = false;
    const pairs = free(P, partnerOfOld).flatMap((pi) =>
      free(D, partnerOfDraft).flatMap((di) => {
        const t = stage1(pi, di);
        return t > 0 ? [{ pi, di, t }] : [];
      }),
    );
    for (const { pi, di, t } of pairs) {
      const rivals = pairs.filter((q) => (q.pi === pi) !== (q.di === di));
      if (rivals.every((q) => q.t < t)) {
        match(pi, di, 1);
        changed = true;
      }
    }
  }
  for (const pi of free(P, partnerOfOld)) {
    const ds = free(D, partnerOfDraft).filter((di) => stage1(pi, di) > 0);
    if (ds.length > 0)
      notes.push(
        `IDs: mehrdeutig in Stufe 1 – ${P[pi]?.id} „${P[pi]?.offer.title}“ passt gleich gut zu ${ds.map((di) => `„${D[di]?.offer.title}“`).join(", ")}`,
      );
  }

  // Stufe 2: ähnlicher Titel, gleiche Tage, nur als einziger Kandidat auf beiden Seiten
  const openOlds = free(P, partnerOfOld);
  const openDrafts = free(D, partnerOfDraft);
  for (const pi of openOlds) {
    const ds = openDrafts.filter((di) => stage2(pi, di));
    if (ds.length > 1) {
      notes.push(`IDs: mehrdeutig in Stufe 2 – ${P[pi]?.id} „${P[pi]?.offer.title}“ hat ${ds.length} Kandidaten`);
      continue;
    }
    const di = ds[0];
    if (di === undefined) continue;
    if (openOlds.filter((qi) => stage2(qi, di)).length === 1) match(pi, di, 2);
  }

  // Vergabe: Treffer übernehmen die ID (samt Kursfortschreibung), alle anderen bekommen eine neue
  const occupied = new Set(olds.map((p) => p.id));
  const offers: Offer[] = [];
  const counts = [0, 0, 0];
  const fresh: number[] = [];
  D.forEach(({ offer: d }, di) => {
    const pi = partnerOfDraft.get(di);
    if (pi === undefined) {
      fresh.push(di);
      return;
    }
    const p = P[pi] as (typeof P)[number];
    const stage = stageOf.get(di) ?? 0;
    counts[stage] = (counts[stage] ?? 0) + 1;
    let sessions = d.sessions;
    if (p.offer.format === "kurs" && d.format === "kurs") {
      // Kursfortschreibung: nur wirklich vergangene Termine (vor horizon.from), nie abgesagte künftige (Review m2)
      const past = p.offer.sessions.filter((s) => berlinDay(s.start) < from);
      const merged = unionSessions(past, d.sessions);
      if (merged.length > d.sessions.length) {
        sessions = merged;
        notes.push(`${p.id}: Kurs fortgeschrieben (${merged.length - d.sessions.length} vergangene Termine)`);
      }
    }
    if (stage > 0) notes.push(`IDs: Stufe ${stage} ${p.id} „${p.offer.title}“ → „${d.title}“`);
    offers.push({ id: p.id, ...d, sessions });
  });
  for (const di of fresh) {
    const { offer: d, key } = D[di] as (typeof D)[number];
    let seed = 0;
    while (occupied.has(shortId(key, seed))) seed++;
    const id = shortId(key, seed);
    occupied.add(id);
    offers.push({ id, ...d });
  }

  // Teilung: ein Vorstand mit Partner passt auch zu einem Entwurf, der neu ist
  for (const [pi, di] of partnerOfOld) {
    const split = fresh.filter((fi) => stage1(pi, fi) > 0 || stage2(pi, fi));
    if (split.length > 0)
      notes.push(
        `IDs: geteilt? ${P[pi]?.id} bleibt bei „${D[di]?.offer.title}“, neu: ${split.map((fi) => `„${D[fi]?.offer.title}“`).join(", ")}`,
      );
  }

  // Übersicht je Anbieter
  const freshBy = groupBy(fresh, (di) => D[di]?.offer.providerId ?? "");
  const goneBy = groupBy(free(P, partnerOfOld), (pi) => P[pi]?.offer.providerId ?? "");
  for (const id of [...new Set([...freshBy.keys(), ...goneBy.keys()])].sort()) {
    const n = freshBy.get(id)?.length ?? 0;
    const g = goneBy.get(id)?.length ?? 0;
    notes.push(`IDs: ${id} – ${n} neu, ${g} weggefallen`);
  }
  notes.unshift(
    `IDs: ${counts[0]} gleicher Schlüssel, ${counts[1]} gleiche Termine, ${counts[2]} ähnlicher Titel, ${fresh.length} neu, ${free(P, partnerOfOld).length} weggefallen`,
  );
  return { offers, notes };
}

/** Eine ID, die vorher und nachher besteht, behält ihren Anbieter – das Netz gegen Fehler in der Zuordnung. */
export function checkIdContinuity(previous: OffersFile | undefined, next: readonly Offer[]): string[] {
  const before = new Map((previous?.offers ?? []).map((o) => [o.id, o.providerId] as const));
  return next.flatMap((o) => {
    const was = before.get(o.id);
    return was !== undefined && was !== o.providerId
      ? [`ID ${o.id} wechselt den Anbieter: ${was} → ${o.providerId} (Fehler in der Zuordnung)`]
      : [];
  });
}

/** data/offers.json vor der Migration: wie `OffersFile`, aber mit beliebiger ID (Querprüfungen danach per validateDataset). */
export const LegacyOffersFile = OffersFile.extend({ offers: z.array(OfferFields.extend({ id: z.string() })) });

/**
 * Einmalige Migration der Angebote (E17): `id = shortId(alt, 0)`, Abbruch bei jeder Kollision und bei schon
 * migrierter Datei – die App rechnet alte IDs genau mit seed 0 um. `hash` nur für Tests.
 */
export function migrateOfferIds(
  file: z.infer<typeof LegacyOffersFile>,
  hash: (text: string) => string = (t) => shortId(t, 0),
): OffersFile {
  const seen = new Map<string, string>();
  const offers = file.offers.map((o) => {
    if (!LEGACY_OFFER_ID_PATTERN.test(o.id)) throw new Error(`${o.id}: schon migriert oder keine alte Angebots-ID`);
    const id = hash(o.id);
    const other = seen.get(id);
    if (other !== undefined) throw new Error(`Kollision: ${other} und ${o.id} ergeben ${id}`);
    seen.set(id, o.id);
    return { ...o, id };
  });
  return { ...file, offers: offers.sort(compareOffers) };
}

/**
 * Einmalige Migration des Katalogs (E17): `publicId: shortId(id, 0)` direkt nach `id` bei jedem Anbieter. Arbeitet auf
 * dem YAML-Dokument und prüft selbst, dass sich der Text nur um die neuen Zeilen unterscheidet.
 */
export function migrateCatalogIds(text: string, hash: (text: string) => string = (t) => shortId(t, 0)): string {
  const doc = parseDocument(text);
  if (!isSeq(doc.contents)) throw new Error("Katalog ist keine Liste");
  const seen = new Map<string, string>();
  for (const item of doc.contents.items) {
    if (!isMap(item)) continue;
    const role: unknown = item.get("role");
    if (role !== "anbieter") continue;
    const id: unknown = item.get("id");
    if (typeof id !== "string") throw new Error("Anbieter ohne id");
    if (item.has("publicId")) throw new Error(`${id}: hat schon eine publicId`);
    if (SHORT_ID_PATTERN.test(id)) throw new Error(`${id}: Katalog-ID hat die Form einer Kurz-ID (ADR 0022)`);
    const publicId = hash(id);
    const other = seen.get(publicId);
    if (other !== undefined) throw new Error(`Kollision: ${other} und ${id} ergeben ${publicId}`);
    seen.set(publicId, id);
    const first = item.items[0];
    if (!first || !isScalar(first.key) || first.key.value !== "id")
      throw new Error(`${id}: id ist nicht der erste Schlüssel`);
    item.items.splice(1, 0, doc.createPair("publicId", publicId));
  }
  const out = doc.toString({ lineWidth: 0 });
  const stripped = out
    .split("\n")
    .filter((line) => !/^ {2}publicId: [0-9a-z]{8}$/.test(line))
    .join("\n");
  if (stripped !== text) throw new Error("Migration hätte andere Zeilen des Katalogs verändert – abgebrochen");
  return out;
}

/** Beide Migrationen zusammen, geprüft mit `validateDataset` (E17). */
export function migrateIds(rawOffers: unknown, catalogText: string, parseCatalog: (text: string) => unknown) {
  const offers = migrateOfferIds(LegacyOffersFile.parse(rawOffers));
  const catalog = migrateCatalogIds(catalogText);
  const result = validateDataset(parseCatalog(catalog), offers);
  if (!result.ok) throw new Error(`Migration ungültig:\n${result.errors.join("\n")}`);
  return { offers, catalog };
}
