import { describe, expect, it } from "vitest";
import { cleanSavedProviders, collectionSessions, savedOffers, toggleId } from "./saved.ts";
import { FIXTURE_NOW, fixtureKey, fixtureOffer, loadFixtures } from "./test-fixtures.ts";

const { file } = loadFixtures();
const id = (key: Parameters<typeof fixtureOffer>[0]) => fixtureOffer(key).id;

describe("toggleId", () => {
  it("merkt und entfernt", () => {
    expect(toggleId([], "a")).toEqual(["a"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("savedOffers", () => {
  it("liefert gemerkte, noch nicht vorbei-e Angebote nach nächstem Termin", () => {
    const ids = [id("babykonzert-advent"), id("vergangen"), id("krabbeltreff"), "gibt-es--nicht--mehr"];
    expect(savedOffers(file.offers, ids, FIXTURE_NOW).map(fixtureKey)).toEqual(["krabbeltreff", "babykonzert-advent"]);
  });

  it("sortiert laufende Kurse nach dem nächsten, nicht dem ersten Termin", () => {
    const later = new Date("2026-11-11T12:00:00+01:00"); // PEKiP läuft, nächster Termin 17.11.
    const ids = [id("pekip-herbst"), id("kuckuck-im-nest")];
    expect(savedOffers(file.offers, ids, later).map(fixtureKey)).toEqual(["kuckuck-im-nest", "pekip-herbst"]);
  });
});

describe("collectionSessions", () => {
  it("nimmt Kurse immer komplett", () => {
    const pekip = fixtureOffer("pekip-herbst");
    expect(collectionSessions(pekip, new Date("2026-11-11T12:00:00+01:00"))).toHaveLength(8);
  });

  it("nimmt bei regelmäßigen Angeboten nur kommende Termine", () => {
    const treff = fixtureOffer("krabbeltreff"); // 7.10.–4.11., 5 Termine
    expect(collectionSessions(treff, FIXTURE_NOW)).toHaveLength(5);
    expect(collectionSessions(treff, new Date("2026-10-21T12:00:00+02:00"))).toHaveLength(2);
  });
});

describe("cleanSavedProviders (Plan 0025, E1)", () => {
  it("verwirft ungültige IDs", () => {
    expect(cleanSavedProviders(["Familientreff", "mit leerzeichen", "familientreff-beispiel"])).toEqual([
      "familientreff-beispiel",
    ]);
  });

  it("verwirft zu lange IDs", () => {
    expect(cleanSavedProviders(["a".repeat(81)])).toEqual([]);
    expect(cleanSavedProviders(["a".repeat(80)])).toHaveLength(1);
  });

  it("bei Dubletten gilt der erste Eintrag, die Reihenfolge bleibt", () => {
    expect(cleanSavedProviders(["b-anbieter", "a-anbieter", "b-anbieter"])).toEqual(["b-anbieter", "a-anbieter"]);
  });
});
