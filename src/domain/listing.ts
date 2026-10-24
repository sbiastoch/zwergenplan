/**
 * „Neu eingestellt“ (Plan 0043, E3): **eine** Zuordnung für Etikett, Gruppen der Liste, Treffer der Wochen-Nachricht
 * und die Zahl der CI. Gezählt wird in Berliner Kalendertagen zwischen dem Tag von `listedAt` und heute, damit alle
 * dieselbe Grenze haben, auch über die Zeitumstellung. Dazu die Gruppen der Liste „Entdecken“ nach „Neu eingestellt“ und
 * nach Wegzeit (`groupByReach`, E7). Rein: darf in den Start; der Service Worker nutzt nur `listingWeek`.
 */
import { byStartThenTitle, type Occurrence, type SessionFit, shownSession } from "./agenda.ts";
import type { DateRange } from "./date-range.ts";
import { LIMIT_MINUTES, type Reach, roundedDistance, roundedMinutes } from "./reach.ts";
import type { Offer } from "./schema.ts";
import { addDays, berlinIsoDate } from "./time.ts";

/** So lange trägt ein Angebot das Etikett „Neu“; je Gruppe der Liste eine Woche */
export const NEW_DAYS = 14;
const WEEK_DAYS = 7;

export type ListingWeek = "diese-woche" | "vorige-woche" | "frueher";

/** Erster und letzter Kalendertag der beiden Wochen bis heute: die eine Quelle der Grenzen */
function weeks(today: string) {
  return {
    "diese-woche": { from: addDays(today, -(WEEK_DAYS - 1)), to: today },
    "vorige-woche": { from: addDays(today, -(NEW_DAYS - 1)), to: addDays(today, -WEEK_DAYS) },
  };
}

/**
 * Heute und die 6 Tage davor: `diese-woche`; die 7 Tage davor: `vorige-woche`; älter oder ohne `listedAt`: `frueher`.
 * Liegt `listedAt` nach heute (die Nachricht kam verspätet an, `site.json` ist schon neuer), zählt es zu `diese-woche`.
 */
export function listingWeek(offer: Pick<Offer, "listedAt">, now: Date): ListingWeek {
  if (offer.listedAt === undefined) return "frueher";
  const day = berlinIsoDate(offer.listedAt);
  const bounds = weeks(berlinIsoDate(now));
  if (day >= bounds["diese-woche"].from) return "diese-woche";
  if (day >= bounds["vorige-woche"].from) return "vorige-woche";
  return "frueher";
}

/** Etikett „Neu“ (Plan 0043, E5): in dieser oder voriger Woche eingestellt */
export function isNewlyListed(offer: Pick<Offer, "listedAt">, now: Date): boolean {
  return listingWeek(offer, now) !== "frueher";
}

/**
 * Kopf einer Gruppe der Liste „Entdecken“ (Plan 0043, E4): ein Termin-Tag oder eine Wochengruppe von „Neu
 * eingestellt“ mit erstem und letztem Kalendertag (`frueher` ohne).
 */
export type ListGroupHead =
  | { kind: "termin"; day: string }
  | { kind: "diese-woche" | "vorige-woche"; from: string; to: string }
  | { kind: "frueher" }
  | { kind: "wegzeit"; band: ReachBand }
  | { kind: "ohne-wegzeit" };

/**
 * Band der Sortierung „Nächstgelegen“ (Plan 0043, E7): Wegzeit in Minuten (Stufen der Wegzeit-Grenze) oder Luftlinie
 * in Metern; ohne `upTo` alles darüber.
 */
interface ReachBand {
  unit: "min" | "m";
  upTo?: number;
}

/** Bänder der Luftlinie, wenn der Startpunkt außerhalb der Wegzeit-Tabelle liegt */
export const METER_BANDS = [1000, 3000, 10_000] as const;

export type ListGroup<I> = ListGroupHead & { key: string; items: I[] };

/**
 * „Neu eingestellt“ (Plan 0043, E4): drei Wochengruppen, rollierend in Berliner Kalendertagen; darin nach Termin, dann
 * Titel („was Neues kommt als Nächstes“). Jedes Angebot steht am selben Termin wie bei „Nächste Termine“.
 */
export function groupByListing<T extends Offer>(
  offers: readonly T[],
  now: Date,
  range?: DateRange,
  fits?: SessionFit,
): ListGroup<Occurrence<T>>[] {
  const bounds = weeks(berlinIsoDate(now));
  const byWeek: Record<ListingWeek, Occurrence<T>[]> = { "diese-woche": [], "vorige-woche": [], frueher: [] };
  for (const offer of offers) {
    const session = shownSession(offer, now, range, fits);
    if (session) byWeek[listingWeek(offer, now)].push({ offer, session });
  }
  const groups: ListGroup<Occurrence<T>>[] = [];
  for (const kind of ["diese-woche", "vorige-woche"] as const)
    if (byWeek[kind].length > 0)
      groups.push({ kind, key: kind, ...bounds[kind], items: byWeek[kind].sort(byStartThenTitle) });
  if (byWeek.frueher.length > 0)
    groups.push({ kind: "frueher", key: "frueher", items: byWeek.frueher.sort(byStartThenTitle) });
  return groups;
}

/** Gerundeter Wert wie auf der Karte (`reachShort`) und sein Band; „über 2 Std.“ zählt als unendlich */
function reachKey(reach: Reach): { band: ReachBand; value: number } {
  if (reach.kind === "oepnv") {
    const { over, value } = roundedMinutes(reach.minutes);
    const minutes = over ? Number.POSITIVE_INFINITY : value;
    const upTo = LIMIT_MINUTES.find((limit) => minutes <= limit);
    return { band: upTo === undefined ? { unit: "min" } : { unit: "min", upTo }, value: minutes };
  }
  const { unit, value } = roundedDistance(reach.meters);
  const meters = unit === "km" ? value * 1000 : value;
  const upTo = METER_BANDS.find((limit) => meters <= limit);
  return { band: upTo === undefined ? { unit: "m" } : { unit: "m", upTo }, value: meters };
}

/** Wegzeit vor Luftlinie, darin aufsteigend, „darüber“ zuletzt */
function compareBands(a: ReachBand, b: ReachBand): number {
  if (a.unit !== b.unit) return a.unit === "min" ? -1 : 1;
  const x = a.upTo ?? Number.POSITIVE_INFINITY;
  const y = b.upTo ?? Number.POSITIVE_INFINITY;
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * „Nächstgelegen“ (Plan 0043, E7): Bänder aus den Stufen der Wegzeit-Grenze („Bis 20 Minuten“ … „Über 45 Minuten“) auf
 * den gerundeten Minuten wie auf der Karte, bei Luftlinie nach Metern; darin nach gerundetem Wert, Termin, Titel.
 * Angebote ohne Ergebnis stehen am Ende. Jedes Angebot steht am selben Termin wie bei „Nächste Termine“.
 */
export function groupByReach<T extends Offer>(
  offers: readonly T[],
  now: Date,
  reachOf: (offer: T) => Reach | undefined,
  range?: DateRange,
  fits?: SessionFit,
): ListGroup<Occurrence<T>>[] {
  const bands = new Map<string, { band: ReachBand; items: { item: Occurrence<T>; value: number }[] }>();
  const without: Occurrence<T>[] = [];
  for (const offer of offers) {
    const session = shownSession(offer, now, range, fits);
    if (!session) continue;
    const reach = reachOf(offer);
    if (!reach) {
      without.push({ offer, session });
      continue;
    }
    const { band, value } = reachKey(reach);
    const key = `w:${band.unit}:${band.upTo ?? "mehr"}`;
    const entry = bands.get(key) ?? { band, items: [] };
    entry.items.push({ item: { offer, session }, value });
    bands.set(key, entry);
  }
  const groups: ListGroup<Occurrence<T>>[] = [...bands.entries()]
    .sort(([, a], [, b]) => compareBands(a.band, b.band))
    .map(([key, { band, items }]) => ({
      kind: "wegzeit",
      key,
      band,
      items: items.sort((a, b) => a.value - b.value || byStartThenTitle(a.item, b.item)).map(({ item }) => item),
    }));
  if (without.length > 0)
    groups.push({ kind: "ohne-wegzeit", key: "ohne-wegzeit", items: without.sort(byStartThenTitle) });
  return groups;
}
