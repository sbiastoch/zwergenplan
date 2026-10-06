/**
 * Zuschnitt der Wochen-Nachricht im Service Worker (Plan 0017, E10; ADR 0014). Die Umgebung (Netz, Cache,
 * Geräte-Speicher) kommt herein, damit alles ohne Browser testbar ist; `sw.ts` verdrahtet nur.
 *
 * Bei **jedem** Push: genau einmal `site.json` und `wegzeit.json` (für alle gleich, Privatsphäre), dazu Geburtsdatum,
 * Such-Abos, Startpunkt und gesehene IDs aus dem Geräte-Speicher. Alles in höchstens `timeoutMs` (iOS beendet den
 * Service Worker nach ≈ 10 s, Spike); nach Ablauf wird nichts mehr geschrieben.
 */
import { districtById } from "../domain/districts.ts";
import { filterFromSearch } from "../domain/filter.ts";
import { coarsen, inBounds } from "../domain/geo.ts";
import { newOfferIds, offersInWeek, type WeeklyText, weeklyText } from "../domain/news.ts";
import { placeKey } from "../domain/place-key.ts";
import type { Origin, ReachFn } from "../domain/reach.ts";
import { parseSearches } from "../domain/searches.ts";
import type { SiteOffer } from "../domain/site-data.ts";
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

/** Gespeicherter Startpunkt (wie im `localStorage`, ADR 0017) → Origin; ungültig oder außerhalb → `undefined` */
export function originFromStored(value: unknown): Origin | undefined {
  if (typeof value === "string") {
    const district = districtById(value);
    return district && { source: "stadtteil", point: district.point, label: district.name, districtId: district.id };
  }
  const { source, lat, lon } = Object(value) as { source?: unknown; lat?: unknown; lon?: unknown };
  if ((source !== "standort" && source !== "karte") || typeof lat !== "number" || typeof lon !== "number") {
    return undefined;
  }
  // erneut runden und gegen die Stadtgrenze prüfen wie `storedPointOrigin` (src/ui/origin-state.ts)
  const point = coarsen({ lat, lon });
  return inBounds(point) ? { source, point, label: "" } : undefined;
}

function defaultReach(table: unknown, offers: readonly SiteOffer[], origin: Origin): ReachFn | undefined {
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
