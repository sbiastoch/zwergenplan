/**
 * Stabile Angebots-IDs (ADR 0022, Plan 0015 E13–E17): Die ID ist gespeichert, nicht abgeleitet. `assignIds` ordnet
 * die Entwürfe eines Laufs dem Vorstand (data/offers.json vor dem Lauf) zu und übernimmt dessen IDs; nur Entwürfe ohne
 * Partner bekommen eine neue. Rein und deterministisch: gleiche Eingabe und gleicher Vorstand ergeben dieselben IDs.
 *
 * Lieber eine neue ID als eine vertauschte: Eine neue ID ist der Zustand vor ADR 0022, eine falsche Zuordnung ließe
 * einen alten Link still auf ein fremdes Angebot zeigen. Deshalb verlangen Stufe 1 und 2 Eindeutigkeit.
 *
 * Einzige Ausnahme sind Zwillinge des Vorstands (ADR 0031, Punkt 3): zwei alte Fassungen desselben Angebots
 * (`sameOfferTwice`). Passen beide gleich gut, trifft eine nach der Rangfolge; die andere ist verbraucht und fällt aus
 * allen weiteren Durchgängen (`openOlds`). Welche ID überlebt, ändert nichts daran, worauf ein alter Link zeigt.
 */
import { offerKey, shortId } from "../../../src/domain/ids.ts";
import type { Offer, OffersFile, Provider, Session } from "../../../src/domain/schema.ts";
import { berlinDate, berlinKey } from "../../../src/domain/time.ts";
import { compatibleAge, conflictingLabels, ratio, sameCoreTitle, similarTitle } from "./similar.ts";

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
/**
 * Schwelle für „ein Angebot in zwei Fassungen“ (`sameOfferTwice`: Dubletten gleicher Quelle im Build und Zwillinge des
 * Vorstands, Plan 0038, ADR 0031; ADR 0004). Gleicher Wert wie `SAME_SESSIONS`, weil bis zu 20 % abweichende Termine
 * bei derselben Quelle fast immer herausgenommene Ferientage sind; bewusst entkoppelt, damit eine Änderung der
 * Zuordnung nicht still das Löschen von Dubletten ändert.
 */
export const SAME_SOURCE_SESSIONS = 0.8;

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

/** Element an einem Index, den die Zuordnung selbst erzeugt hat; fehlt es, ist das ein Fehler im Code. */
function at<T>(list: readonly T[], i: number): T {
  const item = list[i];
  if (item === undefined) throw new Error(`Zuordnung: Index ${i} fehlt`);
  return item;
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

/** Beginn auf die Minute: der Vergleichswert der Terminreihen. */
const minuteOf = (s: Session) => Math.floor(Date.parse(s.start) / 60_000);

/**
 * Ein Angebot in zwei Fassungen (Plan 0038, E1; ADR 0031): gleicher Anbieter, Ort und Format, verträgliches Alter,
 * gleicher Kerntitel und Beginnzeiten der Termine ab `from` (`horizon.from` des Laufs; vergangene Kurstermine nennt
 * nicht jede Fassung) zu mindestens `SAME_SOURCE_SESSIONS` gleich. Gilt gleich für Dubletten im Build und Zwillinge.
 */
export function sameOfferTwice(a: Draft, b: Draft, from: string): boolean {
  const starts = (o: Draft) => new Set(o.sessions.filter((s) => berlinDay(s.start) >= from).map(minuteOf));
  return (
    a.providerId === b.providerId &&
    a.venueId === b.venueId &&
    a.format === b.format &&
    compatibleAge(a.age, b.age) &&
    sameCoreTitle(a.title, b.title) &&
    jaccard(starts(a), starts(b)) >= SAME_SOURCE_SESSIONS
  );
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
  /** erster Beginn im Fenster auf die Minute; ohne Termin im Fenster keiner (Stufe 2, ADR 0031) */
  first: number | undefined;
  /** Berliner Uhrzeiten `HHmm` im Fenster: Entscheider bei Mehrdeutigkeit in Stufe 2 */
  clocks: Set<string>;
}

function side(offer: Draft, from: string, to: string): Side {
  const inWindow = offer.sessions.filter((s) => {
    const d = berlinDay(s.start);
    return d >= from && d <= to;
  });
  const minutes = inWindow.map(minuteOf);
  return {
    offer,
    minutes: new Set(minutes),
    days: new Set(inWindow.map((s) => berlinDay(s.start))),
    first: minutes.length > 0 ? Math.min(...minutes) : undefined,
    clocks: new Set(inWindow.map((s) => berlinKey(s.start).slice(9))),
  };
}

/** Zwillinge des Vorstands (ADR 0031, Punkt 3): je Index die Indizes der anderen Fassungen desselben Angebots. */
function findTwins(olds: readonly Draft[], from: string): number[][] {
  const twins = olds.map((): number[] => []);
  const groups = groupBy(
    olds.map((_, i) => i),
    (i) => `${at(olds, i).providerId}|${at(olds, i).venueId}|${at(olds, i).format}`,
  );
  for (const group of groups.values())
    group.forEach((a, n) => {
      for (const b of group.slice(n + 1))
        if (sameOfferTwice(at(olds, a), at(olds, b), from)) {
          at(twins, a).push(b);
          at(twins, b).push(a);
        }
    });
  return twins;
}

/** Rangfolge unter Zwillingen zu einem Entwurf (ADR 0031): höhere Titelähnlichkeit, bei Gleichheit die kleinere ID. */
function outranks(a: Offer, b: Offer, title: string): boolean {
  const t = title.toLowerCase();
  const ra = ratio(a.title.toLowerCase(), t);
  const rb = ratio(b.title.toLowerCase(), t);
  return ra > rb || (ra === rb && a.id < b.id);
}

/**
 * Uhrzeit als Entscheider (ADR 0031, Punkt 4): Von mehreren Kandidaten bleiben die mit gemeinsamer Uhrzeit. Hat keiner
 * eine, bleiben alle – die Uhrzeit ist keine Bedingung, eine Gruppe mit neuer Uhrzeit behält ihre ID weiter.
 */
function byClock(candidates: number[], shares: (i: number) => boolean): number[] {
  if (candidates.length < 2) return candidates;
  const kept = candidates.filter(shares);
  return kept.length > 0 ? kept : candidates;
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

  // Zwillinge (ADR 0031, Punkt 3). Verbraucht ist ein alter Zwilling, dessen Partner in irgendeiner Stufe zugeordnet ist,
  // auch in Stufe 0. Er fällt aus allen weiteren Durchgängen; sonst träfe er später eine Schwestergruppe, sobald sein
  // Partner deren Rivale nicht mehr ist, und eine alte ID zeigte still auf ein anderes Angebot (Plan 0038, Review 2, B1).
  const twins = findTwins(olds, from);
  const isTwin = (a: number, b: number) => at(twins, a).includes(b);
  const consumed = (pi: number) => at(twins, pi).some((qi) => partnerOfOld.has(qi));
  const openOlds = () => free(P, partnerOfOld).filter((pi) => !consumed(pi));
  const before = (a: number, b: number, di: number) => outranks(at(olds, a), at(olds, b), at(D, di).offer.title);
  /** Vorschläge, deren Zwilling zu einem anderen Entwurf passt: Einer der Entwürfe ist etwas anderes, nur welcher? */
  const twinConflicts = <T extends { pi: number; di: number }>(proposals: readonly T[]) =>
    proposals.filter((pr) => proposals.some((q) => q.di !== pr.di && isTwin(pr.pi, q.pi)));
  const conflictNote = (stage: 1 | 2, pi: number, di: number) =>
    `IDs: mehrdeutig in Stufe ${stage} – Zwilling ${P[pi]?.id} „${P[pi]?.offer.title}“ passt zu „${D[di]?.offer.title}“, sein Zwilling zu einem anderen Entwurf`;

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
    if (ds.length === 1 && ps.length === 1) match(at(ps, 0), at(ds, 0), 0);
  }

  const sameProvider = (pi: number, di: number) => P[pi]?.offer.providerId === D[di]?.offer.providerId;
  const stage1 = (pi: number, di: number) => {
    const p = at(P, pi);
    const d = at(D, di);
    if (!sameProvider(pi, di)) return 0;
    if (p.offer.venueId !== d.offer.venueId && venues.has(p.offer.venueId)) return 0;
    const t = jaccard(p.minutes, d.minutes);
    if (t < SAME_SESSIONS) return 0;
    // Titel-Widerspruch: Ähnelt der neue Titel nicht dem alten, aber einem anderen Angebot desselben Anbieters im
    // Vorstand, ist eher ein Schwesterangebot auf den frei gewordenen Platz gerückt (Probelauf, Durchgang 3). Dann kein
    // Treffer – auch wenn die Schwester schon zugeordnet ist, sonst fiele die Sperre im nächsten Durchlauf (Arch-Review M1).
    if (similarTitle(p.offer.title, d.offer.title)) return t;
    const rival = P.some(
      (q, qi) => qi !== pi && q.offer.providerId === d.offer.providerId && similarTitle(q.offer.title, d.offer.title),
    );
    return rival ? 0 : t;
  };
  // Stufe 2 (ADR 0031, Punkt 4): Neben ≥ 50 % gleichen Tagen genügt der gleiche erste Termin im Fenster, wenn beide
  // Seiten dort Termine haben – das hält eine gewachsene oder geschrumpfte Reihe. Widersprechende Kennungen
  // („Babyschwimmen 1“ / „2“, „geb. Mai–Juli“ / „Juni–Aug.“) zählen nie, sonst erbte eine umgezogene Gruppe die ID.
  const stage2 = (pi: number, di: number) => {
    const p = at(P, pi);
    const d = at(D, di);
    return (
      sameProvider(pi, di) &&
      p.offer.venueId === d.offer.venueId &&
      p.offer.format === d.offer.format &&
      similarTitle(p.offer.title, d.offer.title) &&
      !conflictingLabels(p.offer.title, d.offer.title) &&
      (jaccard(p.days, d.days) >= SAME_DAYS || (p.first !== undefined && p.first === d.first))
    );
  };
  const sameClock = (pi: number, di: number) => [...at(P, pi).clocks].some((c) => at(D, di).clocks.has(c));

  // Stufe 1: gleiche Termine, strikt bester Partner für beide Seiten; wiederholt, bis sich nichts mehr ändert.
  // Gleichstand unter Zwillingen zählt nicht als Rivale: Es trifft der nach der Rangfolge erste (ADR 0031, Punkt 3).
  // Je Durchgang erst alle Gewinner, dann anwenden; zeigen zwei Zwillinge auf verschiedene Entwürfe, trifft keiner.
  const stage1Conflicts = new Map<number, string>();
  for (let changed = true; changed; ) {
    changed = false;
    const pairs = openOlds().flatMap((pi) =>
      free(D, partnerOfDraft).flatMap((di) => {
        const t = stage1(pi, di);
        return t > 0 ? [{ pi, di, t }] : [];
      }),
    );
    const yields = (pi: number, di: number, t: number) => (q: (typeof pairs)[number]) =>
      q.di === di && q.t === t && isTwin(pi, q.pi) && before(pi, q.pi, di);
    const winners = pairs.filter(({ pi, di, t }) =>
      pairs.filter((q) => (q.pi === pi) !== (q.di === di) && !yields(pi, di, t)(q)).every((q) => q.t < t),
    );
    const conflicts = twinConflicts(winners);
    for (const w of winners) {
      if (conflicts.includes(w)) stage1Conflicts.set(w.pi, conflictNote(1, w.pi, w.di));
      else {
        match(w.pi, w.di, 1);
        changed = true;
      }
    }
  }
  for (const pi of openOlds()) {
    const conflict = stage1Conflicts.get(pi);
    const ds = free(D, partnerOfDraft).filter((di) => stage1(pi, di) > 0);
    if (conflict !== undefined) notes.push(conflict);
    else if (ds.length > 0)
      notes.push(
        `IDs: mehrdeutig in Stufe 1 – ${P[pi]?.id} „${P[pi]?.offer.title}“ passt gleich gut zu ${ds.map((di) => `„${D[di]?.offer.title}“`).join(", ")}`,
      );
  }

  // Stufe 2: ähnlicher Titel, gleiche Tage oder gleicher erster Termin, nur als einziger Kandidat auf beiden Seiten.
  // Bei mehreren Kandidaten entscheidet die Uhrzeit; in der Gegenrichtung danach unter Zwillingen die Rangfolge
  // (ADR 0031). Erst alle Vorschläge, dann anwenden: So hängt nichts von der Reihenfolge der Schleife ab. Zwillinge mit
  // Konflikt aus Stufe 1 bleiben außen vor: Welcher Entwurf das andere Angebot ist, entschiede Stufe 2 nur schwächer.
  const olds2 = openOlds().filter((pi) => !stage1Conflicts.has(pi));
  const drafts2 = free(D, partnerOfDraft);
  const proposals: Array<{ pi: number; di: number }> = [];
  for (const pi of olds2) {
    const ds = byClock(
      drafts2.filter((di) => stage2(pi, di)),
      (di) => sameClock(pi, di),
    );
    if (ds.length > 1) {
      notes.push(`IDs: mehrdeutig in Stufe 2 – ${P[pi]?.id} „${P[pi]?.offer.title}“ hat ${ds.length} Kandidaten`);
      continue;
    }
    const di = ds[0];
    if (di === undefined) continue;
    const back = byClock(
      olds2.filter((qi) => stage2(qi, di)),
      (qi) => sameClock(qi, di),
    );
    const allTwins = back.every((a) => back.every((b) => a === b || isTwin(a, b)));
    const best = allTwins ? back.reduce((x, y) => (before(y, x, di) ? y : x)) : undefined;
    if (best === pi) proposals.push({ pi, di });
  }
  const conflicts = twinConflicts(proposals);
  for (const { pi, di } of proposals)
    if (conflicts.some((c) => c.pi === pi)) notes.push(conflictNote(2, pi, di));
    else match(pi, di, 2);

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
    const p = at(P, pi);
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
    const { offer: d, key } = at(D, di);
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

  // Zwillinge, die weggefallen sind, weil ihr Partner die ID behält (ADR 0031)
  for (const pi of free(P, partnerOfOld)) {
    const winner = at(twins, pi).find((qi) => partnerOfOld.has(qi));
    if (winner !== undefined)
      notes.push(
        `IDs: Zwilling im Vorstand – ${P[pi]?.id} „${P[pi]?.offer.title}“ fällt weg, ${P[winner]?.id} „${P[winner]?.offer.title}“ bleibt`,
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
