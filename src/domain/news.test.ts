import { describe, expect, it } from "vitest";
import { newOfferIds, newsText } from "./news.ts";
import type { SiteOffer } from "./site-data.ts";
import { FIXTURE_NOW, type FixtureKey, fixtureKey, fixtureSiteOffers } from "./test-fixtures.ts";

const offers = fixtureSiteOffers();
const byKey = (key: FixtureKey): SiteOffer => {
  const offer = offers.find((o) => fixtureKey(o) === key);
  if (!offer) throw new Error(`Fixture-Angebot ${key} fehlt`);
  return offer;
};

/** Am Fixture-Jetzt (5.10.2026) genau 14 Monate alt. */
const BIRTH_14 = "2025-08-05";

describe("newOfferIds", () => {
  it("liefert alle kommenden Angebote, die vorher unbekannt waren, in der Reihenfolge der Daten", () => {
    const ids = newOfferIds([], offers, FIXTURE_NOW);
    expect(ids).toEqual(offers.filter((o) => fixtureKey(o) !== "vergangen").map((o) => o.id));
  });

  it("lässt bekannte Angebote weg", () => {
    const known = [byKey("krabbeltreff").id, byKey("pekip-herbst").id];
    const ids = newOfferIds(known, offers, FIXTURE_NOW);
    expect(ids).not.toContain(byKey("krabbeltreff").id);
    expect(ids).not.toContain(byKey("pekip-herbst").id);
    expect(ids).toContain(byKey("musikgarten-1").id);
  });

  it("zählt beendete Angebote nicht als neu (dieselbe Regel wie die Liste)", () => {
    // Elterncafé endet am 5.10. um 10:00, das Fixture-Jetzt ist 12:00.
    expect(newOfferIds([], [byKey("vergangen")], FIXTURE_NOW)).toEqual([]);
    expect(newOfferIds([], [byKey("vergangen")], new Date("2026-10-05T09:30:00+02:00"))).toEqual([
      byKey("vergangen").id,
    ]);
  });

  it("liefert nichts, wenn alles bekannt ist", () => {
    expect(
      newOfferIds(
        offers.map((o) => o.id),
        offers,
        FIXTURE_NOW,
      ),
    ).toEqual([]);
  });
});

describe("newsText", () => {
  it("bleibt ohne Geburtsdatum beim allgemeinen Text", () => {
    expect(newsText({ fresh: [byKey("krabbeltreff")], now: FIXTURE_NOW })).toBeUndefined();
  });

  it("bleibt ohne neue Angebote beim allgemeinen Text (App zwischen Deploy und Push geöffnet)", () => {
    expect(newsText({ fresh: [], birthDate: BIRTH_14, now: FIXTURE_NOW })).toBeUndefined();
  });

  it("bleibt vor der Geburt beim allgemeinen Text", () => {
    expect(newsText({ fresh: [byKey("krabbeltreff")], birthDate: "2026-12-01", now: FIXTURE_NOW })).toBeUndefined();
  });

  it("nennt die passenden Angebote, die ersten zwei mit Titel", () => {
    const fresh = [byKey("pekip-herbst"), byKey("krabbeltreff"), byKey("musikgarten-1"), byKey("krabbelreime")];
    expect(newsText({ fresh, birthDate: BIRTH_14, now: FIXTURE_NOW })).toEqual({
      title: "3 neue Angebote passen zu 14 Monaten",
      body: "Offener Krabbeltreff, Musikgarten 1 (1–2 Jahre) und 1 weiteres",
      badge: 3,
    });
  });

  it("zählt den Rest im Plural", () => {
    const fresh = [byKey("krabbeltreff"), byKey("musikgarten-1"), byKey("krabbelreime"), byKey("babykonzert-advent")];
    expect(newsText({ fresh, birthDate: BIRTH_14, now: FIXTURE_NOW })?.body).toBe(
      "Offener Krabbeltreff, Musikgarten 1 (1–2 Jahre) und 2 weitere",
    );
  });

  it("verbindet zwei Titel mit „und“", () => {
    const fresh = [byKey("krabbeltreff"), byKey("krabbelreime")];
    expect(newsText({ fresh, birthDate: BIRTH_14, now: FIXTURE_NOW })).toEqual({
      title: "2 neue Angebote passen zu 14 Monaten",
      body: "Offener Krabbeltreff und Krabbelreime & Fingerspiele",
      badge: 2,
    });
  });

  it("spricht ein einzelnes passendes Angebot im Singular an", () => {
    const fresh = [byKey("pekip-herbst"), byKey("krabbeltreff")];
    expect(newsText({ fresh, birthDate: BIRTH_14, now: FIXTURE_NOW })).toEqual({
      title: "1 neues Angebot passt zu 14 Monaten",
      body: "Offener Krabbeltreff",
      badge: 1,
    });
  });

  it("sagt ehrlich, wenn keins passt, und zählt dann alle neuen", () => {
    const fresh = [byKey("pekip-herbst"), byKey("babymassage-workshop")];
    expect(newsText({ fresh, birthDate: BIRTH_14, now: FIXTURE_NOW })).toEqual({
      title: "2 neue Angebote, gerade keins für 14 Monate",
      body: "PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026) und Babymassage – Schnupper-Workshop",
      badge: 2,
    });
    expect(newsText({ fresh: [byKey("pekip-herbst")], birthDate: BIRTH_14, now: FIXTURE_NOW })?.title).toBe(
      "1 neues Angebot, passt gerade nicht zu 14 Monaten",
    );
  });

  it("nimmt das Alter am Berliner Kalendertag, auch wenn UTC noch am Vortag ist", () => {
    // 22:30 UTC am 5.10. = 00:30 am 6.10. in Berlin → am 6.10. geborene Kinder sind dann 14 Monate.
    const lateNight = new Date("2026-10-05T22:30:00Z");
    const text = newsText({ fresh: [byKey("krabbelreime")], birthDate: "2025-08-06", now: lateNight });
    expect(text?.title).toBe("1 neues Angebot passt zu 14 Monaten");
  });

  it("prüft das Alter wie die Liste: Kurse zum ersten Termin, inklusive Grenze", () => {
    // Musikgarten ab 12 Monaten, erster Termin 5.11.2026.
    const exactly12 = newsText({ fresh: [byKey("musikgarten-1")], birthDate: "2025-11-05", now: FIXTURE_NOW });
    expect(exactly12?.badge).toBe(1);
    expect(exactly12?.title).toBe("1 neues Angebot passt zu 11 Monaten");
    const oneDayShort = newsText({ fresh: [byKey("musikgarten-1")], birthDate: "2025-11-06", now: FIXTURE_NOW });
    expect(oneDayShort?.title).toBe("1 neues Angebot, passt gerade nicht zu 10 Monaten");
  });

  it("nennt das Alter wie der Kind-Chip: unter 2 Jahren in Monaten, danach in Jahren", () => {
    const fresh = [byKey("krabbelreime")];
    expect(newsText({ fresh, birthDate: "2026-09-01", now: FIXTURE_NOW })?.title).toBe(
      "1 neues Angebot passt zu 1 Monat",
    );
    expect(newsText({ fresh, birthDate: "2026-09-20", now: FIXTURE_NOW })?.title).toBe(
      "1 neues Angebot passt zu 0 Monaten",
    );
    expect(newsText({ fresh, birthDate: "2024-09-01", now: FIXTURE_NOW })?.title).toBe(
      "1 neues Angebot passt zu 2 Jahren",
    );
  });
});
