/**
 * Was die Oberfläche lädt (public/data/site.json): geprüfte Angebote, denormalisiert um
 * Anbietername und Ort. Die UI importiert hieraus nur Typen – kein zod im Client-Bundle.
 */
import { type NetworkId, networkOf } from "./regions.ts";
import type { Offer, OffersFile, Provider, Venue } from "./schema.ts";
import { type Category, withCategory } from "./topics.ts";

/** `providerId` ist hier die `publicId` des Anbieters, nicht die Katalog-ID (ADR 0022); `venueId` bleibt intern. */
export interface SiteOffer extends Offer {
  providerName: string;
  /** Netz der Region des Anbieters (Plan 0039, E7); die Region selbst erreicht die Website nicht (ADR 0029, Punkt 2) */
  network: NetworkId;
  venue: Pick<Venue, "name" | "address" | "district" | "geo">;
}

export interface SiteData {
  generatedAt: string;
  offers: SiteOffer[];
}

/**
 * Ein Anbieter in der Anbieterübersicht (Plan 0010, E6): nur Angaben für Eltern, nichts aus der Recherche
 * (kein `programme`, `notes`, `region`, `geo`, kein Orts-`hint`). Nur Katalog-Einträge mit `role: anbieter`.
 */
export interface SiteProvider {
  /** `publicId` aus dem Katalog (ADR 0022) */
  id: string;
  name: string;
  /** Website; laut Katalog bei allen Anbietern zugleich eine Programm-URL („Website & Programm“) */
  url: string;
  /** Netz der Region (Plan 0039, E7): Tab und Sheet „Anbieter“ zeigen nur das gewählte Netz */
  network: NetworkId;
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

/** Angebote eines Netzes, Reihenfolge bleibt: Liste, Karte, Willkommenszahl, Karte der Merkliste (Plan 0039, E7/E8) */
export function offersInNetwork<T extends { network: NetworkId }>(offers: readonly T[], network: NetworkId): T[] {
  return offers.filter((o) => o.network === network);
}

/*
 * Übergang Plan 0039 (Arch-Review M1): Ein site.json bzw. anbieter.json aus einem Cache vor Plan 0039 (alter Service
 * Worker, alter Build) hat kein `network`. Ohne Rückfall wäre das Netz `vgn` leer, Bestandsnutzer sähen „In Nürnberg
 * und Fürth haben wir noch keine Angebote“. Vor Plan 0039 gab es nur Nürnberg und Fürth, also `vgn`. Der Rückfall
 * entfällt zusammen mit dem für `category` (Plan 0037, E13, Stufe C), frühestens 14 Tage nach dem Deploy von Plan
 * 0039: Dann hat jeder Service Worker site.json und anbieter.json mindestens einmal neu geladen.
 */
const NETWORK_BEFORE_0039: NetworkId = "vgn";

/** `site.json` im lockeren Format: ohne `category` (vor Plan 0037, Stufe A; E13) oder ohne `network` (vor Plan 0039) */
export type LooseSiteData = Omit<SiteData, "offers"> & {
  offers: Array<Omit<SiteOffer, "category" | "network"> & { category?: Category; network?: NetworkId }>;
};

/** `anbieter.json` im lockeren Format: Anbieter ohne `network` (vor Plan 0039) */
export type LooseProviderDirectoryData = Omit<ProviderDirectoryData, "providers"> & {
  providers: Array<Omit<SiteProvider, "network"> & { network?: NetworkId }>;
};

/**
 * Übernimmt geladene Angebote: ohne `category` mit dem Rückfall aus den Themen (Plan 0037, E13), ohne `network` mit
 * `vgn` (Übergang Plan 0039, Arch-Review M1). Einzige Stelle dafür, nicht in `src/data` (ADR 0010,
 * `data-domain-runtime-allowlist`); `App.tsx` ruft sie nach jedem Laden.
 */
// Übergang Plan 0037 (E13) und Plan 0039 (Arch-Review M1): Rückfälle bleiben bis Stufe C von Plan 0037
export function adoptSiteData(data: LooseSiteData): SiteData {
  return {
    ...data,
    offers: data.offers.map((offer) =>
      withCategory<SiteOffer>({ ...offer, network: offer.network ?? NETWORK_BEFORE_0039 }),
    ),
  };
}

/** Übernimmt einen geladenen Katalog; ein Anbieter ohne `network` gehört zu `vgn` (Übergang Plan 0039, Arch-Review M1) */
// Übergang Plan 0039 (Arch-Review M1): Rückfall bleibt bis Stufe C von Plan 0037
export function adoptDirectory(data: LooseProviderDirectoryData): ProviderDirectoryData {
  return {
    ...data,
    providers: data.providers.map((p) => ({ ...p, network: p.network ?? NETWORK_BEFORE_0039 })),
  };
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
    const venue = provider?.role === "anbieter" ? provider.venues.find((v) => v.id === offer.venueId) : undefined;
    if (provider?.role !== "anbieter" || !venue) throw new Error(`Ungeprüfte Daten: ${offer.id}`);
    const { name, address, district, geo } = venue;
    return {
      ...offer,
      // die einzige Anbieter-ID im Browser ist die publicId (ADR 0022)
      providerId: provider.publicId,
      providerName: provider.name,
      network: networkOf(provider.region),
      venue: {
        name,
        address: venueAddress(name, address),
        geo,
        ...(district === undefined ? {} : { district }),
      },
    };
  });
  // Chronologisch nach erstem Termin, bei gleichem Beginn nach Titel: Die Kurz-ID wirkt zufällig (Plan 0015 E13).
  offers.sort(
    (a, b) =>
      Date.parse(a.sessions[0]?.start ?? "") - Date.parse(b.sessions[0]?.start ?? "") ||
      a.title.localeCompare(b.title, "de") ||
      a.id.localeCompare(b.id),
  );
  return { generatedAt: file.generatedAt, offers };
}

/**
 * Katalog für die Anbieterübersicht (Plan 0010, E6): nur `role: anbieter`, auch ohne Angebote, nach Name (`de`).
 * Genau die Felder aus `SiteProvider` – Recherche-Angaben (`programme`, `notes`, `region`, `geo`, Orts-`hint` …) bleiben
 * draußen; aus der Region wird nur das Netz (Plan 0039, E7).
 */
export function toProviderDirectory(providers: readonly Provider[], generatedAt: string): ProviderDirectoryData {
  const list = providers.flatMap((p): SiteProvider[] =>
    p.role === "anbieter"
      ? [
          {
            id: p.publicId,
            name: p.name,
            url: p.url,
            network: networkOf(p.region),
            venues: p.venues.map(({ name, address, district }) => ({
              name,
              address: venueAddress(name, address),
              ...(district === undefined ? {} : { district }),
            })),
          },
        ]
      : [],
  );
  list.sort((a, b) => a.name.localeCompare(b.name, "de"));
  return { generatedAt, providers: list };
}
