/**
 * Such-Abos im `localStorage` (Plan 0017, E6), roh: Geparst wird mit `parseSearches` in der Oberfläche und im
 * Service Worker, damit `src/data` hier keine Domänenlogik braucht. Nur auf dem Gerät; nie in URL, Logs oder Requests.
 * Seit Plan 0054 (E6, ADR 0037) im Start, für die Glocke über der Liste und die Verwaltung im Kind-Sheet. Der Schlüssel
 * liegt seit Plan 0035 (E4) hier; den Namen belegen `e2e/push.spec.ts` und `e2e/app.spec.ts`, die ihn wörtlich lesen.
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
