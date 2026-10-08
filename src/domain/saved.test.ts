import { describe, expect, it } from "vitest";
import { offerFitsAge } from "./age.ts";
import { upcomingSessions } from "./agenda.ts";
import {
  applySavedFilter,
  cleanSavedProviders,
  collectionExport,
  EMPTY_SAVED_FILTER,
  exportSessions,
  isSavedFilterChipOn,
  matchesSavedFilter,
  type SavedFilter,
  savedFilterCount,
  savedOffers,
  seriesExport,
  toggleId,
  toggleSavedFilter,
  upcomingSessionCount,
} from "./saved.ts";
import type { Offer } from "./schema.ts";
import {
  FIXTURE_NOW,
  type FixtureKey,
  fixtureKey,
  fixtureOffer,
  fixtureSiteOffers,
  loadFixtures,
} from "./test-fixtures.ts";
import { addDays, berlinIsoDate, fromBerlinLocal } from "./time.ts";

const { file } = loadFixtures();
const id = (key: Parameters<typeof fixtureOffer>[0]) => fixtureOffer(key).id;
const days = (offer: Pick<Offer, "sessions">) => offer.sessions.map((s) => berlinIsoDate(s.start));

/** Termin um 8:30 Berliner Zeit: In Los Angeles ist dann noch der Vortag. */
const session = (day: string) => ({ start: fromBerlinLocal(`${day}T08:30`), end: fromBerlinLocal(`${day}T09:30`) });
const weeklySessions = (firstDay: string, count: number) =>
  Array.from({ length: count }, (_, i) => session(addDays(firstDay, 7 * i)));

describe("toggleId", () => {
  it("merkt und entfernt", () => {
    expect(toggleId([], "a")).toEqual(["a"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("savedOffers", () => {
  const savedKey = ({ offer }: { offer: Offer }) => fixtureKey(offer);

  it("liefert gemerkte, noch nicht vorbei-e Angebote nach nächstem Termin", () => {
    const ids = [id("babykonzert-advent"), id("vergangen"), id("krabbeltreff"), "gibt-es--nicht--mehr"];
    expect(savedOffers(file.offers, ids, FIXTURE_NOW, undefined).map(savedKey)).toEqual([
      "krabbeltreff",
      "babykonzert-advent",
    ]);
  });

  it("sortiert laufende Kurse nach dem nächsten, nicht dem ersten Termin", () => {
    const later = new Date("2026-11-11T12:00:00+01:00"); // PEKiP läuft, nächster Termin 17.11.
    const ids = [id("pekip-herbst"), id("kuckuck-im-nest")];
    expect(savedOffers(file.offers, ids, later, undefined).map(savedKey)).toEqual(["kuckuck-im-nest", "pekip-herbst"]);
  });

  it("sortiert regelmäßige mit Geburtsdatum nach dem ersten passenden Termin (Plan 0028)", () => {
    const ids = [id("krabbeltreff"), id("pekip-herbst")]; // Treff ab 7.10., PEKiP ab 13.10.
    expect(savedOffers(file.offers, ids, FIXTURE_NOW, undefined).map(savedKey)).toEqual([
      "krabbeltreff",
      "pekip-herbst",
    ]);
    // 5 Monate am 14.10., 6 am 21.10.: Der Treff passt erst ab 21.10. und steht hinter PEKiP.
    expect(savedOffers(file.offers, ids, FIXTURE_NOW, "2026-04-20").map(savedKey)).toEqual([
      "pekip-herbst",
      "krabbeltreff",
    ]);
    // mit dem Termin, an dem die Karte steht: Die Liste rechnet ihn nicht noch einmal (Arch-Review 0025, Minor 1)
    const treff = savedOffers(file.offers, ids, FIXTURE_NOW, "2026-04-20").at(-1);
    expect(treff && berlinIsoDate(treff.session.start)).toBe("2026-10-21");
  });

  it("behält regelmäßige ohne passenden Termin am nächsten Termin (bewusst gemerkt, Plan 0028)", () => {
    const ids = [id("krabbeltreff"), id("pekip-herbst")];
    expect(savedOffers(file.offers, ids, FIXTURE_NOW, "2026-08-01").map(savedKey)).toEqual([
      "krabbeltreff",
      "pekip-herbst",
    ]);
  });
});

/** Geburtsdaten quer über die Altersspannen der Fixtures: Neugeborene bis fast 4 Jahre, Monatsende */
const BIRTH_DATES = [
  "2026-10-01",
  "2026-08-01",
  "2026-05-31",
  "2026-04-20",
  "2025-10-15",
  "2024-10-31",
  "2024-09-18",
  "2024-01-31",
  "2023-01-01",
] as const;

describe("exportSessions (Plan 0018, E1)", () => {
  describe("ohne Geburtsdatum", () => {
    it("nimmt Kurse immer komplett, auch wenn sie schon laufen", () => {
      const pekip = fixtureOffer("pekip-herbst");
      expect(exportSessions(pekip, new Date("2026-11-11T12:00:00+01:00"), undefined)).toEqual({
        sessions: pekip.sessions,
      });
    });

    it("nimmt bei regelmäßigen Angeboten nur kommende Termine", () => {
      const treff = fixtureOffer("krabbeltreff"); // 7.10.–4.11., 5 Termine
      expect(exportSessions(treff, FIXTURE_NOW, undefined)).toEqual({ sessions: treff.sessions });
      const later = exportSessions(treff, new Date("2026-10-21T12:00:00+02:00"), undefined);
      expect(days(later)).toEqual(["2026-10-28", "2026-11-04"]);
      expect(later).not.toHaveProperty("from");
      expect(later).not.toHaveProperty("until");
    });

    it("nimmt einmalige Angebote nur, solange sie nicht beendet sind", () => {
      const konzert = fixtureOffer("babykonzert-advent");
      expect(exportSessions(konzert, FIXTURE_NOW, undefined)).toEqual({ sessions: konzert.sessions });
      expect(exportSessions(fixtureOffer("vergangen"), FIXTURE_NOW, undefined)).toEqual({ sessions: [] });
    });

    it("wählt für jedes Fixture-Angebot wie bisher: Kurse komplett, sonst die kommenden Termine", () => {
      for (const now of [FIXTURE_NOW, new Date("2026-11-11T12:00:00+01:00")]) {
        for (const offer of file.offers) {
          // Orakel: die Regel aus ADR 0007, bis Plan 0018 `collectionSessions`
          const expected = offer.format === "kurs" ? offer.sessions : upcomingSessions(offer, now);
          expect(exportSessions(offer, now, undefined), offer.title).toEqual({ sessions: expected });
        }
      }
    });
  });

  describe("regelmäßig mit Geburtsdatum", () => {
    const treff = fixtureOffer("krabbeltreff"); // 6–24 Monate, mittwochs 7.10.–4.11.

    it("endet, sobald das Kind zu alt wird (24 Monate am 14.10., 25 am 21.10.)", () => {
      const selection = exportSessions(treff, FIXTURE_NOW, "2024-09-18");
      expect(days(selection)).toEqual(["2026-10-07", "2026-10-14"]);
      expect(selection.until).toBe(treff.sessions[1]?.start);
      expect(selection).not.toHaveProperty("from");
    });

    it("beginnt erst, wenn das Kind alt genug ist (5 Monate am 14.10., 6 am 21.10.)", () => {
      const selection = exportSessions(treff, FIXTURE_NOW, "2026-04-20");
      expect(days(selection)).toEqual(["2026-10-21", "2026-10-28", "2026-11-04"]);
      expect(selection.from).toBe(treff.sessions[2]?.start);
      expect(selection).not.toHaveProperty("until");
    });

    it("kürzt vorn und hinten", () => {
      const weekly: Offer = {
        ...treff,
        age: { minMonths: 6, maxMonths: 6 },
        sessions: weeklySessions("2026-10-07", 10),
      };
      const selection = exportSessions(weekly, FIXTURE_NOW, "2026-04-16"); // 6 Monate vom 16.10. bis 15.11.
      expect(days(selection)).toEqual(["2026-10-21", "2026-10-28", "2026-11-04", "2026-11-11"]);
      expect(selection.from).toBe(weekly.sessions[2]?.start);
      expect(selection.until).toBe(weekly.sessions[5]?.start);
    });

    it("ist leer und ohne Grenzen, wenn kein kommender Termin passt", () => {
      expect(exportSessions(treff, FIXTURE_NOW, "2026-08-01")).toEqual({ sessions: [] }); // 2–3 Monate
      expect(exportSessions(treff, FIXTURE_NOW, "2023-01-01")).toEqual({ sessions: [] }); // über 3 Jahre
    });

    it("bleibt ungekürzt, wenn alle kommenden Termine passen", () => {
      const reime = fixtureOffer("krabbelreime"); // 0–36 Monate, 4 Termine
      expect(exportSessions(reime, FIXTURE_NOW, "2024-09-18")).toEqual({ sessions: reime.sessions });
    });

    it("lässt vergangene Termine weg und zählt sie nicht als gekürzt", () => {
      const later = new Date("2026-10-15T12:00:00+02:00"); // 7.10. und 14.10. sind vorbei
      // passt bis 14.10.: nichts Kommendes mehr
      expect(exportSessions(treff, later, "2024-09-18")).toEqual({ sessions: [] });
      // passt ab 21.10. = ab dem nächsten kommenden Termin: kein „ab“
      expect(exportSessions(treff, later, "2026-04-20")).toEqual({ sessions: treff.sessions.slice(2) });
    });

    it("rechnet den Grenztag am 31. in kurzen Monaten am Monatsletzten (Berliner Tag)", () => {
      const offer: Offer = {
        ...treff,
        age: { minMonths: 1, maxMonths: 3 },
        sessions: ["2026-02-27", "2026-02-28", "2026-04-30", "2026-05-30", "2026-05-31"].map(session),
      };
      // geboren am 31.1.: 1 Monat am 28.2., 3 Monate am 30.4. und noch am 30.5., 4 Monate am 31.5.
      const selection = exportSessions(offer, new Date("2026-02-01T12:00:00+01:00"), "2026-01-31");
      expect(days(selection)).toEqual(["2026-02-28", "2026-04-30", "2026-05-30"]);
      expect(selection.from).toBe(offer.sessions[1]?.start);
      expect(selection.until).toBe(offer.sessions[3]?.start);
    });
  });

  describe("Kurse und Einzeltermine mit Geburtsdatum", () => {
    it("nimmt Kurse komplett, auch wenn das Kind nicht (mehr) passt", () => {
      const pekip = fixtureOffer("pekip-herbst"); // 1–5 Monate, 8 Termine
      for (const birthDate of ["2026-09-10", "2026-05-14", "2024-09-18"]) {
        expect(exportSessions(pekip, FIXTURE_NOW, birthDate)).toEqual({ sessions: pekip.sessions });
      }
      expect(exportSessions(pekip, FIXTURE_NOW, "2024-09-18").sessions).toHaveLength(8);
    });

    it("nimmt Einzeltermine wie ohne Geburtsdatum", () => {
      const kuckuck = fixtureOffer("kuckuck-im-nest"); // ab 18 Monaten
      expect(exportSessions(kuckuck, FIXTURE_NOW, "2026-08-01")).toEqual({ sessions: kuckuck.sessions });
      expect(exportSessions(fixtureOffer("vergangen"), FIXTURE_NOW, "2026-08-01")).toEqual({ sessions: [] });
    });
  });

  it("passt bei regelmäßigen Angeboten genau dann etwas, wenn offerFitsAge gilt", () => {
    const regular = file.offers.filter((o) => o.format === "regelmaessig");
    expect(regular.length).toBeGreaterThan(1);
    for (const now of [FIXTURE_NOW, new Date("2026-10-22T12:00:00+02:00")]) {
      for (const offer of regular) {
        for (const birthDate of BIRTH_DATES) {
          const fits = exportSessions(offer, now, birthDate).sessions.length > 0;
          expect(fits, `${offer.title}, ${birthDate}`).toBe(offerFitsAge(offer, birthDate, now));
        }
      }
    }
  });
});

describe("seriesExport (Plan 0018, E1/E2)", () => {
  const treff = fixtureOffer("krabbeltreff");

  it("nimmt ohne Geburtsdatum die statische Datei", () => {
    expect(seriesExport(treff, FIXTURE_NOW, undefined)).toEqual({ kind: "static" });
  });

  it("nimmt bei Kursen und Einzelterminen die statische Datei, auch mit Geburtsdatum", () => {
    expect(seriesExport(fixtureOffer("pekip-herbst"), FIXTURE_NOW, "2024-09-18")).toEqual({ kind: "static" });
    expect(seriesExport(fixtureOffer("kuckuck-im-nest"), FIXTURE_NOW, "2026-08-01")).toEqual({ kind: "static" });
  });

  it("lädt nichts, wenn kein kommender Termin passt", () => {
    expect(seriesExport(treff, FIXTURE_NOW, "2026-08-01")).toEqual({ kind: "none" });
  });

  it("erzeugt im Browser, wenn gekürzt wird", () => {
    expect(seriesExport(treff, FIXTURE_NOW, "2024-09-18")).toEqual({
      kind: "blob",
      selection: { sessions: treff.sessions.slice(0, 2), until: treff.sessions[1]?.start },
    });
  });

  it("erzeugt im Browser auch ungekürzt, damit der Request das Alter nicht verrät (Review 3, W2)", () => {
    const reime = fixtureOffer("krabbelreime");
    expect(seriesExport(reime, FIXTURE_NOW, "2024-09-18")).toEqual({
      kind: "blob",
      selection: { sessions: reime.sessions },
    });
  });
});

describe("collectionExport (Plan 0018, E3)", () => {
  const pekip = fixtureOffer("pekip-herbst"); // Kurs, 1–5 Monate, 8 Termine
  const treff = fixtureOffer("krabbeltreff"); // regelmäßig, 6–24 Monate, 5 Termine
  const reime = fixtureOffer("krabbelreime"); // regelmäßig, 0–36 Monate, 4 Termine

  it("nimmt ohne Geburtsdatum alles wie bisher", () => {
    const result = collectionExport([pekip, treff], FIXTURE_NOW, undefined);
    expect(result.items).toEqual([
      { offer: pekip, sessions: pekip.sessions },
      { offer: treff, sessions: treff.sessions },
    ]);
    expect(result).toMatchObject({ count: 13, missing: 0 });
  });

  it("kürzt regelmäßige Angebote nach dem Alter, Kurse bleiben komplett", () => {
    const result = collectionExport([pekip, treff], FIXTURE_NOW, "2024-09-18");
    expect(result.items).toEqual([
      { offer: pekip, sessions: pekip.sessions },
      { offer: treff, sessions: treff.sessions.slice(0, 2) },
    ]);
    expect(result).toMatchObject({ count: 10, missing: 0 });
  });

  it("lässt Angebote ohne passenden Termin weg und zählt sie", () => {
    expect(collectionExport([treff], FIXTURE_NOW, "2026-08-01")).toEqual({ items: [], count: 0, missing: 1 });
    expect(collectionExport([treff, reime], FIXTURE_NOW, "2026-08-01")).toEqual({
      items: [{ offer: reime, sessions: reime.sessions }],
      count: 4,
      missing: 1,
    });
  });

  it("behält Reihenfolge und Objekte der übergebenen Angebote", () => {
    const offers = [{ ...reime }, { ...pekip }];
    const [first, second] = collectionExport(offers, FIXTURE_NOW, undefined).items;
    expect(first?.offer).toBe(offers[0]);
    expect(second?.offer).toBe(offers[1]);
  });
});

describe("upcomingSessionCount (Plan 0025, E3a)", () => {
  const today = berlinIsoDate(FIXTURE_NOW);
  const at = (day: string, from: string, to: string) => ({
    start: fromBerlinLocal(`${day}T${from}`),
    end: fromBerlinLocal(`${day}T${to}`),
  });

  it("summiert die kommenden Termine über mehrere Angebote", () => {
    const offers = [
      { ...fixtureOffer("krabbeltreff"), sessions: weeklySessions(addDays(today, 1), 3) },
      { ...fixtureOffer("pekip-herbst"), sessions: weeklySessions(addDays(today, 2), 4) },
    ];
    expect(upcomingSessionCount(offers, FIXTURE_NOW, undefined)).toBe(7);
  });

  it("zählt heute schon beendete Termine nicht, laufende und spätere von heute schon", () => {
    // FIXTURE_NOW ist 12:00 Berliner Zeit, in Los Angeles noch Vormittag desselben Tages
    const offer = {
      ...fixtureOffer("krabbeltreff"),
      sessions: [at(today, "08:30", "09:30"), at(today, "11:30", "12:30"), at(today, "15:00", "16:00")],
    };
    expect(upcomingSessionCount([offer], FIXTURE_NOW, undefined)).toBe(2);
  });

  it("ergibt 0 für eine leere Liste", () => {
    expect(upcomingSessionCount([], FIXTURE_NOW, undefined)).toBe(0);
  });

  it("zählt mit Geburtsdatum dieselben Termine wie der Export, Kurse nur kommende (Plan 0028)", () => {
    const pekip = fixtureOffer("pekip-herbst"); // Kurs, 8 kommende Termine
    const treff = fixtureOffer("krabbeltreff"); // passt ab 21.10.: 3 von 5
    expect(upcomingSessionCount([pekip, treff], FIXTURE_NOW, undefined)).toBe(13);
    expect(upcomingSessionCount([pekip, treff], FIXTURE_NOW, "2026-04-20")).toBe(11);
    expect(upcomingSessionCount([treff], FIXTURE_NOW, "2026-08-01")).toBe(0);
    for (const birthDate of BIRTH_DATES) {
      const exported = exportSessions(treff, FIXTURE_NOW, birthDate).sessions.length;
      expect(upcomingSessionCount([treff], FIXTURE_NOW, birthDate), birthDate).toBe(exported);
    }
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

describe("Filter der Merkliste (Plan 0025, E6)", () => {
  // Wie die Oberfläche sie hat: mit Ort (Typgrenze von `matchesFilter`)
  const siteOffers = fixtureSiteOffers();
  const site = (key: FixtureKey) => {
    const found = siteOffers.find((o) => fixtureKey(o) === key);
    if (!found) throw new Error(`Fixture-Angebot ${key} fehlt`);
    return found;
  };
  // PEKiP: Kurs mit Anmeldung ab 13.10.; Musikgarten: Kurs mit Anmeldung ab 5.11.; Treff: regelmäßig ohne, bis 4.11.
  const offers = [site("pekip-herbst"), site("musikgarten-1"), site("krabbeltreff")];
  const keys = (list: readonly Offer[]) => list.map((o) => fixtureKey(o));
  const filter = (patch: Partial<SavedFilter>): SavedFilter => ({ ...EMPTY_SAVED_FILTER, ...patch });
  const all = { useRange: true };

  it("ein leerer Filter ergibt alle mit kommendem Termin", () => {
    expect(keys(applySavedFilter(offers, EMPTY_SAVED_FILTER, FIXTURE_NOW, all))).toEqual([
      "pekip-herbst",
      "musikgarten-1",
      "krabbeltreff",
    ]);
    expect(applySavedFilter([site("vergangen")], EMPTY_SAVED_FILTER, FIXTURE_NOW, all)).toEqual([]);
  });

  it("Format wirkt als ODER, Anmeldung zusätzlich als UND", () => {
    expect(keys(applySavedFilter(offers, filter({ formats: ["kurs"] }), FIXTURE_NOW, all))).toEqual([
      "pekip-herbst",
      "musikgarten-1",
    ]);
    expect(applySavedFilter(offers, filter({ formats: ["kurs", "regelmaessig"] }), FIXTURE_NOW, all)).toHaveLength(3);
    const none = filter({ formats: ["kurs"], registration: ["ohne-anmeldung"] });
    expect(applySavedFilter(offers, none, FIXTURE_NOW, all)).toEqual([]);
  });

  it("Zeitraum: Kurse mit erstem Termin darin, regelmäßige mit irgendeinem Termin", () => {
    const fromNov = filter({ range: { from: "2026-11-01" } });
    expect(keys(applySavedFilter(offers, fromNov, FIXTURE_NOW, all))).toEqual(["musikgarten-1", "krabbeltreff"]);
  });

  it("ohne `useRange` zählt der Zeitraum nicht (Kalender)", () => {
    const fromNov = filter({ range: { from: "2026-11-01" } });
    expect(applySavedFilter(offers, fromNov, FIXTURE_NOW, { useRange: false })).toHaveLength(3);
  });

  it("savedFilterCount zählt Werte, den Zeitraum als einen und nur mit `useRange`", () => {
    expect(savedFilterCount(EMPTY_SAVED_FILTER, all)).toBe(0);
    const f = filter({ formats: ["kurs", "einmalig"], registration: ["mit-anmeldung"], range: { from: "2026-11-01" } });
    expect(savedFilterCount(f, all)).toBe(4);
    expect(savedFilterCount(f, { useRange: false })).toBe(3);
    expect(savedFilterCount(filter({ range: { from: "2026-11-01" } }), { useRange: false })).toBe(0);
  });

  it("matchesSavedFilter prüft Format und Anmeldung ohne Zeitbezug, auch für Vorbei-es (M7)", () => {
    const cafe = site("vergangen"); // einmalig, ohne Anmeldung, heute schon vorbei
    expect(matchesSavedFilter(cafe, filter({ formats: ["einmalig"] }))).toBe(true);
    expect(matchesSavedFilter(cafe, filter({ formats: ["kurs"] }))).toBe(false);
    expect(matchesSavedFilter(cafe, filter({ registration: ["mit-anmeldung"] }))).toBe(false);
    expect(matchesSavedFilter(cafe, filter({ range: { from: "2027-01-01" } }))).toBe(true);
  });
});

describe("isSavedFilterChipOn (Arch-Review 0025, Etappe 4)", () => {
  const nov = { from: "2026-11-01" };
  const f: SavedFilter = { formats: ["kurs"], registration: ["mit-anmeldung"], range: nov };

  it("ist an, wenn der Wert gewählt ist; Zeitraum über von und bis", () => {
    expect(isSavedFilterChipOn(f, { kind: "format", value: "kurs" })).toBe(true);
    expect(isSavedFilterChipOn(f, { kind: "format", value: "einmalig" })).toBe(false);
    expect(isSavedFilterChipOn(f, { kind: "registration", value: "mit-anmeldung" })).toBe(true);
    expect(isSavedFilterChipOn(f, { kind: "registration", value: "ohne-anmeldung" })).toBe(false);
    expect(isSavedFilterChipOn(f, { kind: "range", range: { ...nov } })).toBe(true);
    expect(isSavedFilterChipOn(f, { kind: "range", range: { from: "2026-12-01" } })).toBe(false);
    expect(isSavedFilterChipOn(f, { kind: "range", range: { from: "2026-11-01", to: "2026-11-30" } })).toBe(false);
    expect(isSavedFilterChipOn(EMPTY_SAVED_FILTER, { kind: "range", range: nov })).toBe(false);
  });

  it("passt zu toggleSavedFilter: ein Tipp schaltet genau diesen Chip um", () => {
    const chip = { kind: "format", value: "regelmaessig" } as const;
    expect(isSavedFilterChipOn(toggleSavedFilter(f, chip), chip)).toBe(true);
    expect(isSavedFilterChipOn(toggleSavedFilter(toggleSavedFilter(f, chip), chip), chip)).toBe(false);
  });
});

describe("toggleSavedFilter (Plan 0025, E6, E7)", () => {
  const nov = { from: "2026-11-01" };
  const dez = { from: "2026-12-01" };

  it("Format: Mehrfachwahl", () => {
    const kurse = toggleSavedFilter(EMPTY_SAVED_FILTER, { kind: "format", value: "kurs" });
    expect(kurse.formats).toEqual(["kurs"]);
    const both = toggleSavedFilter(kurse, { kind: "format", value: "einmalig" });
    expect(both.formats).toEqual(["kurs", "einmalig"]);
    expect(toggleSavedFilter(both, { kind: "format", value: "kurs" }).formats).toEqual(["einmalig"]);
  });

  it("Anmeldung: Einfachwahl, der eine schaltet den anderen ab", () => {
    const mit = toggleSavedFilter(EMPTY_SAVED_FILTER, { kind: "registration", value: "mit-anmeldung" });
    expect(mit.registration).toEqual(["mit-anmeldung"]);
    expect(toggleSavedFilter(mit, { kind: "registration", value: "ohne-anmeldung" }).registration).toEqual([
      "ohne-anmeldung",
    ]);
    expect(toggleSavedFilter(mit, { kind: "registration", value: "mit-anmeldung" }).registration).toEqual([]);
  });

  it("Schnellwahl: Einfachwahl, ein zweiter Tipp hebt sie auf; ohne Zeitraum fehlt der Schlüssel", () => {
    const a = toggleSavedFilter(EMPTY_SAVED_FILTER, { kind: "range", range: nov });
    expect(a.range).toEqual(nov);
    expect(toggleSavedFilter(a, { kind: "range", range: dez }).range).toEqual(dez);
    const off = toggleSavedFilter(a, { kind: "range", range: { ...nov } });
    expect(off).toEqual(EMPTY_SAVED_FILTER);
    expect("range" in off).toBe(false);
  });

  it("lässt die übrigen Werte unverändert", () => {
    const f: SavedFilter = { formats: ["kurs"], registration: ["mit-anmeldung"], range: nov };
    expect(toggleSavedFilter(f, { kind: "format", value: "regelmaessig" })).toEqual({
      ...f,
      formats: ["kurs", "regelmaessig"],
    });
  });
});

describe("savedOffers mit Zeitraum (Plan 0025, E3a)", () => {
  it("stellt ein Angebot an seinen Termin im Zeitraum und sortiert danach", () => {
    const ids = [id("krabbeltreff"), id("musikgarten-1")];
    const items = savedOffers(file.offers, ids, FIXTURE_NOW, undefined, { from: "2026-11-01" });
    // Treff am 4.11., Musikgarten am 5.11.; ohne Zeitraum stünde der Treff am 7.10.
    expect(items.map((i) => [fixtureKey(i.offer), berlinIsoDate(i.session.start)])).toEqual([
      ["krabbeltreff", "2026-11-04"],
      ["musikgarten-1", "2026-11-05"],
    ]);
  });
});
