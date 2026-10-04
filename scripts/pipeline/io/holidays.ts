/** OpenHolidays (DE-BY) je Jahr abrufen und cachen. Auswertung: lib/holidays.ts. */
import { freeDays, type OpenHoliday, OpenHolidaysResponse } from "../lib/holidays.ts";
import { readCache, writeCache } from "./cache.ts";
import { fetchJson } from "./http.ts";

const API = "https://openholidaysapi.org";

const DAY_MS = 86_400_000;

/**
 * Ein Jahr Ferien/Feiertage. Vergangene Jahre bleiben dauerhaft im Cache; laufende und künftige Jahre
 * werden nach 30 Tagen neu geholt (OpenHolidays pflegt sie nach). Leere Antworten werden nie gecacht.
 */
async function year(y: number): Promise<OpenHoliday[]> {
  const cached = readCache<{ fetchedAt: number; entries: OpenHoliday[] }>(`holidays-${y}.json`);
  const final = y < new Date().getFullYear();
  if (cached?.entries?.length && (final || Date.now() - cached.fetchedAt < 30 * DAY_MS)) return cached.entries;
  const all: OpenHoliday[] = [];
  for (const kind of ["SchoolHolidays", "PublicHolidays"]) {
    const url = `${API}/${kind}?countryIsoCode=DE&subdivisionCode=DE-BY&languageIsoCode=DE&validFrom=${y}-01-01&validTo=${y}-12-31`;
    all.push(...OpenHolidaysResponse.parse(await fetchJson(url, { timeoutMs: 30_000 })));
  }
  if (all.length > 0) writeCache(`holidays-${y}.json`, { fetchedAt: Date.now(), entries: all });
  return all;
}

/** Freie Tage im Zeitraum (Jahre werden einzeln geladen und gecacht). */
export async function loadFreeDays(from: string, to: string): Promise<Record<string, string>> {
  const entries: OpenHoliday[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) entries.push(...(await year(y)));
  return freeDays(entries, from, to);
}
