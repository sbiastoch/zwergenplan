/**
 * Pfade der statischen ICS-Dateien und Termin-Schlüssel der UID (ADR 0003). Eigenes Modul, weil das Detail die Pfade
 * beim Start braucht, der übrige ICS-Code (ics.ts) aber ein Lazy-Chunk ist (Plan 0010, E8 A).
 */
import type { Offer, Session } from "./schema.ts";
import { berlinKey } from "./time.ts";

/** `YYYYMMDDTHHmm` in Berliner Ortszeit: Teil von Dateipfad und UID */
export function sessionKey(session: Session): string {
  return berlinKey(session.start);
}

/** Dateiname der Reihen-Datei; die Datei aus dem Browser heißt genauso (Plan 0018, ADR 0018). */
export function seriesIcsFileName(offer: Offer): string {
  return `${offer.id}.ics`;
}

/** Pfade relativ zur Site-Basis. */
export function seriesIcsPath(offer: Offer): string {
  return `ics/${seriesIcsFileName(offer)}`;
}
export function sessionIcsPath(offer: Offer, session: Session): string {
  return `ics/${offer.id}/${sessionKey(session)}.ics`;
}
