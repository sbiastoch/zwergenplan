/**
 * Such-Abos (Plan 0017, E6): Sucheinstellungen der Liste, die die Wochen-Nachricht zuschneiden. Ein Abo ist der
 * kanonische Filter-Querystring ohne Zeitraum (`searchOf`), kein eigenes Format. Rein; gespeichert wird die Liste roh in
 * `src/data/searches-store.ts`, nur auf dem Gerät. Nicht im Start-Bundle (`push-domain-not-in-start`).
 */
import { type FilterState, filterFromSearch, filterToSearch } from "./filter.ts";

export const MAX_SEARCHES = 5;

export type SearchOutcome = "neu" | "schon-da" | "leer" | "voll";

/**
 * Kanonische Form eines Abos: der Filter ohne Zeitraum (Plan 0023, E12). Die Wochen-Nachricht schaut immer auf die
 * kommende Woche; ein fester Zeitraum veraltete im Abo und träfe ohne Label alles.
 */
export function searchOf(filter: FilterState): string {
  const { range: _range, ...rest } = filter;
  return filterToSearch(rest);
}

/** Hängt die Suche an, wenn sie nicht leer, noch nicht da und noch Platz ist. Die Eingabe bleibt unverändert. */
export function addSearch(list: readonly string[], filter: FilterState): { list: string[]; outcome: SearchOutcome } {
  const search = searchOf(filter);
  const outcome: SearchOutcome = !search
    ? "leer"
    : list.includes(search)
      ? "schon-da"
      : list.length >= MAX_SEARCHES
        ? "voll"
        : "neu";
  return { list: outcome === "neu" ? [...list, search] : [...list], outcome };
}

export function removeSearch(list: readonly string[], search: string): string[] {
  return list.filter((s) => s !== search);
}

export function hasSearch(list: readonly string[], filter: FilterState): boolean {
  const search = searchOf(filter);
  return search !== "" && list.includes(search);
}

/**
 * Liest die gespeicherte Liste (JSON-Array von Querystrings). Jeder Eintrag wird normalisiert; Unbekanntes, Leeres
 * und Dubletten fallen weg, höchstens `MAX_SEARCHES` bleiben. Müll ergibt eine leere Liste.
 */
export function parseSearches(raw: string | null): string[] {
  let value: unknown;
  try {
    value = JSON.parse(raw ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const search = searchOf(filterFromSearch(entry));
    if (search && !out.includes(search)) out.push(search);
  }
  return out.slice(0, MAX_SEARCHES);
}
