/**
 * Was die Oberfläche lädt (public/data/site.json): geprüfte Angebote, denormalisiert um
 * Anbietername und Ort. Die UI importiert hieraus nur Typen – kein zod im Client-Bundle.
 */
import type { Offer, OffersFile, Provider, Venue } from "./schema.ts";
import type { Topic } from "./topics.ts";

export interface SiteOffer extends Offer {
  providerName: string;
  venue: Pick<Venue, "name" | "address" | "district" | "ring" | "geo">;
}

export interface SiteData {
  generatedAt: string;
  offers: SiteOffer[];
}

/**
 * Ein Anbieter in der Anbieterübersicht (Plan 0010, E6): nur Angaben für Eltern, nichts aus der Recherche
 * (kein `programme`, `notes`, `ring`, `geo`). Nur Katalog-Einträge mit `role: anbieter`.
 */
export interface SiteProvider {
  id: string;
  name: string;
  /** Website; laut Katalog bei allen Anbietern zugleich eine Programm-URL („Website & Programm“) */
  url: string;
  topics: Topic[];
  /** Adresse ohne wiederholten Ortsnamen (`venueAddress`); `district` nur mit Wert */
  venues: Array<{ name: string; address: string; district?: string }>;
}

/** Was die Anbieterübersicht lädt (public/data/anbieter.json), erst beim Öffnen von Tab oder Sheet (E6). */
export interface ProviderDirectoryData {
  /** derselbe Datenstand wie site.json; weicht er ab, lädt `ensureFresh` einmal neu (M4) */
  generatedAt: string;
  /** nach Name sortiert (`de`) */
  providers: SiteProvider[];
}

export interface SiteMeta {
  offers: number;
  providers: number;
  generatedAt: string;
  commit: string;
}

/** Schema-Minimum einer Adresse (`Venue.address`); site-data.test.ts hält beide Werte gleich. */
export const MIN_ADDRESS = 5;

/**
 * Adresse ohne wiederholten Ortsnamen (Plan 0007, H6): Viele Katalog-Adressen beginnen mit dem
 * Ortsnamen („CVJM-Haus, Kornmarkt 6, …“) oder enden mit ihm in Klammern. Detail und ICS-LOCATION
 * nennen den Namen ohnehin, er stünde dann doppelt. Nur ganze Treffer (ohne Groß-/Kleinschreibung)
 * werden abgeschnitten; bliebe weniger als das Schema-Minimum übrig, bleibt die Adresse, wie sie ist.
 */
export function venueAddress(name: string, address: string): string {
  const venue = name.trim();
  if (venue === "") return address;
  const same = (a: string, b: string) => a.toLocaleLowerCase("de") === b.toLocaleLowerCase("de");
  let result = address.trim();
  if (result.charAt(venue.length) === "," && same(result.slice(0, venue.length), venue)) {
    result = result.slice(venue.length + 1).trim();
  }
  const suffix = `(${venue})`;
  if (same(result.slice(-suffix.length), suffix)) result = result.slice(0, -suffix.length).trim();
  return result.length < MIN_ADDRESS ? address : result;
}

export function toSiteData(providers: readonly Provider[], file: OffersFile): SiteData {
  const byId = new Map(providers.map((p) => [p.id, p]));
  const offers = file.offers.map((offer): SiteOffer => {
    const provider = byId.get(offer.providerId);
    const venue = provider?.venues.find((v) => v.id === offer.venueId);
    if (!provider || !venue) throw new Error(`Ungeprüfte Daten: ${offer.id}`);
    const { name, address, district, ring, geo } = venue;
    return {
      ...offer,
      providerName: provider.name,
      venue: {
        name,
        address: venueAddress(name, address),
        ring,
        geo,
        ...(district === undefined ? {} : { district }),
      },
    };
  });
  // Chronologisch nach erstem Termin – stabile Reihenfolge für Liste und Tests.
  offers.sort(
    (a, b) =>
      Date.parse(a.sessions[0]?.start ?? "") - Date.parse(b.sessions[0]?.start ?? "") || a.id.localeCompare(b.id),
  );
  return { generatedAt: file.generatedAt, offers };
}
