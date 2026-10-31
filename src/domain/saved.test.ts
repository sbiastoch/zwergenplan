import { describe, expect, it } from "vitest";
import { offerFitsAge } from "./age.ts";
import { upcomingSessions } from "./agenda.ts";
import { EMPTY_FILTER, type FilterState } from "./filter.ts";
import type { ReachFn } from "./reach.ts";
import {
  applySavedFilter,
  cleanSavedProviders,
  cleanSavedState,
  collectionExport,
  cycleStage,
  EMPTY_SAVED_FILTER,
  exportSessions,
  followUpFilter,
  isSoon,
  matchesListChips,
  matchesSavedFilter,
  migrateSavedIds,
  recentlySaved,
  SAVED_LIST_CHIPS,
  type SavedFilter,
  type SavedListChip,
  type SavedStage,
  type SavedState,
  SOON_DAYS,
  savedFilterCount,
  savedOffers,
  savedRule,
  savedUnfitIds,
  seriesExport,
  stageOf,
  toggleId,
  withStage,
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
    expect(collectionExport([treff], FIXTURE_NOW, "2026-08-01")).toEqual({
      items: [],
      count: 0,
      missing: 1,
      tentative: 0,
    });
    expect(collectionExport([treff, reime], FIXTURE_NOW, "2026-08-01")).toEqual({
      items: [{ offer: reime, sessions: reime.sessions }],
      count: 4,
      missing: 1,
      tentative: 0,
    });
  });

  it("behält Reihenfolge und Objekte der übergebenen Angebote", () => {
    const offers = [{ ...reime }, { ...pekip }];
    const [first, second] = collectionExport(offers, FIXTURE_NOW, undefined).items;
    expect(first?.offer).toBe(offers[0]);
    expect(second?.offer).toBe(offers[1]);
  });

  it("nimmt mit Stufen nur fest Eingeplantes und zählt die vorgemerkten (Plan 0057, E4)", () => {
    const state = { ids: [pekip.id, treff.id, reime.id], tentative: [treff.id, reime.id] };
    expect(collectionExport([pekip, treff, reime], FIXTURE_NOW, undefined, state)).toEqual({
      items: [{ offer: pekip, sessions: pekip.sessions }],
      count: 8,
      missing: 0,
      tentative: 2,
    });
    // nichts fest: keine Datei, aber die vorgemerkten gezählt
    expect(collectionExport([treff, reime], FIXTURE_NOW, undefined, state)).toEqual({
      items: [],
      count: 0,
      missing: 0,
      tentative: 2,
    });
    // ohne Stufen alle, keine vorgemerkten (Statuszeile)
    expect(collectionExport([pekip, treff], FIXTURE_NOW, undefined)).toMatchObject({ count: 13, tentative: 0 });
  });
});

describe("Stufen der Merkliste (Plan 0057, E1)", () => {
  const empty: SavedState = { ids: [], tentative: [] };

  it("Tipp: aus → vorgemerkt → fest → aus", () => {
    const one = cycleStage(empty, "a");
    expect(one).toEqual({ ids: ["a"], tentative: ["a"] });
    expect(stageOf(one, "a")).toBe("vorgemerkt");
    const two = cycleStage(one, "a");
    expect(two).toEqual({ ids: ["a"], tentative: [] });
    expect(stageOf(two, "a")).toBe("fest");
    const three = cycleStage(two, "a");
    expect(three).toEqual({ ids: [], tentative: [] });
    expect(stageOf(three, "a")).toBe("aus");
  });

  it("Bestand ohne Vorgemerkt-Liste ist fest eingeplant", () => {
    const state: SavedState = { ids: ["a", "b"], tentative: [] };
    expect(stageOf(state, "a")).toBe("fest");
    expect(stageOf(state, "b")).toBe("fest");
    expect(stageOf(state, "c")).toBe("aus");
  });

  it("withStage setzt aus jeder Stufe jede", () => {
    const stages: SavedStage[] = ["aus", "vorgemerkt", "fest"];
    for (const from of stages) {
      for (const to of stages) {
        const start = withStage({ ids: ["x"], tentative: [] }, "a", from);
        const next = withStage(start, "a", to);
        expect(stageOf(next, "a"), `${from} → ${to}`).toBe(to);
        expect(stageOf(next, "x"), "andere bleiben").toBe("fest");
        expect(next.tentative.every((t) => next.ids.includes(t))).toBe(true);
      }
    }
  });

  it("Stufenwechsel hält die Merk-Reihenfolge, neu Gemerktes hängt hinten an", () => {
    const state: SavedState = { ids: ["a", "b", "c"], tentative: ["b"] };
    expect(cycleStage(state, "b").ids).toEqual(["a", "b", "c"]);
    expect(withStage(state, "a", "vorgemerkt").ids).toEqual(["a", "b", "c"]);
    // gleiche Stufe: derselbe Zustand, nichts zu speichern
    expect(withStage(state, "c", "fest")).toBe(state);
    expect(cycleStage(state, "d")).toEqual({ ids: ["a", "b", "c", "d"], tentative: ["b", "d"] });
    // „Rückgängig“ nach dem Entfernen: wieder hinten, die alte Stelle ist verloren
    expect(withStage(withStage(state, "a", "aus"), "a", "fest").ids).toEqual(["b", "c", "a"]);
  });

  it("cleanSavedState: Vorgemerktes außerhalb der Merkliste fällt weg, alte IDs werden migriert", () => {
    const long = "familientreff-beispiel--offener-krabbeltreff--familientreff-beispiel-haus";
    expect(cleanSavedState({ ids: [long, "nle21y1x"], tentative: [long, "weg", "nle21y1x", "nle21y1x"] })).toEqual({
      ids: ["lxizt974", "nle21y1x"],
      tentative: ["lxizt974", "nle21y1x"],
    });
    expect(cleanSavedState({ ids: ["a"], tentative: [] })).toEqual({ ids: ["a"], tentative: [] });
  });
});

describe("cleanSavedProviders (Plan 0025, E1; ADR 0022)", () => {
  it("verwirft ungültige IDs", () => {
    expect(cleanSavedProviders(["Familientreff", "mit leerzeichen", "b5nuus36"])).toEqual(["b5nuus36"]);
  });

  it("rechnet Katalog-IDs auf die publicId um, zu lange fallen weg", () => {
    expect(cleanSavedProviders(["familientreff-beispiel", "babykonzert-nuernberg"])).toEqual(["b5nuus36", "gl1sfqim"]);
    expect(cleanSavedProviders(["a".repeat(81)])).toEqual([]);
    expect(cleanSavedProviders(["a".repeat(80)])).toHaveLength(1);
  });

  it("Katalog-ID und publicId desselben Anbieters ergeben einen Eintrag an der ersten Stelle", () => {
    expect(cleanSavedProviders(["gl1sfqim", "b5nuus36", "babykonzert-nuernberg"])).toEqual(["gl1sfqim", "b5nuus36"]);
    expect(cleanSavedProviders(["un8dc9t4", "familientreff-beispiel", "b5nuus36"])).toEqual(["un8dc9t4", "b5nuus36"]);
  });
});

describe("migrateSavedIds (ADR 0022)", () => {
  const long = "atv-1873-frankonia--riesen-zwerge-turnen-fuer-2-bis-3-jaehrige-mo--atv-1873-frankonia";

  it("bildet alte IDs ab, entfernt Dubletten und hält die Reihenfolge", () => {
    expect(migrateSavedIds(["4tpu5qaq", long, "d4qshjw0", "zzzzzzzz"])).toEqual(["4tpu5qaq", "d4qshjw0", "zzzzzzzz"]);
    expect(migrateSavedIds(["4tpu5qaq", "zzzzzzzz"])).toEqual(["4tpu5qaq", "zzzzzzzz"]);
  });
});

describe("Filter der Merkliste (Plan 0025, E6; Plan 0057, E5)", () => {
  // Wie die Oberfläche sie hat: mit Ort (Typgrenze von `matchesFilter`)
  const siteOffers = fixtureSiteOffers();
  const site = (key: FixtureKey) => {
    const found = siteOffers.find((o) => fixtureKey(o) === key);
    if (!found) throw new Error(`Fixture-Angebot ${key} fehlt`);
    return found;
  };
  // PEKiP: Kurs mit Anmeldung ab 13.10., 9:30; Musikgarten: Kurs mit Anmeldung ab 5.11., 16 Uhr; Treff: regelmäßig ohne,
  // kostenlos, mittwochs 10 Uhr bis 4.11.
  const offers = [site("pekip-herbst"), site("musikgarten-1"), site("krabbeltreff")];
  const keys = (list: readonly Offer[]) => list.map((o) => fixtureKey(o));
  const saved = (patch: Partial<FilterState>, onlyFixed = false): SavedFilter => ({
    filter: { ...EMPTY_FILTER, ...patch },
    onlyFixed,
  });
  // alles fest eingeplant (Bestand), nur der Treff vorgemerkt
  const allFixed: SavedState = { ids: offers.map((o) => o.id), tentative: [] };
  const treffTentative: SavedState = { ...allFixed, tentative: [site("krabbeltreff").id] };
  const all = { useRange: true };
  const apply = (filter: SavedFilter, opts: { useRange: boolean; reach?: ReachFn } = all, state = allFixed) =>
    keys(applySavedFilter(offers, filter, state, FIXTURE_NOW, opts));

  it("ein leerer Filter ergibt alle mit kommendem Termin", () => {
    expect(apply(EMPTY_SAVED_FILTER)).toEqual(["pekip-herbst", "musikgarten-1", "krabbeltreff"]);
    expect(applySavedFilter([site("vergangen")], EMPTY_SAVED_FILTER, allFixed, FIXTURE_NOW, all)).toEqual([]);
  });

  it("ein gemerkter laufender Kurs bleibt (Plan 0053, E1)", () => {
    const later = new Date("2026-10-20T12:00:00+02:00");
    expect(keys(applySavedFilter(offers, EMPTY_SAVED_FILTER, allFixed, later, all))).toEqual([
      "pekip-herbst",
      "musikgarten-1",
      "krabbeltreff",
    ]);
  });

  it("Format als ODER, Anmeldung, Kategorie und Kosten zusätzlich als UND, wie auf der Startseite", () => {
    expect(apply(saved({ formats: ["kurs"] }))).toEqual(["pekip-herbst", "musikgarten-1"]);
    expect(apply(saved({ formats: ["kurs", "regelmaessig"] }))).toHaveLength(3);
    expect(apply(saved({ formats: ["kurs"], registration: ["ohne-anmeldung"] }))).toEqual([]);
    expect(apply(saved({ categories: ["musik"] }))).toEqual(["musikgarten-1"]);
    expect(apply(saved({ cost: ["kostenlos"] }))).toEqual(["krabbeltreff"]);
  });

  it("Tageszeit filtert hart, am Kursbeginn bzw. an einem kommenden Termin (E7)", () => {
    expect(apply(saved({ daytimes: ["vormittags"] }))).toEqual(["pekip-herbst", "krabbeltreff"]);
    expect(apply(saved({ daytimes: ["nachmittags"] }))).toEqual(["musikgarten-1"]);
    // ein laufender Kurs mit Beginn vormittags bleibt, auch wenn sein Beginn vorbei ist
    const later = new Date("2026-10-20T12:00:00+02:00");
    expect(keys(applySavedFilter(offers, saved({ daytimes: ["vormittags"] }), allFixed, later, all))).toContain(
      "pekip-herbst",
    );
  });

  it("„Nur fest eingeplant“ blendet vorgemerkte aus", () => {
    expect(apply(saved({}, true), all, treffTentative)).toEqual(["pekip-herbst", "musikgarten-1"]);
    expect(apply(saved({}, true), all, allFixed)).toHaveLength(3);
    expect(apply(saved({ formats: ["regelmaessig"] }, true), all, treffTentative)).toEqual([]);
  });

  it("Zeitraum: Kurse mit erstem Termin darin, regelmäßige mit irgendeinem Termin; ohne `useRange` nicht (Kalender)", () => {
    const fromNov = saved({ range: { from: "2026-11-01" } });
    expect(apply(fromNov)).toEqual(["musikgarten-1", "krabbeltreff"]);
    expect(apply(fromNov, { useRange: false })).toHaveLength(3);
    // Tageszeit wirkt auch im Kalender
    expect(apply(saved({ range: { from: "2026-11-01" }, daytimes: ["nachmittags"] }), { useRange: false })).toEqual([
      "musikgarten-1",
    ]);
  });

  it("Wegzeit-Grenze nur mit Wegzeit (`reach`)", () => {
    const within20 = saved({ reachLimit: { kind: "minuten", value: 20 } });
    // Musikschule (Musikgarten) 29,6 Min., Beispielhof (Treff) 13,6, Gemeinde (PEKiP) 32,6
    const minutes: Record<string, number> = { "musikgarten-1": 29.6, krabbeltreff: 13.6, "pekip-herbst": 32.6 };
    const reach: ReachFn = (venue) => {
      const offer = offers.find((o) => o.venue === venue);
      return { kind: "oepnv", minutes: minutes[(offer && fixtureKey(offer)) ?? ""] ?? 99, byFoot: false };
    };
    expect(apply(within20, { useRange: true, reach })).toEqual(["krabbeltreff"]);
    expect(apply(within20)).toHaveLength(3);
  });

  it("matchesSavedFilter: ohne Zeitbezug und ohne Tageszeit, mit „Nur fest eingeplant“ (M7; Plan 0057, E7)", () => {
    const cafe = site("vergangen"); // einmalig, ohne Anmeldung, heute 9 Uhr schon vorbei
    const state: SavedState = { ids: [cafe.id], tentative: [] };
    expect(matchesSavedFilter(cafe, saved({ formats: ["einmalig"] }), state)).toBe(true);
    expect(matchesSavedFilter(cafe, saved({ formats: ["kurs"] }), state)).toBe(false);
    expect(matchesSavedFilter(cafe, saved({ registration: ["mit-anmeldung"] }), state)).toBe(false);
    expect(matchesSavedFilter(cafe, saved({ range: { from: "2027-01-01" } }), state)).toBe(true);
    // einziger Termin heute schon vorbei: bleibt gezählt, die Tageszeit prüft der Kalender je Termin
    expect(matchesSavedFilter(cafe, saved({ daytimes: ["nachmittags"] }), state)).toBe(true);
    expect(matchesSavedFilter(cafe, saved({}, true), state)).toBe(true);
    expect(matchesSavedFilter(cafe, saved({}, true), { ...state, tentative: [cafe.id] })).toBe(false);
  });

  it("savedFilterCount: Werte wie das Badge der Startseite, plus „Nur fest“; Zeitraum nur mit `useRange`", () => {
    const off = { useRange: true, limitActive: false };
    expect(savedFilterCount(EMPTY_SAVED_FILTER, off)).toBe(0);
    const f = saved({ formats: ["kurs", "einmalig"], daytimes: ["vormittags"], range: { from: "2026-11-01" } }, true);
    expect(savedFilterCount(f, off)).toBe(5);
    expect(savedFilterCount(f, { useRange: false, limitActive: false })).toBe(4);
    const limit = saved({ reachLimit: { kind: "minuten", value: 20 } });
    expect(savedFilterCount(limit, off)).toBe(0);
    expect(savedFilterCount(limit, { useRange: true, limitActive: true })).toBe(1);
  });

  it("savedRule: Zeitraum nur mit `useRange`, die Tageszeit immer", () => {
    const f = saved({ range: { from: "2026-11-01" }, daytimes: ["nachmittags"] });
    expect(savedRule(f, true)).toEqual({ range: { from: "2026-11-01" }, daytimes: ["nachmittags"] });
    expect(savedRule(f, false)).toEqual({ range: undefined, daytimes: ["nachmittags"] });
  });
});

describe("savedUnfitIds (Plan 0057, E5, Review 3 M2)", () => {
  // Treff 6–24 Monate, mittwochs 10 Uhr ab 7.10.; geboren am 20.4.: passend erst ab 21.10.
  const treff = fixtureOffer("krabbeltreff");
  const birthDate = "2026-04-20";

  it("ohne Geburtsdatum nichts, ohne Regel wie `offerFitsAge`", () => {
    expect(savedUnfitIds([treff], undefined, FIXTURE_NOW, {}).size).toBe(0);
    expect(savedUnfitIds([treff], birthDate, FIXTURE_NOW, {}).has(treff.id)).toBe(false);
  });

  it("mit Zeitraum und Tageszeit zählt nur ein passender Termin darin", () => {
    expect(savedUnfitIds([treff], birthDate, FIXTURE_NOW, { range: { to: "2026-10-14" } }).has(treff.id)).toBe(true);
    // passende Termine gibt es nur vormittags: Mit „Nachmittags“ ist der Treff markiert
    const mixed: Offer = {
      ...treff,
      sessions: [
        ...treff.sessions,
        { start: "2026-10-08T16:00:00+02:00", end: "2026-10-08T17:00:00+02:00" }, // Do nachmittags, 5 Monate
      ],
    };
    expect(savedUnfitIds([mixed], birthDate, FIXTURE_NOW, { daytimes: ["vormittags"] }).has(mixed.id)).toBe(false);
    expect(savedUnfitIds([mixed], birthDate, FIXTURE_NOW, { daytimes: ["nachmittags"] }).has(mixed.id)).toBe(true);
  });
});

describe("recentlySaved (Plan 0057, E6)", () => {
  it("ordnet nach der Merk-Reihenfolge rückwärts: zuletzt gemerkt zuerst", () => {
    const ids = [id("krabbeltreff"), id("musikgarten-1"), id("pekip-herbst")];
    const items = savedOffers(file.offers, ids, FIXTURE_NOW, undefined);
    expect(recentlySaved(items, ids).map((i) => fixtureKey(i.offer))).toEqual([
      "pekip-herbst",
      "musikgarten-1",
      "krabbeltreff",
    ]);
  });
});

describe("savedOffers mit Zeitraum (Plan 0025, E3a)", () => {
  it("stellt ein Angebot an seinen Termin im Zeitraum und sortiert danach", () => {
    const ids = [id("krabbeltreff"), id("musikgarten-1")];
    const items = savedOffers(file.offers, ids, FIXTURE_NOW, undefined, { range: { from: "2026-11-01" } });
    // Treff am 4.11., Musikgarten am 5.11.; ohne Zeitraum stünde der Treff am 7.10.
    expect(items.map((i) => [fixtureKey(i.offer), berlinIsoDate(i.session.start)])).toEqual([
      ["krabbeltreff", "2026-11-04"],
      ["musikgarten-1", "2026-11-05"],
    ]);
  });
});

describe("Schnellfilter der Liste (Plan 0058, E1)", () => {
  const all = file.offers.map((o) => o.id);
  /** Termin zur Berliner Uhrzeit, eine Stunde lang */
  const at = (day: string, time: string) => {
    const start = fromBerlinLocal(`${day}T${time}`);
    return { start, end: new Date(Date.parse(start) + 3_600_000).toISOString() };
  };
  const today = berlinIsoDate(FIXTURE_NOW); // Mo 5.10.
  const make = (title: string, base: FixtureKey, sessions: Offer["sessions"], extra: Partial<Offer> = {}): Offer => ({
    ...fixtureOffer(base),
    id: `t${title.length}${title.slice(0, 3)}`,
    title,
    sessions,
    ...extra,
  });
  /** Titel der gemerkten Angebote, die zu den Chips passen, am gezeigten Termin nach `savedOffers` */
  const matching = (offers: readonly Offer[], chips: readonly SavedListChip[], now = FIXTURE_NOW) =>
    savedOffers(
      offers,
      offers.map((o) => o.id),
      now,
      undefined,
    )
      .filter((item) => matchesListChips(item, chips, now))
      .map((item) => item.offer.title);
  const keys = (chips: readonly SavedListChip[]) =>
    savedOffers(file.offers, all, FIXTURE_NOW, undefined)
      .filter((item) => matchesListChips(item, chips, FIXTURE_NOW))
      .map((item) => fixtureKey(item.offer) ?? item.offer.title.slice(0, 17));

  it("Reihenfolge der Chipzeile", () => {
    expect(SAVED_LIST_CHIPS).toEqual(["demnaechst", "anmelden", "spontan", "laeuft", "kurse", "einmalig"]);
  });

  it("ohne Chip passt alles", () => {
    expect(matching(file.offers, []).length).toBe(savedOffers(file.offers, all, FIXTURE_NOW, undefined).length);
  });

  it("„Demnächst“ in den Fixtures wie der frühere Abschnitt: PEKiP und der Workshop, nicht die Treffs", () => {
    expect(keys(["demnaechst"])).toEqual(["pekip-herbst", "babymassage-workshop"]);
  });

  it("„Demnächst“: Grenze nach Berliner Kalendertagen, 14. Tag 23:30 drin, 15. Tag 0:30 nicht", () => {
    expect(SOON_DAYS).toBe(14);
    const last = make("Am letzten Tag", "kuckuck-im-nest", [at(addDays(today, 14), "23:30")]);
    const after = make("Am Tag danach", "kuckuck-im-nest", [at(addDays(today, 15), "00:30")]);
    expect(matching([last, after], ["demnaechst"])).toEqual([last.title]);
  });

  it("„Demnächst“: ohne laufende Kurse und ohne Regelmäßiges ohne Anmeldung, mit Regelmäßigem mit Anmeldung", () => {
    const now = new Date("2026-10-27T08:00:00+01:00"); // Di; PEKiP läuft seit 13.10., nächster Termin heute
    const pekip = fixtureOffer("pekip-herbst");
    const day = berlinIsoDate(now);
    const withReg = make("Regelmäßig mit Anmeldung", "krabbeltreff", weeklySessions(addDays(day, 3), 3), {
      registration: "mit-anmeldung",
    });
    const open = make("Regelmäßig offen", "krabbeltreff", weeklySessions(addDays(day, 1), 3));
    const once = make("Bald offen", "babykonzert-advent", [at(addDays(day, 3), "10:00")]);
    expect(matching([pekip, withReg, open, once], ["demnaechst"], now)).toEqual([withReg.title, once.title]);
  });

  it("„Anmelden“: mit Anmeldung ohne laufende Kurse, auch wenn der Termin bald ist", () => {
    const now = new Date("2026-10-27T08:00:00+01:00");
    const pekip = fixtureOffer("pekip-herbst"); // läuft, mit Anmeldung
    const soon = make("Bald mit Anmeldung", "kuckuck-im-nest", [at(addDays(berlinIsoDate(now), 2), "10:00")]);
    expect(soon.registration).toBe("mit-anmeldung");
    expect(matching([pekip, soon], ["anmelden"], now)).toEqual([soon.title]);
  });

  it("„Spontan“: ohne Anmeldung, auch ein laufender Kurs ohne Anmeldung", () => {
    const now = new Date("2026-10-27T08:00:00+01:00");
    const running = make(
      "Laufender Kurs ohne Anmeldung",
      "pekip-herbst",
      [at("2026-10-01", "10:00"), at("2026-10-30", "10:00")],
      { registration: "ohne-anmeldung" },
    );
    const open = make("Regelmäßig offen", "krabbeltreff", weeklySessions(addDays(berlinIsoDate(now), 1), 3));
    const pekip = fixtureOffer("pekip-herbst");
    // nach gezeigtem Termin: der Treff morgen, der laufende Kurs am 30.10.
    expect(matching([running, open, pekip], ["spontan"], now)).toEqual([open.title, running.title]);
  });

  it("„Läuft gerade“: begonnene Kurse, mit oder ohne Anmeldung", () => {
    const now = new Date("2026-10-27T08:00:00+01:00");
    const pekip = fixtureOffer("pekip-herbst");
    const running = make(
      "Laufender Kurs ohne Anmeldung",
      "pekip-herbst",
      [at("2026-10-01", "10:00"), at("2026-10-30", "10:00")],
      { registration: "ohne-anmeldung" },
    );
    const musik = fixtureOffer("musikgarten-1"); // beginnt 5.11.
    expect(matching([pekip, running, musik], ["laeuft"], now)).toEqual([pekip.title, running.title]);
  });

  it("„Kurse“ und „Einmalig“ nach dem Format", () => {
    const formats = (chips: readonly SavedListChip[]) =>
      savedOffers(file.offers, all, FIXTURE_NOW, undefined)
        .filter((item) => matchesListChips(item, chips, FIXTURE_NOW))
        .map((item) => item.offer.format);
    expect(new Set(formats(["kurse"]))).toEqual(new Set(["kurs"]));
    expect(new Set(formats(["einmalig"]))).toEqual(new Set(["einmalig"]));
    expect(new Set(formats(["kurse", "einmalig"]))).toEqual(new Set(["kurs", "einmalig"]));
  });

  it("ODER in der Gruppe, UND zwischen Gruppen", () => {
    const union = (a: SavedListChip, b: SavedListChip) => new Set([...keys([a]), ...keys([b])]);
    expect(new Set(keys(["anmelden", "spontan"]))).toEqual(union("anmelden", "spontan"));
    expect(new Set(keys(["demnaechst", "laeuft"]))).toEqual(union("demnaechst", "laeuft"));
    const both = keys(["demnaechst", "anmelden"]);
    expect(both).toEqual(keys(["demnaechst"]).filter((k) => keys(["anmelden"]).includes(k)));
    expect(keys(["laeuft", "einmalig"])).toEqual([]);
  });

  it("„Läuft gerade“ + „Anmelden“ ist immer leer: „Anmelden“ schließt laufende Kurse aus (Review 2 m2)", () => {
    const now = new Date("2026-10-27T08:00:00+01:00");
    const pekip = fixtureOffer("pekip-herbst"); // läuft, mit Anmeldung
    const soon = make("Bald mit Anmeldung", "kuckuck-im-nest", [at(addDays(berlinIsoDate(now), 2), "10:00")]);
    expect(matching([pekip, soon], ["laeuft"], now)).toEqual([pekip.title]);
    expect(matching([pekip, soon], ["anmelden"], now)).toEqual([soon.title]);
    expect(matching([pekip, soon], ["laeuft", "anmelden"], now)).toEqual([]);
  });

  it("isSoon prüft den gezeigten Termin, nicht den ersten", () => {
    // Einmalig mit zwei Terminen: der erste ist vorbei, der gezeigte liegt in 20 Tagen
    const offer = make("Zwei Termine", "kuckuck-im-nest", [
      at(addDays(today, -1), "10:00"),
      at(addDays(today, 20), "10:00"),
    ]);
    const [item] = savedOffers([offer], [offer.id], FIXTURE_NOW, undefined);
    expect(item && berlinIsoDate(item.session.start)).toBe(addDays(today, 20));
    expect(item && isSoon(item, FIXTURE_NOW)).toBe(false);
  });
});

describe("followUpFilter (Plan 0057, E8)", () => {
  it("Kurs, Kategorie des Kurses, ab dem Tag nach dem letzten Termin; sonst nichts", () => {
    // PEKiP endet Di 1.12.
    expect(followUpFilter(fixtureOffer("pekip-herbst"))).toEqual({
      ...EMPTY_FILTER,
      formats: ["kurs"],
      categories: ["babykurse"],
      range: { from: "2026-12-02" },
    });
  });

  it("der letzte Tag zählt nach Berlin (0:30 Uhr ist in Los Angeles noch der Vortag)", () => {
    const offer = {
      ...fixtureOffer("pekip-herbst"),
      sessions: [
        session("2026-11-03"),
        {
          start: fromBerlinLocal("2026-11-10T00:30"),
          end: fromBerlinLocal("2026-11-10T01:30"),
        },
      ],
    };
    expect(followUpFilter(offer).range).toEqual({ from: "2026-11-11" });
  });
});
