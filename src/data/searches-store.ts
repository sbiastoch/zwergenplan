/**
 * Such-Abos im `localStorage` (Plan 0017, E6), roh: Geparst wird mit `parseSearches` in der Oberfläche und im
 * Service Worker, damit `src/data` hier keine Domänenlogik braucht. Nur auf dem Gerät; nie in URL, Logs oder Requests.
 * Lazy (Chunk „Als App“), nicht in `preferences.ts`: Das Start-Bundle hat keinen Platz.
 */
const KEY = "zwergenplan.such-abos";

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
