/** Lädt die fiktiven Testdaten für Unit-Tests (nur Node). */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { validateDataset } from "./dataset.ts";
import type { Offer, OffersFile, Provider } from "./schema.ts";
import { type SiteOffer, toSiteData } from "./site-data.ts";

const root = new URL("../../tests/fixtures/", import.meta.url);

export function rawFixtures(): { providers: unknown; offers: unknown } {
  return {
    providers: parse(readFileSync(new URL("providers.yaml", root), "utf8")),
    offers: JSON.parse(readFileSync(new URL("offers.json", root), "utf8")),
  };
}

export function loadFixtures(): { providers: Provider[]; file: OffersFile } {
  const raw = rawFixtures();
  const result = validateDataset(raw.providers, raw.offers);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return { providers: result.providers, file: result.offers };
}

/** Die Fixtures so, wie die Oberfläche sie lädt: mit Anbietername und Ort (für Filter mit Umkreis). */
export function fixtureSiteOffers(): SiteOffer[] {
  const { providers, file } = loadFixtures();
  return toSiteData(providers, file).offers;
}

/** Kurze, stabile Testschlüssel → Titel der fiktiven Angebote (die IDs selbst sind lang, ADR 0006). */
const FIXTURE_TITLES = {
  "pekip-herbst": "PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026)",
  krabbeltreff: "Offener Krabbeltreff",
  "babymassage-workshop": "Babymassage – Schnupper-Workshop",
  "musikgarten-1": "Musikgarten 1 (1–2 Jahre)",
  krabbelreime: "Krabbelreime & Fingerspiele",
  "kuckuck-im-nest": "„Kuckuck im Nest“ – Theater ab 18 Monaten",
  "babykonzert-advent": "Babykonzert im Advent",
  vergangen: "Elterncafé am Montag",
} as const;
export type FixtureKey = keyof typeof FIXTURE_TITLES;

export function fixtureKey(offer: Pick<Offer, "title">): FixtureKey | undefined {
  return (Object.keys(FIXTURE_TITLES) as FixtureKey[]).find((k) => FIXTURE_TITLES[k] === offer.title);
}

export function fixtureOffer(key: FixtureKey): Offer {
  const offer = loadFixtures().file.offers.find((o) => o.title === FIXTURE_TITLES[key]);
  if (!offer) throw new Error(`Fixture-Angebot ${key} fehlt`);
  return offer;
}

/** „Jetzt“ der Fixtures: Montag, 5.10.2026, 12:00 Berlin. */
export const FIXTURE_NOW = new Date("2026-10-05T12:00:00+02:00");
