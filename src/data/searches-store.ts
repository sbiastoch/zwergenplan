/**
 * Such-Abos im `localStorage` (Plan 0017, E6), roh: Geparst wird mit `parseSearches` in der Oberfläche und im
 * Service Worker, damit `src/data` hier keine Domänenlogik braucht. Nur auf dem Gerät; nie in URL, Logs oder Requests.
 * Lazy (Chunk „Als App“), nicht in `preferences.ts`: Das Start-Bundle hat keinen Platz. Nur der Schlüssel kommt von
 * dort, damit `hasStoredData` die Such-Abos mitzählt (Plan 0033, E2).
 */
import { SEARCHES_KEY as KEY } from "./preferences.ts";

export function loadSearchesRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveSearches(list: readonly string[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // privater Modus o. ä.: gilt nur für diese Sitzung
  }
}
