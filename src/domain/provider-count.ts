/**
 * Zahl der Anbieter für die Statuszeile im Tab „Anbieter“ (Plan 0010, E4, E7). Eigenes kleines Modul wie
 * `place-key.ts`: Die Statuszeile zählt im Startbundle, ohne `directory.ts` (Lazy-Chunk) zu laden. Die Liste im
 * Chunk hat genau so viele aktive Zeilen (`active.length === countProviders(visible)`, directory.test.ts).
 */
export function countProviders(offers: readonly { providerId: string }[]): number {
  return new Set(offers.map((o) => o.providerId)).size;
}
