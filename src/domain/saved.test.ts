import { describe, expect, it } from "vitest";
import { offerFitsAge } from "./age.ts";
import { upcomingSessions } from "./agenda.ts";
import { collectionExport, exportSessions, savedOffers, seriesExport, toggleId } from "./saved.ts";
import type { Offer } from "./schema.ts";
import { FIXTURE_NOW, fixtureKey, fixtureOffer, loadFixtures } from "./test-fixtures.ts";
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
