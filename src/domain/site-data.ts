/**
 * Was die Oberfläche lädt (public/data/site.json): geprüfte Angebote, denormalisiert um
 * Anbietername und Ort. Die UI importiert hieraus nur Typen – kein zod im Client-Bundle.
 */
import type { Offer, OffersFile, Provider, Venue } from "./schema.ts";

export interface SiteOffer extends Offer {
  providerName: string;
  venue: Pick<Venue, "name" | "address" | "district" | "ring" | "geo">;
}

export interface SiteData {
  generatedAt: string;
  offers: SiteOffer[];
}

export interface SiteMeta {
  offers: number;
  providers: number;
  generatedAt: string;
  commit: string;
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
      venue: { name, address, ring, geo, ...(district === undefined ? {} : { district }) },
    };
  });
  // Chronologisch nach erstem Termin – stabile Reihenfolge für Liste und Tests.
  offers.sort(
    (a, b) =>
      Date.parse(a.sessions[0]?.start ?? "") - Date.parse(b.sessions[0]?.start ?? "") || a.id.localeCompare(b.id),
  );
  return { generatedAt: file.generatedAt, offers };
}
