import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, type FilterState } from "./filter.ts";
import { offerKey } from "./ids.ts";
import { listingWeek } from "./listing.ts";
import { newOfferIds, offersInWeek, type WeeklyInput, weeklyText } from "./news.ts";
import { placeKey } from "./place-key.ts";
import type { ReachFn } from "./reach.ts";
import type { SiteOffer } from "./site-data.ts";
import { FIXTURE_NOW, type FixtureKey, fixtureKey, fixtureSiteOffers, loadFixtures } from "./test-fixtures.ts";

const offers = fixtureSiteOffers();
const byKey = (key: FixtureKey): SiteOffer => {
  const offer = offers.find((o) => fixtureKey(o) === key);
  if (!offer) throw new Error(`Fixture-Angebot ${key} fehlt`);
  return offer;
};
const keys = (list: readonly SiteOffer[]) => list.map(fixtureKey);
/** Der Bestand vor Plan 0043: ohne `listedAt`, dort entscheiden die gesehenen IDs */
const unlisted = offers.map(({ listedAt: _, ...o }) => o);

/** Am Fixture-Jetzt (5.10.2026) genau 14 Monate alt. */
const BIRTH_14 = "2025-08-05";

const search = (state: Partial<FilterState>): FilterState => ({ ...EMPTY_FILTER, ...state });
const MUSIK = search({ categories: ["musik"] });
const BUEHNE = search({ categories: ["buehne"] });
const BABYKURSE = search({ categories: ["babykurse"] });
/** Krabbelreime ist seit Plan 0037 `buecher`, nicht mehr `musik`: Musik und Bücher zusammen treffen beide Fixtures. */
const MUSIK_BUECHER = search({ categories: ["musik", "buecher"] });
const MUSIK_20 = search({ categories: ["musik", "buecher"], reachLimit: { kind: "minuten", value: 20 } });

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

describe("newOfferIds ohne listedAt: gesehene IDs (Bestand vor Plan 0043)", () => {
  it("liefert alle kommenden Angebote, die vorher unbekannt waren, in der Reihenfolge der Daten", () => {
    const ids = newOfferIds([], unlisted, FIXTURE_NOW);
    expect(ids).toEqual(unlisted.filter((o) => fixtureKey(o) !== "vergangen").map((o) => o.id));
  });

  it("kennt Angebote auch unter ihrer alten langen ID (ADR 0022)", () => {
    // der Stand vor dem Umstieg: alte IDs aus Katalog-ID, Titel, Ort und erstem Termin
    const legacy = loadFixtures().file.offers.map((o) => offerKey({ ...o, firstStart: o.sessions[0]?.start ?? "" }));
    expect(legacy.every((id) => id.includes("--"))).toBe(true);
    expect(newOfferIds(legacy, unlisted, FIXTURE_NOW)).toEqual([]);
  });

  it("lässt bekannte Angebote weg", () => {
    const known = [byKey("krabbeltreff").id, byKey("pekip-herbst").id];
    const ids = newOfferIds(known, unlisted, FIXTURE_NOW);
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
        unlisted,
        FIXTURE_NOW,
      ),
    ).toEqual([]);
  });
});

describe("newOfferIds mit listedAt: eingestellt in dieser Woche (Plan 0043, E3)", () => {
  const all = offers.map((o) => o.id);

  it("Fixtures: Musikgarten (5.10.) und Krabbelreime (2.10.) sind neu, auch wenn das Gerät sie kennt", () => {
    expect(keys(offers.filter((o) => newOfferIds(all, offers, FIXTURE_NOW).includes(o.id))).sort()).toEqual([
      "krabbelreime",
      "musikgarten-1",
    ]);
  });

  it("Kernfall: vor 7 bis 13 Tagen eingestellt und nicht in den gesehenen IDs ist nicht neu (Review 4, K1)", () => {
    expect(listingWeek(byKey("krabbeltreff"), FIXTURE_NOW)).toBe("vorige-woche");
    expect(newOfferIds([], [byKey("krabbeltreff")], FIXTURE_NOW)).toEqual([]);
  });

  it("ein neu eingestellter, schon laufender Kurs ist nicht neu (Plan 0053, E1)", () => {
    const pekip = { ...byKey("pekip-herbst"), listedAt: "2026-10-19T06:00:00+02:00" };
    expect(newOfferIds([], [pekip], new Date("2026-10-20T12:00:00+02:00"))).toEqual([]);
    expect(
      newOfferIds([], [{ ...pekip, listedAt: "2026-10-09T06:00:00+02:00" }], new Date("2026-10-10T12:00:00+02:00")),
    ).toEqual([pekip.id]);
  });

  it("Wochengrenze: Tag 6 neu, Tag 7 nicht; listedAt nach jetzt neu", () => {
    const listed = (listedAt: string) => newOfferIds([], [{ ...byKey("krabbelreime"), listedAt }], FIXTURE_NOW);
    expect(listed("2026-09-29T00:00:00+02:00")).toHaveLength(1);
    expect(listed("2026-09-28T23:59:00+02:00")).toEqual([]);
    expect(listed("2026-10-06T05:00:00+02:00")).toHaveLength(1);
  });

  it("ein neuer Durchgang unter alter ID ist neu, obwohl er in den gesehenen IDs steht", () => {
    const run = { ...byKey("krabbeltreff"), listedAt: "2026-10-04T05:00:00+02:00" };
    expect(newOfferIds([run.id], [run], FIXTURE_NOW)).toEqual([run.id]);
  });

  it("beendete Angebote sind nicht neu", () => {
    expect(newOfferIds([], [{ ...byKey("vergangen"), listedAt: "2026-10-05T05:00:00+02:00" }], FIXTURE_NOW)).toEqual(
      [],
    );
  });

  it("ohne gesehene IDs zählen nur Angebote mit listedAt", () => {
    expect(keys(offers.filter((o) => newOfferIds(undefined, offers, FIXTURE_NOW).includes(o.id))).sort()).toEqual([
      "krabbelreime",
      "musikgarten-1",
    ]);
    expect(newOfferIds(undefined, unlisted, FIXTURE_NOW)).toEqual([]);
  });

  it("jeder Treffer mit listedAt steht in „Neu diese Woche“", () => {
    const fresh = offers.filter((o) => newOfferIds([], offers, FIXTURE_NOW).includes(o.id));
    const { hits } = text({ fresh });
    for (const id of hits) {
      const hit = offers.find((o) => o.id === id);
      if (hit?.listedAt !== undefined) expect(listingWeek(hit, FIXTURE_NOW)).toBe("diese-woche");
    }
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe("offersInWeek", () => {
  it("nimmt Angebote mit einem Termin in den nächsten 7 × 24 Stunden, in Datenreihenfolge", () => {
    expect(keys(WEEK)).toEqual(["krabbeltreff", "krabbelreime"]);
  });

  it("zählt einen laufenden Kurs nicht, einen beginnenden schon (Plan 0053, E1)", () => {
    const pekip = [byKey("pekip-herbst")]; // Beginn 13.10., wöchentlich
    expect(keys(offersInWeek(pekip, new Date("2026-10-10T12:00:00+02:00")))).toEqual(["pekip-herbst"]);
    expect(offersInWeek(pekip, new Date("2026-10-20T12:00:00+02:00"))).toEqual([]);
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
    expect(text({ fresh, searches: [MUSIK_BUECHER, BUEHNE], birthDate: BIRTH_14 })).toEqual({
      title: "3 neue Angebote für deine Abos",
      body: "Musikgarten 1 (1–2 Jahre), Krabbelreime & Fingerspiele und 1 weiteres",
      hits: [byKey("musikgarten-1").id, byKey("krabbelreime").id, byKey("babykonzert-advent").id],
    });
  });

  it("ein Abo kat=musik trifft nur die Hauptkategorie, das Babykonzert (buehne) nicht (Plan 0037, E9)", () => {
    const fresh = [byKey("musikgarten-1"), byKey("babykonzert-advent")];
    expect(text({ fresh, searches: [MUSIK] }).hits).toEqual([byKey("musikgarten-1").id]);
  });

  it("mit Abos: ein Abo genügt (ODER)", () => {
    const fresh = [byKey("pekip-herbst"), byKey("kuckuck-im-nest"), byKey("krabbeltreff")];
    expect(text({ fresh, searches: [BUEHNE, BABYKURSE] })).toEqual({
      title: "2 neue Angebote für deine Abos",
      body: "PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026) und „Kuckuck im Nest“ – Theater ab 18 Monaten",
      hits: [byKey("pekip-herbst").id, byKey("kuckuck-im-nest").id],
    });
  });

  it("mit Abos: Singular", () => {
    expect(text({ fresh: [byKey("krabbelreime")], searches: [MUSIK_BUECHER] })).toMatchObject({
      title: "1 neues Angebot für deine Abos",
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
    expect(text({ fresh, searches: [MUSIK_BUECHER], birthDate: "2026-12-01" }).title).toBe(
      "2 neue Angebote für deine Abos",
    );
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

describe("weeklyText – der Beginn passt (Plan 0043, E2)", () => {
  /** Turnzwerge-Fall: regelmäßig 12–36 Monate, bis in den nächsten Sommer; das Kind ist 8 Monate */
  const BIRTH_8 = "2026-02-05";
  const mondays = Array.from({ length: 40 }, (_, i) => {
    const start = new Date(Date.UTC(2026, 9, 5 + 7 * i, 14, 0));
    return { start: start.toISOString(), end: new Date(start.getTime() + 3_600_000).toISOString() };
  });
  const turnzwerge: SiteOffer = {
    ...byKey("krabbeltreff"),
    title: "Turnzwerge (1–3 Jahre)",
    age: { minMonths: 12, maxMonths: 36 },
    sessions: mondays,
  };

  it("nennt ein regelmäßiges Angebot nicht, das erst ab einem späteren Termin passt", () => {
    expect(text({ fresh: [turnzwerge], birthDate: BIRTH_8, week: [] }).hits).toEqual([]);
    // ab 12 Monaten passt der nächste Termin, auch Monate entfernt
    expect(text({ fresh: [turnzwerge], birthDate: "2025-10-05", week: [] }).hits).toEqual([turnzwerge.id]);
  });

  it("die Wochenzahl zählt ein regelmäßiges Angebot nur mit passendem Termin in den 7 Tagen", () => {
    expect(text({ birthDate: BIRTH_8, week: [turnzwerge] }).body).toBe("In den nächsten 7 Tagen nichts Passendes.");
    expect(text({ birthDate: "2025-10-05", week: [turnzwerge] }).body).toBe(
      "1 passendes Angebot in den nächsten 7 Tagen.",
    );
    // Der nächste Termin passt, aber in den 7 Tagen liegt kein Termin, der passt
    const later = { ...turnzwerge, sessions: mondays.slice(4) };
    expect(text({ birthDate: "2025-10-05", week: [later] }).body).toBe("In den nächsten 7 Tagen nichts Passendes.");
  });

  it("vor der Geburt zählt die Woche ohne Alter, auch regelmäßige Angebote", () => {
    expect(text({ birthDate: "2026-12-01", week: [turnzwerge] }).body).toBe("1 Angebot in den nächsten 7 Tagen.");
  });
});

describe("weeklyText – nichts Neues", () => {
  it("mit Abos: zählt passende Angebote der nächsten 7 Tage", () => {
    expect(text({ fresh: [byKey("krabbeltreff")], searches: [MUSIK_BUECHER] })).toEqual({
      title: "Diese Woche nichts Neues für deine Abos",
      body: "1 passendes Angebot in den nächsten 7 Tagen.",
      hits: [],
    });
    expect(text({ searches: [MUSIK_BUECHER, search({ categories: ["krabbel-spielgruppen"] })] }).body).toBe(
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

describe("weeklyText – Anbieter-Abos (Plan 0054, E2)", () => {
  const provider = (key: FixtureKey) => byKey(key).providerId;

  it("nur Anbieter-Abo: zählt nur neue Angebote dieser Anbieter, der Titel nennt die Anbieter", () => {
    const fresh = [byKey("krabbeltreff"), byKey("musikgarten-1"), byKey("krabbelreime")];
    const result = text({ fresh, providers: [provider("musikgarten-1")] });
    expect(result).toEqual({
      title: "1 neues Angebot von deinen Anbietern",
      body: "Musikgarten 1 (1–2 Jahre)",
      hits: [byKey("musikgarten-1").id],
    });
  });

  it("gemischt: Anbieter-Treffer zuerst, Titel „für deine Abos“", () => {
    expect(provider("krabbelreime")).not.toBe(provider("musikgarten-1"));
    const fresh = [byKey("krabbelreime"), byKey("musikgarten-1")];
    const result = text({
      fresh,
      searches: [search({ categories: ["buecher"] })],
      providers: [provider("musikgarten-1")],
    });
    expect(result).toEqual({
      title: "2 neue Angebote für deine Abos",
      body: "Musikgarten 1 (1–2 Jahre) und Krabbelreime & Fingerspiele",
      hits: [byKey("musikgarten-1").id, byKey("krabbelreime").id],
    });
  });

  it("ein Treffer von Anbieter und Suche zugleich zählt als Anbieter-Treffer", () => {
    const result = text({ fresh: [byKey("musikgarten-1")], searches: [MUSIK], providers: [provider("musikgarten-1")] });
    expect(result.title).toBe("1 neues Angebot von deinen Anbietern");
  });

  it("ein Angebot des Anbieters, das nicht zum Alter passt, ist kein Treffer", () => {
    // PEKiP für Babys geb. Juni–Aug. 2026: nichts für 14 Monate
    const result = text({ fresh: [byKey("pekip-herbst")], providers: [provider("pekip-herbst")], birthDate: BIRTH_14 });
    expect(result.hits).toEqual([]);
    expect(result.title).toBe("Diese Woche nichts Neues für deine Abos");
  });

  it("ohne neue Treffer zählt die Woche nach denselben Abos", () => {
    // Krabbelreime gehört zur Bibliothek, nicht zum Familientreff
    expect(provider("krabbelreime")).not.toBe(provider("krabbeltreff"));
    const week = [byKey("krabbeltreff"), byKey("krabbelreime")];
    expect(text({ week, providers: [provider("krabbeltreff")] })).toEqual({
      title: "Diese Woche nichts Neues für deine Abos",
      body: "1 passendes Angebot in den nächsten 7 Tagen.",
      hits: [],
    });
  });

  it("ein unbekannter Anbieter ist ein Abo, das nichts trifft", () => {
    expect(text({ fresh: [byKey("krabbelreime")], providers: ["unbekannt"] }).hits).toEqual([]);
  });
});
