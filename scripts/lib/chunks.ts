/**
 * Chunk-Wächter (Plan 0010, E8): Direkt in `dist/assets/` liegt genau eine JS-Datei, der Einstieg `index-*.js`. Jeder
 * weitere Chunk dort lädt beim Start mit (z. B. React, das Rolldown beim Kalender-Versuch aus dem Einstieg abspaltete)
 * und fiele im Budget `JS (initial)` nur als Summe auf. Lazy-Chunks liegen in Unterordnern (`karte/`, `oepnv/` …);
 * die Prüfung ist nicht rekursiv, `.js.map` zählt nicht.
 * Ebenso genau eine CSS-Datei, `index-*.css` (Plan 0033, E4): Eine falsch abgelegte Chunk-CSS (Karte, Onboarding)
 * zählte sonst still ins Budget `CSS`.
 */

/** Dateien einer Endung: alles außer genau einem `index-*<ext>` ist ein Verstoß, ohne Einstieg auch das. */
function strays(names: readonly string[], ext: ".js" | ".css"): string[] {
  const files = names.filter((n) => n.endsWith(ext)).sort();
  const entries = files.filter((n) => n.startsWith("index-") && !n.includes("/"));
  if (entries.length === 0) return [`(kein index-*${ext})`, ...files];
  const [, ...extraEntries] = entries;
  return [...files.filter((n) => !entries.includes(n)), ...extraEntries];
}

/** Dateinamen direkt in `dist/assets/`, die gegen die Regel verstoßen; leer heißt grün. */
export function strayStartFiles(names: readonly string[]): string[] {
  return [...strays(names, ".js"), ...strays(names, ".css")];
}
