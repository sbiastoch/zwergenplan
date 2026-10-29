/**
 * Zahl der Anbieter für die Statuszeile im Tab „Anbieter“ (Plan 0010, E4, E7). Eigenes kleines Modul wie
 * `place-key.ts`: Die Statuszeile zählt im Startbundle, ohne `directory.ts` (Lazy-Chunk) zu laden. Die Liste im
 * Chunk hat genau so viele aktive Zeilen, gemerkte aktive eingerechnet (`active` + aktive in `saved` ===
 * `countProviders(visible, view)`, directory.test.ts).
 */
export function countProviders(offers: readonly { providerId: string }[], view?: ProviderView): number {
  return new Set(offers.map((o) => o.providerId).filter((id) => !isOutside(view, id))).size;
}

/**
 * Kartenausschnitt der Anbieterkarte (Plan 0055, E2): `inView` hat mindestens einen Ort im Ausschnitt, `known` hat
 * überhaupt einen bekannten Ort. Einfache Mengen, damit Liste und Statuszeile den Karten-Chunk nicht importieren.
 * `undefined` heißt „Karte nicht bereit oder gescheitert“: Dann liegt niemand außerhalb.
 */
export interface ProviderView {
  inView: ReadonlySet<string>;
  known: ReadonlySet<string>;
}

/** Ein Anbieter ohne bekannten Ort gilt nie als außerhalb (Review B1). */
export function isOutside(view: ProviderView | undefined, providerId: string): boolean {
  return view !== undefined && view.known.has(providerId) && !view.inView.has(providerId);
}

/** Blendet der Ausschnitt mindestens einen Anbieter aus? Dann sagt die Statuszeile „im Kartenausschnitt“ (E4). */
export function viewNarrows(view: ProviderView | undefined): boolean {
  return view !== undefined && [...view.known].some((id) => !view.inView.has(id));
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
