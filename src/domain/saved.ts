/**
 * Merkliste: reine Logik. Gespeichert wird in src/data/preferences.ts (nur localStorage).
 * IDs, die im aktuellen Datenstand fehlen, werden nur ausgeblendet, nie gelöscht: Ein lückenhafter
 * Pipeline-Lauf soll keine Merkliste leeren. Das gilt auch für gemerkte Anbieter (Plan 0025, E1).
 */
import { nextSession, upcomingSessions } from "./agenda.ts";
import { isProviderId } from "./ids.ts";
import type { Offer, Session } from "./schema.ts";
import type { SiteOffer } from "./site-data.ts";

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
  return upcomingSessions(offer, now);
}

/**
 * Ein gemerkter Anbieter (Plan 0025, E1). `name` ist ein Schnappschuss beim Merken: Ohne kommende Angebote kennt
 * site.json den Anbieter nicht, und anbieter.json darf die Merkliste nicht laden (Privatsphäre).
 */
export interface SavedProvider {
  id: string;
  name: string;
}

/**
 * Gemerkte Anbieter aus dem Speicher bereinigen (Plan 0025, E1): gültige ID (`isProviderId`), ein Name, der nicht leer
 * ist (er ist Text und Herz-Label der Zeile), keine Dubletten; bei Dubletten gilt der erste Eintrag.
 */
export function cleanSavedProviders(raw: readonly SavedProvider[]): SavedProvider[] {
  const seen = new Set<string>();
  return raw.filter(({ id, name }) => {
    const keep = isProviderId(id) && name.trim() !== "" && !seen.has(id);
    seen.add(id);
    return keep;
  });
}

/** Merken bzw. entfernen per ID; neu Gemerktes hängt hinten an, mit dem Namen von jetzt. */
export function toggleProvider(list: readonly SavedProvider[], entry: SavedProvider): SavedProvider[] {
  return list.some((p) => p.id === entry.id)
    ? list.filter((p) => p.id !== entry.id)
    : [...list, { id: entry.id, name: entry.name }];
}

/** Zeile im Abschnitt „Gemerkte Anbieter“ (Plan 0025, E3) */
export interface SavedProviderRow extends SavedProvider {
  /** kommende Angebote des Anbieters, ungefiltert */
  upcoming: number;
  /** frühester nicht beendeter Termin dieser Angebote */
  next?: Session;
}

/**
 * Zeilen der gemerkten Anbieter, nach Name sortiert (`de`). Der Name kommt aus dem aktuellen Datenstand, sobald der
 * Anbieter ein kommendes Angebot hat, sonst aus dem Schnappschuss. Fehlt ein Anbieter im Datenstand, bleibt die Zeile.
 */
export function savedProviderRows(
  list: readonly SavedProvider[],
  offers: readonly SiteOffer[],
  now: Date,
): SavedProviderRow[] {
  return list
    .map(({ id, name }) => {
      const row: SavedProviderRow = { id, name, upcoming: 0 };
      for (const offer of offers) {
        const next = offer.providerId === id ? nextSession(offer, now) : undefined;
        if (!next) continue;
        if (row.upcoming === 0) row.name = offer.providerName;
        row.upcoming += 1;
        if (!row.next || Date.parse(next.start) < Date.parse(row.next.start)) row.next = next;
      }
      return row;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}
