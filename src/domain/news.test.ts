import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, type FilterState } from "./filter.ts";
import { newOfferIds, offersInWeek, type WeeklyInput, weeklyText } from "./news.ts";
import { placeKey } from "./place-key.ts";
import type { ReachFn } from "./reach.ts";
import type { SiteOffer } from "./site-data.ts";
import { FIXTURE_NOW, type FixtureKey, fixtureKey, fixtureSiteOffers } from "./test-fixtures.ts";

const offers = fixtureSiteOffers();
const byKey = (key: FixtureKey): SiteOffer => {
  const offer = offers.find((o) => fixtureKey(o) === key);
  if (!offer) throw new Error(`Fixture-Angebot ${key} fehlt`);
  return offer;
};
const keys = (list: readonly SiteOffer[]) => list.map(fixtureKey);

/** Am Fixture-Jetzt (5.10.2026) genau 14 Monate alt. */
const BIRTH_14 = "2025-08-05";

const search = (state: Partial<FilterState>): FilterState => ({ ...EMPTY_FILTER, ...state });
const MUSIK = search({ categories: ["musik"] });
const BUEHNE = search({ categories: ["buehne"] });
const BABYKURSE = search({ categories: ["babykurse"] });
const MUSIK_20 = search({ categories: ["musik"], reachLimit: { kind: "minuten", value: 20 } });

/** Wegzeit wie in filter.test.ts: Bibliothek 15,6 Min., Musikschule 29,6 Min. */
const MINUTES: Record<string, number> = {
  "theater-beispiel-buehne": 3.6,
  "familientreff-beispiel-haus": 13.6,
  "stadtbibliothek-beispiel-zentrum": 15.6,
  "musikschule-beispiel-sued": 29.6,
  "gemeinde-beispiel-gemeindehaus": 32.6,
};
const byPlace = new Map(offers.map((o) => [placeKey(o.venue.geo), MINUTES[o.venueId] ?? Number.NaN]));
const wegzeit: ReachFn = ({ geo }) => ({
  kind: "oepnv",
  minutes: byPlace.get(placeKey(geo)) ?? Number.NaN,
  byFoot: false,
});

/** Diese Woche ab dem Fixture-Jetzt: Krabbeltreff (7.10.) und Krabbelreime (9.10.). */
const WEEK = offersInWeek(offers, FIXTURE_NOW);

const text = (input: Partial<WeeklyInput<SiteOffer>>) =>
  weeklyText({ fresh: [], week: WEEK, searches: [], now: FIXTURE_NOW, ...input });

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

describe("offersInWeek", () => {
  it("nimmt Angebote mit einem Termin in den nächsten 7 × 24 Stunden, in Datenreihenfolge", () => {
    expect(keys(WEEK)).toEqual(["krabbeltreff", "krabbelreime"]);
  });

  it("zählt einen Termin, der genau jetzt beginnt", () => {
    expect(keys(offersInWeek([byKey("babymassage-workshop")], new Date("2026-10-17T10:00:00+02:00")))).toEqual([
      "babymassage-workshop",
    ]);
  });

  it("zählt einen laufenden Termin nicht (Beginn vor jetzt)", () => {
    expect(offersInWeek([byKey("babymassage-workshop")], new Date("2026-10-17T10:30:00+02:00"))).toEqual([]);
  });

  it("zählt einen Termin genau 7 × 24 Stunden später nicht mehr, eine Sekunde früher schon", () => {
    // Krabbelreime am 9.10. um 10:30
    const krabbelreime = [byKey("krabbelreime")];
    expect(offersInWeek(krabbelreime, new Date("2026-10-02T10:30:00+02:00"))).toEqual([]);
    expect(keys(offersInWeek(krabbelreime, new Date("2026-10-02T10:30:01+02:00")))).toEqual(["krabbelreime"]);
  });
});

describe("weeklyText – neue Treffer", () => {
  it("mit Abos: zählt die neuen, die zu einem Abo und zum Alter passen", () => {
    const fresh = [byKey("krabbeltreff"), byKey("musikgarten-1"), byKey("krabbelreime"), byKey("babykonzert-advent")];
    expect(text({ fresh, searches: [MUSIK], birthDate: BIRTH_14 })).toEqual({
      title: "3 neue Angebote für deine Suchen",
      body: "Musikgarten 1 (1–2 Jahre), Krabbelreime & Fingerspiele und 1 weiteres",
      hits: [byKey("musikgarten-1").id, byKey("krabbelreime").id, byKey("babykonzert-advent").id],
    });
  });

  it("mit Abos: ein Abo genügt (ODER)", () => {
    const fresh = [byKey("pekip-herbst"), byKey("kuckuck-im-nest"), byKey("krabbeltreff")];
    expect(text({ fresh, searches: [BUEHNE, BABYKURSE] })).toEqual({
      title: "2 neue Angebote für deine Suchen",
      body: "PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026) und „Kuckuck im Nest“ – Theater ab 18 Monaten",
      hits: [byKey("pekip-herbst").id, byKey("kuckuck-im-nest").id],
    });
  });

  it("mit Abos: Singular", () => {
    expect(text({ fresh: [byKey("krabbelreime")], searches: [MUSIK] })).toMatchObject({
      title: "1 neues Angebot für deine Suchen",
      body: "Krabbelreime & Fingerspiele",
    });
  });

  it("nur Alter: zählt die passenden, die ersten zwei mit Titel", () => {
    const fresh = [byKey("pekip-herbst"), byKey("krabbeltreff"), byKey("musikgarten-1"), byKey("krabbelreime")];
    expect(text({ fresh, birthDate: BIRTH_14 })).toEqual({
      title: "3 neue Angebote passen zu 14 Monaten",
      body: "Offener Krabbeltreff, Musikgarten 1 (1–2 Jahre) und 1 weiteres",
      hits: [byKey("krabbeltreff").id, byKey("musikgarten-1").id, byKey("krabbelreime").id],
    });
  });

  it("nur Alter: Rest im Plural, Singular im Titel", () => {
    const fresh = [byKey("krabbeltreff"), byKey("musikgarten-1"), byKey("krabbelreime"), byKey("babykonzert-advent")];
    expect(text({ fresh, birthDate: BIRTH_14 }).body).toBe(
      "Offener Krabbeltreff, Musikgarten 1 (1–2 Jahre) und 2 weitere",
    );
    expect(text({ fresh: [byKey("pekip-herbst"), byKey("krabbeltreff")], birthDate: BIRTH_14 })).toMatchObject({
      title: "1 neues Angebot passt zu 14 Monaten",
      body: "Offener Krabbeltreff",
    });
  });

  it("weder Abos noch Alter: zählt alle neuen", () => {
    expect(text({ fresh: [byKey("pekip-herbst"), byKey("krabbeltreff")] })).toEqual({
      title: "2 neue Angebote im Zwergenplan",
      body: "PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026) und Offener Krabbeltreff",
      hits: [byKey("pekip-herbst").id, byKey("krabbeltreff").id],
    });
    expect(text({ fresh: [byKey("krabbeltreff")] }).title).toBe("1 neues Angebot im Zwergenplan");
  });

  it("Abo mit Wegzeit wirkt nur mit Wegzeit, dann fällt die Musikschule (29,6 Min.) heraus", () => {
    const fresh = [byKey("musikgarten-1"), byKey("krabbelreime")];
    expect(text({ fresh, searches: [MUSIK_20] }).hits).toEqual([byKey("musikgarten-1").id, byKey("krabbelreime").id]);
    expect(text({ fresh, searches: [MUSIK_20], reach: wegzeit }).hits).toEqual([byKey("krabbelreime").id]);
  });

  it("vor der Geburt: das Alter zählt nicht, die Abos schon", () => {
    const fresh = [byKey("musikgarten-1"), byKey("krabbelreime"), byKey("pekip-herbst")];
    expect(text({ fresh, searches: [MUSIK], birthDate: "2026-12-01" }).title).toBe("2 neue Angebote für deine Suchen");
    expect(text({ fresh, birthDate: "2026-12-01" }).title).toBe("3 neue Angebote im Zwergenplan");
  });

  it("prüft das Alter wie die Liste: Kurse zum ersten Termin, inklusive Grenze", () => {
    // Musikgarten ab 12 Monaten, erster Termin 5.11.2026.
    const fresh = [byKey("musikgarten-1")];
    expect(text({ fresh, birthDate: "2025-11-05" }).title).toBe("1 neues Angebot passt zu 11 Monaten");
    expect(text({ fresh, birthDate: "2025-11-06", week: [] }).title).toBe("Diese Woche nichts Neues für 10 Monate");
  });

  it("nimmt das Alter am Berliner Kalendertag, auch wenn UTC noch am Vortag ist", () => {
    // 22:30 UTC am 5.10. = 00:30 am 6.10. in Berlin → am 6.10. geborene Kinder sind dann 14 Monate.
    const lateNight = new Date("2026-10-05T22:30:00Z");
    expect(text({ fresh: [byKey("krabbelreime")], birthDate: "2025-08-06", now: lateNight }).title).toBe(
      "1 neues Angebot passt zu 14 Monaten",
    );
  });

  it("nennt das Alter wie der Kind-Chip: unter 2 Jahren in Monaten, danach in Jahren", () => {
    const fresh = [byKey("krabbelreime")];
    expect(text({ fresh, birthDate: "2026-09-01" }).title).toBe("1 neues Angebot passt zu 1 Monat");
    expect(text({ fresh, birthDate: "2026-09-20" }).title).toBe("1 neues Angebot passt zu 0 Monaten");
    expect(text({ fresh, birthDate: "2024-09-01" }).title).toBe("1 neues Angebot passt zu 2 Jahren");
  });
});

describe("weeklyText – nichts Neues", () => {
  it("mit Abos: zählt passende Angebote der nächsten 7 Tage", () => {
    expect(text({ fresh: [byKey("krabbeltreff")], searches: [MUSIK] })).toEqual({
      title: "Diese Woche nichts Neues für deine Suchen",
      body: "1 passendes Angebot in den nächsten 7 Tagen.",
      hits: [],
    });
    expect(text({ searches: [MUSIK, search({ categories: ["krabbel-spielgruppen"] })] }).body).toBe(
      "2 passende Angebote in den nächsten 7 Tagen.",
    );
    expect(text({ searches: [BUEHNE] }).body).toBe("In den nächsten 7 Tagen nichts Passendes.");
  });

  it("nur Alter: nennt das Alter im Akkusativ", () => {
    expect(text({ fresh: [byKey("pekip-herbst")], birthDate: BIRTH_14 })).toEqual({
      title: "Diese Woche nichts Neues für 14 Monate",
      body: "2 passende Angebote in den nächsten 7 Tagen.",
      hits: [],
    });
    expect(text({ birthDate: "2026-09-01" }).title).toBe("Diese Woche nichts Neues für 1 Monat");
    expect(text({ birthDate: "2024-09-01" }).title).toBe("Diese Woche nichts Neues für 2 Jahre");
    // 25 Monate: Krabbeltreff (bis 24) passt nicht mehr, Krabbelreime (bis 36) schon.
    expect(text({ birthDate: "2024-09-01" }).body).toBe("1 passendes Angebot in den nächsten 7 Tagen.");
  });

  it("weder Abos noch Alter: zählt alle Angebote der nächsten 7 Tage", () => {
    expect(text({})).toEqual({
      title: "Diese Woche nichts Neues",
      body: "2 Angebote in den nächsten 7 Tagen.",
      hits: [],
    });
    expect(text({ week: [byKey("krabbeltreff")] }).body).toBe("1 Angebot in den nächsten 7 Tagen.");
    expect(text({ week: [] }).body).toBe("In den nächsten 7 Tagen keine Angebote.");
  });

  it("Abo mit Wegzeit zählt auch die Woche nur innerhalb der Grenze", () => {
    const week = [byKey("krabbelreime"), byKey("musikgarten-1")];
    expect(text({ week, searches: [MUSIK_20] }).body).toBe("2 passende Angebote in den nächsten 7 Tagen.");
    expect(text({ week, searches: [MUSIK_20], reach: wegzeit }).body).toBe(
      "1 passendes Angebot in den nächsten 7 Tagen.",
    );
  });
});
