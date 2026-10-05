/**
 * Chunk-Wächter (Plan 0010, E8): Direkt in `dist/assets/` liegt genau eine JS-Datei, der Einstieg `index-*.js`. Jeder
 * weitere Chunk dort lädt beim Start mit (z. B. React, das Rolldown beim Kalender-Versuch aus dem Einstieg abspaltete)
 * und fiele im Budget `JS (initial)` nur als Summe auf. Lazy-Chunks liegen in Unterordnern (`karte/`, `oepnv/` …);
 * die Prüfung ist nicht rekursiv, `.js.map` zählt nicht.
 */

/** Dateinamen direkt in `dist/assets/`, die gegen die Regel verstoßen; leer heißt grün. */
export function strayStartChunks(names: readonly string[]): string[] {
  const js = names.filter((n) => n.endsWith(".js")).sort();
  const entries = js.filter((n) => /^index-[^/]+\.js$/.test(n));
  if (entries.length === 0) return ["(kein index-*.js)", ...js];
  const [, ...extraEntries] = entries;
  return [...js.filter((n) => !entries.includes(n)), ...extraEntries];
}
