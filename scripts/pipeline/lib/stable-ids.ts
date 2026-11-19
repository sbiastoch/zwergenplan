/**
 * Stabile Angebots-IDs (ADR 0022, Plan 0015 E13–E17): Die ID ist gespeichert, nicht abgeleitet. `assignIds` ordnet
 * die Entwürfe eines Laufs dem Vorstand (data/offers.json vor dem Lauf) zu und übernimmt dessen IDs (Durchgang 1: Erbe,
 * Stufe 0, 1, 2, 2b). Die übrigen Entwürfe prüft Durchgang 2 gegen die ruhenden Angebote (`data/ruhend.json`, Plan 0061,
 * E2; ADR 0044); nur Entwürfe ohne Partner bekommen eine neue ID, die keine ruhende belegt. Rein und deterministisch:
 * gleiche Eingabe, gleicher Vorstand und gleiche Ruhe ergeben dieselben IDs.
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
/** Was der Vergleich zweier Fassungen braucht: auch ein ruhender Eintrag hat das (Plan 0061, E2) */
export type Comparable = Pick<Draft, "providerId" | "venueId" | "title" | "format" | "age" | "sessions">;

/**
 * Ruhendes Angebot für Durchgang 2 der Zuordnung (Plan 0061, E2). Strukturgleich mit `RestingEntry` aus
 * `resting.ts`; hier ausgeschrieben, weil `resting.ts` `keyOf` von hier importiert.
 */
export interface RestingSide {
  id: string;
  key: string;
  providerId: string;
  venueId: string;
  title: string;
  format: Draft["format"];
  age?: Draft["age"];
  restingSince: string;
  horizonTo: string;
  starts: readonly string[];
}

export interface IdAssignment {
  offers: Offer[];
  /** je Angebot der Index seines Entwurfs in `drafts` (Ursprung für das ID-Gate, Plan 0049, Nachtrag 2) */
  sources: number[];
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
 * Vorstands, Plan 0038, ADR 0031; ADR 0004), seit Plan 0061 als Überdeckung im gemeinsamen Fenster. Gleicher Wert wie `SAME_SESSIONS`, weil bis zu 20 % abweichende Termine
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
export function windowKey(o: Comparable, from: string): string {
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
 * Mindestverhältnis der kleineren zur größeren Fassung im gemeinsamen Fenster (Plan 0061, E1.1; ADR 0004): Eine
 * Fassung ohne Ferienwochen (Familienbox 37 in 51, 0,73) ist dasselbe Angebot, eine, die nur jeden dritten Termin
 * nennt, nicht.
 */
export const MIN_SIDE_RATIO = 0.5;
/** Mindestzahl gemeinsamer Termine, solange eine Seite so viele hat (Plan 0061, E1.1; Review 2, Major 3) */
const MIN_SHARED = 3;

/** Beginnzeiten auf die Minute ab `from`, aufsteigend und ohne Doppelte */
const startsFrom = (o: Comparable, from: string) =>
  [...new Set(o.sessions.filter((s) => berlinDay(s.start) >= from).map(minuteOf))].sort((x, y) => x - y);

/**
 * Gemeinsames Fenster zweier Fassungen (Plan 0061, E1.1): vom späteren der beiden ersten bis zum früheren der beiden
 * letzten Beginne ab `from`, in Minuten. Ohne Überschneidung keins.
 */
export function sharedWindow(a: Comparable, b: Comparable, from: string): { lo: number; hi: number } | undefined {
  const sa = startsFrom(a, from);
  const sb = startsFrom(b, from);
  const [fa, fb, la, lb] = [sa[0], sb[0], sa.at(-1), sb.at(-1)];
  if (fa === undefined || fb === undefined || la === undefined || lb === undefined) return undefined;
  const lo = Math.max(fa, fb);
  const hi = Math.min(la, lb);
  return lo <= hi ? { lo, hi } : undefined;
}

/**
 * Gleiche Termine zweier Fassungen (Plan 0061, E1.1; ersetzt den Jaccard über alle Termine aus Plan 0038): Im
 * gemeinsamen Fenster liegen mindestens `SAME_SOURCE_SESSIONS` der Termine der kleineren Seite auch in der größeren
 * (Überdeckung), die kleinere hat mindestens `MIN_SIDE_RATIO` der größeren, und gemeinsam sind mindestens
 * min(3, Termine der größeren Fassung ab `from`). So zählt eine Fassung, die nur einen Ausschnitt oder die Wochen ohne
 * Ferien nennt; ein Einzeltermin aus einer Reihe oder zwei zufällig gleiche Termine zählen nicht.
 */
function sameSessions(a: Comparable, b: Comparable, from: string): boolean {
  const w = sharedWindow(a, b, from);
  if (w === undefined) return false;
  const sa = startsFrom(a, from);
  const sb = startsFrom(b, from);
  const inside = (m: number) => m >= w.lo && m <= w.hi;
  const wa = sa.filter(inside);
  const wb = new Set(sb.filter(inside));
  const both = wa.filter((m) => wb.has(m)).length;
  const small = Math.min(wa.length, wb.size);
  const large = Math.max(wa.length, wb.size);
  return (
    both >= Math.min(MIN_SHARED, Math.max(sa.length, sb.length)) &&
    both / small >= SAME_SOURCE_SESSIONS &&
    small / large >= MIN_SIDE_RATIO
  );
}

/**
 * Ein Angebot in zwei Fassungen (Plan 0038, E1; ADR 0031; Plan 0061, E1): gleicher Anbieter, Ort und Format,
 * verträgliches Alter, gleicher Kerntitel und gleiche Termine im gemeinsamen Fenster ab `from` (`sameSessions`;
 * vergangene Kurstermine nennt nicht jede Fassung). Gilt gleich für Dubletten im Build und Zwillinge.
 */
export function sameOfferTwice(a: Comparable, b: Comparable, from: string): boolean {
  return (
    a.providerId === b.providerId &&
    a.venueId === b.venueId &&
    a.format === b.format &&
    compatibleAge(a.age, b.age) &&
    sameCoreTitle(a.title, b.title) &&
    sameSessions(a, b, from)
  );
}

export function unionSessions(...lists: ReadonlyArray<readonly Session[]>): Session[] {
  const byStart = new Map<number, Session>();
  for (const s of lists.flat()) if (!byStart.has(Date.parse(s.start))) byStart.set(Date.parse(s.start), s);
  return [...byStart.entries()].sort(([a], [b]) => a - b).map(([, s]) => s);
}

interface Side<T extends Comparable = Draft> {
  offer: T;
  /** Beginn auf die Minute, nur Termine im Vergleichsfenster */
  minutes: Set<number>;
  days: Set<string>;
  /** erster Beginn im Fenster auf die Minute; ohne Termin im Fenster keiner (Stufe 2, ADR 0031) */
  first: number | undefined;
  /** Berliner Uhrzeiten `HHmm` im Fenster: Entscheider bei Mehrdeutigkeit in Stufe 2 */
  clocks: Set<string>;
}

function side<T extends Comparable>(offer: T, from: string, to: string): Side<T> {
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

/** Ruhender Eintrag als vergleichbare Fassung: die Beginne als Termine ohne Dauer (nur `start` zählt im Vergleich) */
function restingDraft(e: RestingSide): Comparable {
  return {
    providerId: e.providerId,
    venueId: e.venueId,
    title: e.title,
    format: e.format,
    ...(e.age ? { age: e.age } : {}),
    sessions: e.starts.map((start) => ({ start, end: start })),
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
  /**
   * ID-Erbe je Entwurf, gleiche Reihenfolge wie `drafts` (Plan 0049, Nachtrag 2, B3; ADR 0041): vom Richter des
   * ID-Gates belegte Zuordnung, geht allen Stufen vor.
   */
  keepIds?: ReadonlyArray<string | undefined>;
  /** Herkunft des Erbes je Entwurf (Plan 0061, E1.3): `dublette` aus der Dublettenregel, sonst der Richter */
  keepVia?: ReadonlyArray<"dublette" | undefined>;
  /** data/offers.json vor dem Lauf (fehlt beim ersten Lauf) */
  previous: OffersFile | undefined;
  /** Katalog, für vorhandene Orte */
  providers: readonly Provider[];
  /** Datenhorizont des Laufs (Berliner Daten) */
  horizon: { from: string; to: string };
  /** ruhende Angebote (`data/ruhend.json`, Plan 0061, E2) für Durchgang 2; fehlt: wie vor Plan 0061 */
  resting?: readonly RestingSide[];
}): IdAssignment {
  const { from } = input.horizon;
  const to =
    input.previous && input.previous.horizon.to < input.horizon.to ? input.previous.horizon.to : input.horizon.to;
  const venues = new Set(input.providers.flatMap((p) => (p.role === "anbieter" ? p.venues.map((v) => v.id) : [])));
  const notes: string[] = [];

  // Feste Reihenfolge: Ergebnis unabhängig von der Eingabereihenfolge
  const olds = [...(input.previous?.offers ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const drafts = input.drafts
    .map((d, i) => ({ d, key: keyOf(d), keep: input.keepIds?.[i], via: input.keepVia?.[i], index: i }))
    .sort((a, b) => a.key.localeCompare(b.key) || JSON.stringify(a.d).localeCompare(JSON.stringify(b.d)));
  const P = olds.map((p) => ({ ...side(p, from, to), id: p.id, window: windowKey(p, from) }));
  const D = drafts.map(({ d, key, keep, via, index }) => ({
    ...side(d, from, to),
    key,
    window: windowKey(d, from),
    keep,
    via,
    index,
  }));

  const partnerOfDraft = new Map<number, number>(); // Entwurf → Vorstand
  const partnerOfOld = new Map<number, number>();
  /**
   * 0–2: Stufen nach ADR 0022; 3: Erbe des Richters (ADR 0041) oder aus der Dublettenregel (Plan 0061, E1.3);
   * 4: Stufe 2b, Ortswechsel (Plan 0061, E3)
   */
  type Stage = 0 | 1 | 2 | 3 | 4;
  const stageOf = new Map<number, Stage>();
  const match = (pi: number, di: number, stage: Stage) => {
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

  // Erbe (ADR 0041): vor allen Stufen, damit eine Stufe die geerbte ID nicht einem anderen Entwurf gibt. Nur beim
  // selben Anbieter und nur, wenn genau ein Entwurf die ID beansprucht; der Ort darf wechseln (Fehlverortung behoben).
  const pinIndex = new Map(P.map((p, i) => [p.id, i] as const));
  const claims = groupBy(
    D.flatMap((d, i) => (d.keep === undefined ? [] : [i])),
    (i) => D[i]?.keep ?? "",
  );
  for (const [id, ds] of claims) {
    const pi = pinIndex.get(id);
    const di = at(ds, 0);
    const why =
      pi === undefined
        ? "nicht im Vorstand"
        : ds.length > 1
          ? "mehrfach beansprucht"
          : at(P, pi).offer.providerId !== at(D, di).offer.providerId
            ? "anderer Anbieter"
            : undefined;
    if (pi === undefined || why !== undefined) notes.push(`IDs: Erbe ${id} ignoriert (${why})`);
    else match(pi, di, 3);
  }

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
    if (ds.length !== 1 || ps.length !== 1) continue;
    const [pi, di] = [at(ps, 0), at(ds, 0)];
    // ein Erbe hat Vorrang
    if (!partnerOfOld.has(pi) && !partnerOfDraft.has(di)) match(pi, di, 0);
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
  // Formatwechsel `kurs` ↔ `regelmaessig` (Plan 0048, E11; ändert ADR 0022, Punkt 3 nach ADR 0033, Punkt 8): Eine
  // Neuextraktion fasst denselben Kurs oft im anderen Format. Zulässig nur mit gleichem ersten Termin im Fenster, nicht
  // über gleiche Tage; die Eindeutigkeit verlangt Stufe 2 ohnehin. S0 hielt so 1–2 IDs mehr ohne falsche Übernahme.
  const SWITCHABLE = new Set(["kurs", "regelmaessig"]);
  const stage2 = (pi: number, di: number) => {
    const p = at(P, pi);
    const d = at(D, di);
    const sameFirst = p.first !== undefined && p.first === d.first;
    const format =
      p.offer.format === d.offer.format
        ? jaccard(p.days, d.days) >= SAME_DAYS || sameFirst
        : SWITCHABLE.has(p.offer.format) && SWITCHABLE.has(d.offer.format) && sameFirst;
    return (
      sameProvider(pi, di) &&
      p.offer.venueId === d.offer.venueId &&
      format &&
      similarTitle(p.offer.title, d.offer.title) &&
      !conflictingLabels(p.offer.title, d.offer.title)
    );
  };
  const sameClock = (pi: number, di: number) => [...at(P, pi).clocks].some((c) => at(D, di).clocks.has(c));

  // Stufe 1: gleiche Termine, strikt bester Partner für beide Seiten; wiederholt, bis sich nichts mehr ändert.
  // Gleichstand unter Zwillingen zählt nicht als Rivale: Es trifft der nach der Rangfolge erste (ADR 0031, Punkt 3).
  // Je Durchgang erst alle Gewinner, dann anwenden; zeigen zwei Zwillinge auf verschiedene Entwürfe, trifft keiner.
  const stage1Conflicts = new Map<number, string>();
  /**
   * Entwürfe, die in Stufe 1 oder 2 mehrdeutig waren oder in einem Zwillingskonflikt standen: Ihr naher Kandidat ist
   * ein Vorstandsangebot, keine ruhende ID; sie nehmen an Durchgang 2 nicht teil (Plan 0061, Review M2)
   */
  const unsure = new Set<number>();
  /** Vorstandsangebote mit Kandidaten in Stufe 1 oder 2, die nicht trafen: Stufe 2b löst sie nicht auf (Arch-Review M1) */
  const unsureOld = new Set<number>();
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
      if (conflicts.includes(w)) {
        stage1Conflicts.set(w.pi, conflictNote(1, w.pi, w.di));
        unsure.add(w.di);
      } else {
        match(w.pi, w.di, 1);
        changed = true;
      }
    }
  }
  for (const pi of openOlds()) {
    const conflict = stage1Conflicts.get(pi);
    const ds = free(D, partnerOfDraft).filter((di) => stage1(pi, di) > 0);
    for (const di of ds) unsure.add(di);
    if (ds.length > 0 || conflict !== undefined) unsureOld.add(pi);
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
      for (const di of ds) unsure.add(di);
      unsureOld.add(pi);
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
    if (!allTwins) {
      unsure.add(di);
      unsureOld.add(pi);
    }
    if (best === pi) proposals.push({ pi, di });
  }
  const conflicts = twinConflicts(proposals);
  for (const { pi, di } of proposals)
    if (conflicts.some((c) => c.pi === pi)) {
      notes.push(conflictNote(2, pi, di));
      unsure.add(di);
      unsureOld.add(pi);
    } else match(pi, di, 2);

  // Stufe 2b (Plan 0061, E3): Ortswechsel bei gleichem Anbieter, auch wenn der alte Ort noch im Katalog steht (ein
  // genauerer Ort wurde angelegt). Nach Stufe 2, damit derselbe Kurs an zwei Orten eines Anbieters kein eindeutiges
  // Paar aus Stufe 1 verliert (Review M3). Weil das starke Signal „alter Ort gestrichen“ fehlt, streng wie eine
  // Dublette (Arch-Review M1): gleicher Kerntitel (`sameCoreTitle`, nicht nur `similarTitle`), verträgliches Alter,
  // gleiches Format (oder `kurs` ↔ `regelmaessig` mit gleichem ersten Termin), ≥ 80 % gleiche Beginnzeiten. Nur für
  // Entwürfe und Vorstandsangebote, die in Stufe 1 und 2 keinen Kandidaten hatten, mit genau einem Kandidaten auf
  // beiden Seiten; zeigen zwei Zwillinge auf verschiedene Entwürfe, trifft keiner (ADR 0031, Punkt 3).
  const moved = (pi: number, di: number) => {
    const p = at(P, pi);
    const d = at(D, di);
    const sameFirst = p.first !== undefined && p.first === d.first;
    const format =
      p.offer.format === d.offer.format ||
      (SWITCHABLE.has(p.offer.format) && SWITCHABLE.has(d.offer.format) && sameFirst);
    return (
      sameProvider(pi, di) &&
      p.offer.venueId !== d.offer.venueId &&
      format &&
      compatibleAge(p.offer.age, d.offer.age) &&
      jaccard(p.minutes, d.minutes) >= SAME_SESSIONS &&
      sameCoreTitle(p.offer.title, d.offer.title)
    );
  };
  const olds2b = openOlds().filter((pi) => !stage1Conflicts.has(pi) && !unsureOld.has(pi));
  const drafts2b = free(D, partnerOfDraft).filter((di) => !unsure.has(di));
  const proposals2b: Array<{ pi: number; di: number }> = [];
  for (const pi of olds2b) {
    const ds = drafts2b.filter((di) => moved(pi, di));
    const di = ds[0];
    if (ds.length !== 1 || di === undefined) continue;
    if (olds2b.filter((qi) => moved(qi, di)).length === 1) proposals2b.push({ pi, di });
  }
  const conflicts2b = twinConflicts(proposals2b);
  for (const { pi, di } of proposals2b) if (!conflicts2b.some((c) => c.pi === pi)) match(pi, di, 4);

  // Durchgang 2 (Plan 0061, E2; ADR 0044): Stufe 0, 1 und 2 sowie die Rückkehr über den Schlüssel für die noch freien
  // Entwürfe gegen die ruhenden Angebote, ohne Stufe 2b. Nicht dabei sind mehrdeutige Entwürfe aus Durchgang 1 und
  // ruhende Einträge, die eine verworfene Dublette eines zugeordneten Angebots sind (sie kehrten sonst als zweite
  // Fassung zurück). Rivalen im Titel-Widerspruch sind alle Vorstandsangebote und alle ruhenden Einträge. Das
  // Vergleichsfenster endet je Eintrag bei seinem `horizonTo` (Review M1); keine Kursfortschreibung (Review B3).
  const assignedDrafts = [...partnerOfDraft.keys()].map((di) => at(D, di).offer);
  const R = [...(input.resting ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((e) => !pinIndex.has(e.id))
    .map((e) => ({ e, offer: restingDraft(e) }))
    .filter(({ offer }) => !assignedDrafts.some((d) => sameOfferTwice(d, offer, from)))
    .map(({ e, offer }) => {
      const restTo = e.horizonTo < input.horizon.to ? e.horizonTo : input.horizon.to;
      return { ...side(offer, from, restTo), e, to: restTo, window: windowKey(offer, from) };
    });
  const partnerOfDraftR = new Map<number, number>();
  const partnerOfRest = new Map<number, number>();
  const restStageOf = new Map<number, "0" | "1" | "2" | "Schlüssel">();
  const matchRest = (ri: number, di: number, stage: "0" | "1" | "2" | "Schlüssel") => {
    partnerOfDraftR.set(di, ri);
    partnerOfRest.set(ri, di);
    restStageOf.set(di, stage);
  };
  const players = () => free(D, partnerOfDraft).filter((di) => !unsure.has(di) && !partnerOfDraftR.has(di));
  const openRest = () => R.flatMap((_, ri) => (partnerOfRest.has(ri) ? [] : [ri]));
  const pairSides = new Map<string, Side>();
  /** Entwurf im Vergleichsfenster des ruhenden Eintrags */
  const draftFor = (ri: number, di: number): Side => {
    const k = `${ri}|${di}`;
    const cached = pairSides.get(k);
    if (cached) return cached;
    const made = side(at(D, di).offer, from, at(R, ri).to);
    pairSides.set(k, made);
    return made;
  };
  const sameRestProvider = (ri: number, di: number) => R[ri]?.offer.providerId === D[di]?.offer.providerId;

  // Eindeutig heißt unter allen Entwürfen und allen ruhenden Einträgen, nicht nur unter den Teilnehmern
  // (Arch-Review E2, m1): Ein mehrdeutiger Entwurf oder eine verworfene Dublette mit gleichem Schlüssel macht ihn unsicher
  const allRest = (input.resting ?? []).map(restingDraft);
  const count = (keys: readonly string[]) => groupBy(keys, (k) => k);
  const draftWindows = count(D.map((d) => d.window));
  const restWindows = count(allRest.map((o) => windowKey(o, from)));
  const draftKeys = count(D.map((d) => d.key));
  const restKeys = count((input.resting ?? []).map((e) => e.key));
  const unique = (counts: ReadonlyMap<string, readonly string[]>, k: string) => counts.get(k)?.length === 1;

  // Stufe 0 gegen die Ruhe: gleicher Fensterschlüssel, auf beiden Seiten genau einer
  for (const di of players()) {
    const key = at(D, di).window;
    const ri = R.findIndex((r) => r.window === key);
    if (ri >= 0 && unique(draftWindows, key) && unique(restWindows, key)) matchRest(ri, di, "0");
  }

  // Stufe 1 gegen die Ruhe: gleiche Termine, ähnlicher Titel, verträgliches Alter, strikt bester Partner für beide
  // Seiten
  const restStage1 = (ri: number, di: number) => {
    if (!sameRestProvider(ri, di)) return 0;
    const r = at(R, ri);
    const d = draftFor(ri, di);
    if (r.offer.venueId !== d.offer.venueId && venues.has(r.offer.venueId)) return 0;
    const t = jaccard(r.minutes, d.minutes);
    // Anders als über Nacht ist über Wochen ein neuer Titel bei gleichen Terminen oft eine Neubelegung: ähnlicher Titel
    // und verträgliches Alter sind Pflicht, der Zweig „kein Rivale“ aus Durchgang 1 entfällt (Arch-Review E2, M1)
    if (t < SAME_SESSIONS || !similarTitle(r.offer.title, d.offer.title) || !compatibleAge(r.offer.age, d.offer.age))
      return 0;
    return t;
  };
  for (let changed = true; changed; ) {
    changed = false;
    const pairs = openRest().flatMap((ri) =>
      players().flatMap((di) => {
        const t = restStage1(ri, di);
        return t > 0 ? [{ ri, di, t }] : [];
      }),
    );
    for (const w of pairs)
      if (pairs.filter((q) => (q.ri === w.ri) !== (q.di === w.di)).every((q) => q.t < w.t)) {
        matchRest(w.ri, w.di, "1");
        changed = true;
      }
  }

  // Stufe 2 gegen die Ruhe: wie Stufe 2, aber mit gleichem Kerntitel und verträglichem Alter, nur als einziger
  // Kandidat auf beiden Seiten (ohne Zwillinge)
  const restStage2 = (ri: number, di: number) => {
    if (!sameRestProvider(ri, di)) return false;
    const r = at(R, ri);
    const d = draftFor(ri, di);
    const sameFirst = r.first !== undefined && r.first === d.first;
    const format =
      r.offer.format === d.offer.format
        ? jaccard(r.days, d.days) >= SAME_DAYS || sameFirst
        : SWITCHABLE.has(r.offer.format) && SWITCHABLE.has(d.offer.format) && sameFirst;
    // streng wie eine Dublette (Messung Plan 0061): ein gemeinsames Wort wie ein Ortsname genügt nicht, sonst erbte
    // die Gruppe zur nächsten Uhrzeit die ID einer ruhenden Schwestergruppe
    return (
      r.offer.venueId === d.offer.venueId &&
      format &&
      compatibleAge(r.offer.age, d.offer.age) &&
      sameCoreTitle(r.offer.title, d.offer.title)
    );
  };
  const restClock = (ri: number, di: number) => [...at(R, ri).clocks].some((c) => draftFor(ri, di).clocks.has(c));
  const rests2 = openRest();
  const players2 = players();
  const restProposals: Array<{ ri: number; di: number }> = [];
  for (const ri of rests2) {
    const ds = byClock(
      players2.filter((di) => restStage2(ri, di)),
      (di) => restClock(ri, di),
    );
    const di = ds[0];
    if (ds.length !== 1 || di === undefined) continue;
    const back = byClock(
      rests2.filter((qi) => restStage2(qi, di)),
      (qi) => restClock(qi, di),
    );
    if (back.length === 1 && back[0] === ri) restProposals.push({ ri, di });
  }
  for (const { ri, di } of restProposals) matchRest(ri, di, "2");

  // Rückkehr über den Schlüssel (Review m3; Arch-Review m5): heute über `shortId(key, seed)`, jetzt ohne die Gefahr
  // eines anderen Seeds, weil neue IDs ruhende meiden. Nur bei einem Schlüssel, der auf beiden Seiten eindeutig ist.
  for (const di of players()) {
    const key = at(D, di).key;
    const ri = R.findIndex((r) => r.e.key === key);
    if (ri >= 0 && !partnerOfRest.has(ri) && unique(draftKeys, key) && unique(restKeys, key))
      matchRest(ri, di, "Schlüssel");
  }

  // Vergabe: Treffer übernehmen die ID (samt Kursfortschreibung), alle anderen bekommen eine neue
  const occupied = new Set([...olds.map((p) => p.id), ...(input.resting ?? []).map((e) => e.id)]);
  const offers: Offer[] = [];
  const sources: number[] = [];
  const counts = [0, 0, 0, 0, 0];
  const fresh: number[] = [];
  D.forEach(({ offer: d }, di) => {
    const ri = partnerOfDraftR.get(di);
    if (ri !== undefined) {
      const { e } = at(R, ri);
      const stage = restStageOf.get(di) ?? "0";
      notes.push(
        `IDs: aus der Ruhe ${e.id} „${e.title}“ → „${d.title}“ (${stage === "Schlüssel" ? stage : `Stufe ${stage}`}, ruhte seit ${berlinDay(e.restingSince)})`,
      );
      offers.push({ id: e.id, ...d });
      sources.push(at(D, di).index);
      return;
    }
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
    if (stage === 3)
      notes.push(
        `IDs: geerbt ${p.id} „${p.offer.title}“ → „${d.title}“ (${at(D, di).via === "dublette" ? "Dublette" : "Richter"})`,
      );
    else if (stage === 4)
      notes.push(
        `IDs: Stufe 2b (Ortswechsel) ${p.id} „${p.offer.title}“ @${p.offer.venueId} → „${d.title}“ @${d.venueId}`,
      );
    else if (stage > 0) notes.push(`IDs: Stufe ${stage} ${p.id} „${p.offer.title}“ → „${d.title}“`);
    offers.push({ id: p.id, ...d, sessions });
    sources.push(at(D, di).index);
  });
  for (const di of fresh) {
    const { offer: d, key } = at(D, di);
    let seed = 0;
    while (occupied.has(shortId(key, seed))) seed++;
    const id = shortId(key, seed);
    occupied.add(id);
    offers.push({ id, ...d });
    sources.push(at(D, di).index);
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
    `IDs: ${counts[0]} gleicher Schlüssel, ${counts[1]} gleiche Termine, ${counts[2]} ähnlicher Titel, ${counts[4] ? `${counts[4]} Ortswechsel, ` : ""}${counts[3] ? `${counts[3]} geerbt, ` : ""}${partnerOfDraftR.size ? `${partnerOfDraftR.size} aus der Ruhe, ` : ""}${fresh.length} neu, ${free(P, partnerOfOld).length} weggefallen`,
  );
  return { offers, sources, notes };
}

/**
 * Eine ID, die vorher und nachher besteht, behält ihren Anbieter – das Netz gegen Fehler in der Zuordnung. Vorher
 * heißt im Vorstand oder in der Ruhe (Plan 0061, E2).
 */
export function checkIdContinuity(
  previous: OffersFile | undefined,
  next: readonly Offer[],
  resting: ReadonlyArray<{ id: string; providerId: string }> = [],
): string[] {
  const before = new Map([...resting, ...(previous?.offers ?? [])].map((o) => [o.id, o.providerId] as const));
  return next.flatMap((o) => {
    const was = before.get(o.id);
    return was !== undefined && was !== o.providerId
      ? [`ID ${o.id} wechselt den Anbieter: ${was} → ${o.providerId} (Fehler in der Zuordnung)`]
      : [];
  });
}
