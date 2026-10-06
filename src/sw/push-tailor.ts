/**
 * Zuschnitt der Wochen-Nachricht im Service Worker (Plan 0017, E10; ADR 0014). Die Umgebung (Netz, Cache,
 * Geräte-Speicher) kommt herein, damit alles ohne Browser testbar ist; `sw.ts` verdrahtet nur.
 *
 * Bei **jedem** Push: genau einmal `site.json` und `wegzeit.json` (für alle gleich, Privatsphäre), dazu Geburtsdatum,
 * Such-Abos, Startpunkt und gesehene IDs aus dem Geräte-Speicher. Alles in höchstens `timeoutMs` (iOS beendet den
 * Service Worker nach ≈ 10 s, Spike); nach Ablauf wird nichts mehr geschrieben.
 */
import { filterFromSearch } from "../domain/filter.ts";
import { newOfferIds, offersInWeek, type WeeklyText, weeklyText } from "../domain/news.ts";
import { placeKey } from "../domain/place-key.ts";
import type { Origin, ReachFn } from "../domain/reach.ts";
import { parseSearches } from "../domain/searches.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { originFromStored } from "../domain/stored-origin.ts";
import { decodeTransitTable, transitReach } from "../domain/transit.ts";
import type { TransitTableFile } from "../domain/transit-types.ts";

export type TailorOutcome =
  | { kind: "text"; text: WeeklyText }
  /** kein Zuschnitt möglich (gesehene IDs fehlten): das System bzw. der allgemeine Text */
  | { kind: "nichts" }
  | { kind: "zeit" }
  | { kind: "fehler" };

type StoreKey = "birthDate" | "searches" | "origin" | "seenIds";

export interface TailorEnv {
  timeoutMs: number;
  /** Netz am HTTP-Cache vorbei (bedingt); wirft bei Netz- oder Serverfehler */
  fetchJson(path: "data/site.json" | "data/wegzeit.json"): Promise<unknown>;
  /** Kopie aus `zp-data`, sonst `undefined` */
  cachedJson(path: "data/wegzeit.json"): Promise<unknown>;
  store: { get(key: StoreKey): Promise<unknown>; set(key: "seenIds", value: string[]): Promise<void> };
  /** Wegzeit ab `origin` aus der rohen Tabelle; im Unit-Test ersetzt (Dekodieren testet transit.test.ts) */
  reachFor?(table: unknown, offers: readonly SiteOffer[], origin: Origin): ReachFn | undefined;
}

function defaultReach(table: unknown, offers: readonly SiteOffer[], origin: Origin): ReachFn | undefined {
  // `decodeTransitTable` prüft Version und Form selbst und liefert sonst `undefined` (Cast ohne Risiko, Arch-Review N9)
  const decoded = decodeTransitTable(table as TransitTableFile, new Set(offers.map((o) => placeKey(o.venue.geo))));
  return decoded && transitReach(decoded, origin);
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === "string");

export async function tailorPush({
  now,
  test,
  env,
}: {
  now: Date;
  /** Testversand (`data.test`): nichts schreiben (E3) */
  test: boolean;
  env: TailorEnv;
}): Promise<TailorOutcome> {
  let late = false;
  const write = async (ids: string[]) => {
    if (test || late) return;
    await env.store.set("seenIds", ids).catch(() => undefined);
  };

  const work = async (): Promise<TailorOutcome> => {
    const [site, table, seen, searches, birthDate, stored] = await Promise.all([
      env.fetchJson("data/site.json").catch(() => undefined),
      env.fetchJson("data/wegzeit.json").catch(() => env.cachedJson("data/wegzeit.json")),
      env.store.get("seenIds"),
      env.store.get("searches"),
      env.store.get("birthDate"),
      env.store.get("origin"),
    ]);
    const offers = (site as { offers?: unknown } | undefined)?.offers;
    if (!Array.isArray(offers)) return { kind: "fehler" };
    // site.json entsteht zur Build-Zeit aus Zod-geprüften Daten; ein Formfehler wirft unten und endet als „fehler“, dann
    // zeigt das System die allgemeine Fassung (Arch-Review N9)
    const siteOffers = offers as SiteOffer[];
    const ids = siteOffers.map((o) => o.id);
    if (!isStringArray(seen)) {
      await write(ids);
      return { kind: "nichts" };
    }
    const origin = originFromStored(stored);
    const reach = origin && table !== undefined ? (env.reachFor ?? defaultReach)(table, siteOffers, origin) : undefined;
    const freshIds = new Set(newOfferIds(seen, siteOffers, now));
    const text = weeklyText({
      fresh: siteOffers.filter((o) => freshIds.has(o.id)),
      week: offersInWeek(siteOffers, now),
      searches: parseSearches(typeof searches === "string" ? searches : null).map(filterFromSearch),
      birthDate: typeof birthDate === "string" ? birthDate : undefined,
      reach,
      now,
    });
    await write(ids);
    return { kind: "text", text };
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<TailorOutcome>((resolve) => {
    timer = setTimeout(() => {
      late = true;
      resolve({ kind: "zeit" });
    }, env.timeoutMs);
  });
  try {
    return await Promise.race([work().catch((): TailorOutcome => ({ kind: "fehler" })), limit]);
  } finally {
    clearTimeout(timer);
  }
}
