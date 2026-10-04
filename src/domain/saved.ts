/**
 * Merkliste: reine Logik. Gespeichert wird in src/data/preferences.ts (nur localStorage).
 * IDs, die im aktuellen Datenstand fehlen, werden nur ausgeblendet, nie gelöscht: Ein lückenhafter
 * Pipeline-Lauf soll keine Merkliste leeren.
 */
import { nextSession } from "./filter.ts";
import type { Offer, Session } from "./schema.ts";

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Gemerkte Angebote mit kommendem Termin, sortiert nach dem nächsten Termin. */
export function savedOffers<T extends Offer>(offers: readonly T[], ids: readonly string[], now: Date): T[] {
  const wanted = new Set(ids);
  return offers
    .flatMap((offer) => {
      const next = wanted.has(offer.id) ? nextSession(offer, now) : undefined;
      return next ? [{ offer, start: Date.parse(next.start) }] : [];
    })
    .sort((a, b) => a.start - b.start || a.offer.title.localeCompare(b.offer.title, "de"))
    .map((x) => x.offer);
}

/** Termine für den Sammel-Export: Kurse immer komplett, sonst nur nicht beendete. */
export function collectionSessions(offer: Offer, now: Date): Session[] {
  if (offer.format === "kurs") return offer.sessions;
  return offer.sessions.filter((s) => Date.parse(s.end) >= now.getTime());
}
