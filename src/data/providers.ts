/**
 * Katalog der Anbieterübersicht laden (Plan 0010, E6): `data/anbieter.json` vom eigenen Origin, für alle gleich, erst
 * beim Öffnen von Tab oder Sheet (bzw. beim Start mit `ansicht=anbieter`/`anbieter=` in der URL). Zwei getrennte
 * Schritte (Review 2, M1): `loadProviderDirectory` kennt `site.json` nicht und kann deshalb schon beim Parsen der Route
 * starten; `ensureFresh` gleicht danach den Datenstand ab. `fetch` wird injiziert, weil Unit-Tests ihn verbieten.
 */
import type { ProviderDirectoryData } from "../domain/site-data.ts";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// zur Aufrufzeit lesen und ohne `this` rufen (sonst „Illegal invocation“)
const browserFetch: FetchFn = (url, init) => globalThis.fetch(url, init);

async function fetchDirectory(fetchFn: FetchFn, init?: RequestInit): Promise<ProviderDirectoryData> {
  const res = await fetchFn(`${import.meta.env.BASE_URL}data/anbieter.json`, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Build-Artefakt, beim Build mit Zod geprüft (scripts/build-data.ts) – hier kein erneutes Parsen.
  return (await res.json()) as ProviderDirectoryData;
}

/** HTTP ≠ 2xx wirft. Gemerkt wird hier nichts; das gemeinsame Promise hält der Lader (ProviderPanel.tsx). */
export function loadProviderDirectory(fetchFn: FetchFn = browserFetch): Promise<ProviderDirectoryData> {
  return fetchDirectory(fetchFn);
}

/** Ergebnis des Abgleichs je erwartetem Datenstand: Liste und Sheet laden nicht zweimal nach. */
const reloads = new Map<string, Promise<ProviderDirectoryData>>();

/**
 * Datenstand-Abgleich (M4): Stimmt `data.generatedAt` mit `expected` (aus site.json) überein, kommt `data` zurück.
 * Sonst, weil Pages oder der Browser eine ältere Fassung cachen, **höchstens ein** Request am HTTP-Cache vorbei.
 * Weicht der Stand danach immer noch ab oder scheitert der Request, gilt die Datei trotzdem: Fehlende Anbieter baut
 * der Chunk als Rückfall-Zeilen aus den Angeboten. Wirft nie.
 */
export function ensureFresh(
  data: ProviderDirectoryData,
  expected: string,
  fetchFn: FetchFn = browserFetch,
): Promise<ProviderDirectoryData> {
  const known = reloads.get(expected);
  if (known) return known;
  if (data.generatedAt === expected) return Promise.resolve(data);
  const reload = fetchDirectory(fetchFn, { cache: "reload" }).catch(() => data);
  reloads.set(expected, reload);
  return reload;
}
