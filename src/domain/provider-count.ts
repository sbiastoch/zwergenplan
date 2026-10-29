/**
 * Zahl der Anbieter für die Statuszeile im Tab „Anbieter“ (Plan 0010, E4, E7). Eigenes kleines Modul wie
 * `place-key.ts`: Die Statuszeile zählt im Startbundle, ohne `directory.ts` (Lazy-Chunk) zu laden. Die Liste im
 * Chunk hat genau so viele aktive Zeilen, gemerkte aktive eingerechnet (`active` + aktive in `saved` ===
 * `countProviders(visible, view)`, directory.test.ts).
 */
import { isOutside, type MapExtent } from "./map-view.ts";

export function countProviders(offers: readonly { providerId: string }[], view?: MapExtent): number {
  return new Set(offers.map((o) => o.providerId).filter((id) => !isOutside(view, id))).size;
}

/**
 * Gibt es den Anbieter aus `anbieter=<id>` (E3)? Im Katalog oder, als Rückfall-Zeile, in den Angeboten. Sonst entfernt
 * die App den Parameter. Liegt im Start, weil der Lader des Sheets (ProviderPanel.tsx) das vor dem Chunk prüft.
 */
export function isKnownProvider(
  providers: readonly { id: string }[],
  offers: readonly { providerId: string }[],
  providerId: string,
): boolean {
  return providers.some((p) => p.id === providerId) || offers.some((o) => o.providerId === providerId);
}
