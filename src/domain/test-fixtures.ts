/** Lädt die fiktiven Testdaten für Unit-Tests (nur Node). */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { validateDataset } from "./dataset.ts";
import type { Offer, OffersFile, Provider } from "./schema.ts";

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

export function fixtureOffer(idPart: string): Offer {
  const offer = loadFixtures().file.offers.find((o) => o.id.includes(idPart));
  if (!offer) throw new Error(`Fixture-Angebot ${idPart} fehlt`);
  return offer;
}

/** „Jetzt“ der Fixtures: Montag, 5.10.2026, 12:00 Berlin. */
export const FIXTURE_NOW = new Date("2026-10-05T12:00:00+02:00");
