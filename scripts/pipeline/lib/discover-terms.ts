/**
 * Suchbegriffe des Entdeckens (Plan 0032, E7.2): feste, regionsneutrale Liste; die Region geht als Name in die
 * Suche (E13). Je Begriff und Region ein Modellaufruf mit Websuche.
 */
export const DISCOVER_TERMS = [
  "Krabbelgruppe",
  "PEKiP",
  "Babyschwimmen",
  "Babymassage",
  "Eltern-Kind-Turnen",
  "Musikgarten",
  "Familienzentrum",
  "Familienbildungsstätte",
  "Hebammenpraxis Kurse",
  "Eltern-Kind-Gruppe Pfarrei",
] as const;

/**
 * Teilmenge für Proben (`--terms`): Begriffe, deren Namen einen der Filter enthalten (ohne Groß-/Kleinschreibung).
 * Ein Filter ohne Treffer ist ein Fehler, damit ein Tippfehler nicht still alle Begriffe auslässt.
 */
export function selectTerms(filters?: readonly string[]): string[] {
  if (!filters || filters.length === 0) return [...DISCOVER_TERMS];
  const lower = filters.map((f) => f.trim().toLowerCase()).filter(Boolean);
  for (const f of lower)
    if (!DISCOVER_TERMS.some((t) => t.toLowerCase().includes(f))) throw new Error(`Unbekannter Suchbegriff: ${f}`);
  return DISCOVER_TERMS.filter((t) => lower.some((f) => t.toLowerCase().includes(f)));
}

/** Suchanfrage je Begriff und Region */
export const searchQuery = (term: string, regionName: string): string => `${term} ${regionName}`;
