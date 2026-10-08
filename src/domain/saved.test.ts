import { describe, expect, it } from "vitest";
import {
  cleanSavedProviders,
  collectionSessions,
  savedOffers,
  savedProviderRows,
  toggleId,
  toggleProvider,
} from "./saved.ts";
import { FIXTURE_NOW, fixtureKey, fixtureOffer, fixtureSiteOffers, loadFixtures } from "./test-fixtures.ts";

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
  it("verwirft ungültige IDs (Großbuchstaben, Leerzeichen, Pfad)", () => {
    const raw = [
      { id: "Familientreff", name: "A" },
      { id: "theater beispiel", name: "B" },
      { id: "../x", name: "C" },
      { id: "theater-beispiel", name: "Theater" },
    ];
    expect(cleanSavedProviders(raw)).toEqual([{ id: "theater-beispiel", name: "Theater" }]);
  });

  it("verwirft eine zu lange ID (81 Zeichen), behält 80", () => {
    const ok = "a".repeat(80);
    expect(
      cleanSavedProviders([
        { id: `${ok}a`, name: "zu lang" },
        { id: ok, name: "genau" },
      ]),
    ).toEqual([{ id: ok, name: "genau" }]);
  });

  it("verwirft einen leeren Namen: Er wäre Zeilentext und Herz-Label (Arch-Review Etappe 1, K5)", () => {
    const raw = [
      { id: "theater-beispiel", name: "" },
      { id: "musikschule-beispiel", name: "  " },
      { id: "familientreff-beispiel", name: "Familientreff" },
    ];
    expect(cleanSavedProviders(raw)).toEqual([{ id: "familientreff-beispiel", name: "Familientreff" }]);
  });

  it("bei Dubletten gilt der erste Eintrag, die Reihenfolge bleibt", () => {
    const raw = [
      { id: "theater-beispiel", name: "Theater" },
      { id: "familientreff-beispiel", name: "Familientreff" },
      { id: "theater-beispiel", name: "Theater (später)" },
      { id: "musikschule-beispiel", name: "Musikschule" },
    ];
    expect(cleanSavedProviders(raw).map((p) => p.name)).toEqual(["Theater", "Familientreff", "Musikschule"]);
  });
});

describe("toggleProvider (Plan 0025, E1)", () => {
  const theater = { id: "theater-beispiel", name: "Theater" };
  const treff = { id: "familientreff-beispiel", name: "Familientreff" };

  it("hängt einen neuen Anbieter an", () => {
    expect(toggleProvider([theater], treff)).toEqual([theater, treff]);
  });

  it("entfernt per ID, auch wenn der Name inzwischen anders lautet", () => {
    expect(toggleProvider([theater, treff], { id: "theater-beispiel", name: "Neuer Name" })).toEqual([treff]);
  });

  it("erneut gemerkt trägt den aktuellen Namen", () => {
    const removed = toggleProvider([theater], theater);
    expect(toggleProvider(removed, { id: "theater-beispiel", name: "Theater (neu)" })).toEqual([
      { id: "theater-beispiel", name: "Theater (neu)" },
    ]);
  });
});

describe("savedProviderRows (Plan 0025, E1)", () => {
  const offers = fixtureSiteOffers();

  it("nimmt den Namen aus dem aktuellen Datenstand, zählt kommende Angebote, nennt den nächsten Termin", () => {
    // Familientreff: PEKiP (13.10.), Krabbeltreff (7.10.), Babymassage (17.10.); das Elterncafé ist heute vorbei
    const [row] = savedProviderRows([{ id: "familientreff-beispiel", name: "Alter Name" }], offers, FIXTURE_NOW);
    expect(row?.name).toBe("Familientreff Beispielhof (fiktiv)");
    expect(row?.upcoming).toBe(3);
    expect(row?.next?.start).toBe("2026-10-07T10:00:00+02:00");
  });

  it("ohne kommende Angebote gilt der Schnappschuss, ohne nächsten Termin", () => {
    const rows = savedProviderRows([{ id: "turnverein-beispiel", name: "Turnverein (gemerkt)" }], offers, FIXTURE_NOW);
    expect(rows).toEqual([{ id: "turnverein-beispiel", name: "Turnverein (gemerkt)", upcoming: 0 }]);
  });

  it("vergangene Angebote zählen nicht", () => {
    // 5.11.: Krabbeltreff (bis 4.11.) und Babymassage (17.10.) sind vorbei, PEKiP läuft bis 1.12.
    const later = new Date("2026-11-05T12:00:00+01:00");
    const [row] = savedProviderRows([{ id: "familientreff-beispiel", name: "x" }], offers, later);
    expect(row?.upcoming).toBe(1);
    expect(row?.next?.start).toBe("2026-11-10T09:30:00+01:00");
  });

  it("sortiert nach Name (de)", () => {
    const list = [
      { id: "zwerge", name: "Zwergenwiese" },
      { id: "aehren", name: "Ährenfeld" },
      { id: "baeren", name: "Bärenhöhle" },
    ];
    expect(savedProviderRows(list, offers, FIXTURE_NOW).map((r) => r.name)).toEqual([
      "Ährenfeld",
      "Bärenhöhle",
      "Zwergenwiese",
    ]);
  });
});
