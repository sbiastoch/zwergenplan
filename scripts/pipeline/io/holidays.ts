/**
 * OpenHolidays je Bundesland und Jahr abrufen und cachen (Plan 0039, E6). Auswertung: lib/holidays.ts.
 * Cache `holidays-<land>-<jahr>.json`; die alten `holidays-<jahr>.json` (nur Bayern) werden nicht mehr gelesen.
 */
import type { NetworkId } from "../../../src/domain/regions.ts";
import {
  type FreeDaysByNetwork,
  freeDays,
  type OpenHoliday,
  OpenHolidaysResponse,
  type Subdivision,
  subdivisionOf,
} from "../lib/holidays.ts";
import { readCache, writeCache } from "./cache.ts";
import { fetchJson } from "./http.ts";

const API = "https://openholidaysapi.org";

const DAY_MS = 86_400_000;

/**
 * Ein Jahr Ferien/Feiertage eines Landes. Vergangene Jahre bleiben dauerhaft im Cache; laufende und künftige Jahre
 * werden nach 30 Tagen neu geholt (OpenHolidays pflegt sie nach). Leere Antworten werden nie gecacht.
 */
async function year(subdivision: Subdivision, y: number): Promise<OpenHoliday[]> {
  const file = `holidays-${subdivision}-${y}.json`;
  const cached = readCache<{ fetchedAt: number; entries: OpenHoliday[] }>(file);
  const final = y < new Date().getFullYear();
  if (cached?.entries?.length && (final || Date.now() - cached.fetchedAt < 30 * DAY_MS)) return cached.entries;
  const all: OpenHoliday[] = [];
  for (const kind of ["SchoolHolidays", "PublicHolidays"]) {
    const url = `${API}/${kind}?countryIsoCode=DE&subdivisionCode=${subdivision}&languageIsoCode=DE&validFrom=${y}-01-01&validTo=${y}-12-31`;
    all.push(...OpenHolidaysResponse.parse(await fetchJson(url, { timeoutMs: 30_000 })));
  }
  if (all.length > 0) writeCache(file, { fetchedAt: Date.now(), entries: all });
  return all;
}

/** Freie Tage eines Landes im Zeitraum (Jahre werden einzeln geladen und gecacht). */
export async function loadFreeDays(
  subdivision: Subdivision,
  from: string,
  to: string,
): Promise<Record<string, string>> {
  const entries: OpenHoliday[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++)
    entries.push(...(await year(subdivision, y)));
  return freeDays(entries, subdivision, from, to);
}

/** Lädt die Ferien je Land; Tests geben einen Ersatz ohne Netz hinein. */
export type FreeDaysLoader = typeof loadFreeDays;

/** Freie Tage der genannten Netze im Zeitraum, je Netz einmal geladen (Plan 0039, E6). */
export async function loadFreeDaysByNetwork(
  networks: readonly NetworkId[],
  from: string,
  to: string,
  load: FreeDaysLoader = loadFreeDays,
): Promise<FreeDaysByNetwork> {
  const out: Partial<Record<NetworkId, Record<string, string>>> = {};
  for (const network of networks) out[network] = await load(subdivisionOf(network), from, to);
  return out;
}
