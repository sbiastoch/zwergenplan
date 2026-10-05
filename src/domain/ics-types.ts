/**
 * Typen des ICS-Exports (ADR 0003, ADR 0007). Eigenes Modul, weil `ics.ts` ein Lazy-Chunk ist und von `src/` aus auch
 * Typen nicht statisch kommen dürfen (`ics-only-lazy`, Plan 0010, E8 A); Vorbild `transit-types.ts`.
 */
import type { Offer, Session, Venue } from "./schema.ts";

export interface IcsContext {
  providerName: string;
  venue: Pick<Venue, "name" | "address" | "geo">;
  /** DTSTAMP – aus generatedAt, damit die Ausgabe deterministisch ist. */
  stamp: string;
}

/** Was ein Angebot für den Kalender mitbringen muss: Anbietername und Ort (wie in `SiteOffer`). */
export interface IcsSource {
  providerName: string;
  venue: IcsContext["venue"];
}

export interface CollectionItem {
  offer: Offer;
  /** Auswahl aus `offer.sessions` (Nummerierung „(3/8)“ bleibt die der ganzen Reihe) */
  sessions: readonly Session[];
  ctx: IcsContext;
}
