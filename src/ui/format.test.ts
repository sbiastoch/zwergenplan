import { describe, expect, it } from "vitest";
import type { Origin, Reach } from "../domain/reach.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { addDays, fromBerlinLocal } from "../domain/time.ts";
// nur im Test: Konstanten der Rechnung gegen den Text (src/ui importiert transit.ts sonst nur per import())
import { ACCESS_METERS, TRANSFER_PENALTY_MINUTES, TRANSIT_RULE } from "../domain/transit.ts";
import type { TransitOther } from "../domain/transit-types.ts";
import {
  ageChipLabel,
  agendaHeading,
  ageOnlyNote,
  ageRangeLabel,
  ageWarnText,
  availabilityLabel,
  clock,
  dayHeading,
  formatFact,
  hiddenNote,
  limitHint,
  limitReason,
  loadErrorText,
  mapStatusParts,
  originHint,
  originPhrase,
  plural,
  providerStatusParts,
  reachLimitLabel,
  reachLong,
  reachNote,
  reachShort,
  registrationNote,
  shortDate,
  standDate,
  timeRange,
  transitSourceNote,
  wayParts,
  weekTitle,
  whenLabels,
} from "./format.ts";
import type { ReachMode } from "./use-transit.ts";

// Eigene Testangebote statt der Zod-Fixtures: src/ui bleibt zod-frei (no-zod-in-client), auch im Test.
const FIXTURE_NOW = new Date("2026-10-05T12:00:00+02:00");

/** Termine alle `step` Tage ab `firstDay`, Berliner Ortszeit */
function sessions(firstDay: string, count: number, step: number, from = "10:00", to = "11:00") {
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(firstDay, i * step);
    return { start: fromBerlinLocal(`${day}T${from}`), end: fromBerlinLocal(`${day}T${to}`) };
  });
}

function offer(fields: Pick<SiteOffer, "format" | "sessions"> & Partial<SiteOffer>): SiteOffer {
  return {
    id: "anbieter--titel--ort",
    providerId: "anbieter",
    venueId: "ort",
    title: "Titel",
    summary: "Zusammenfassung",
    topics: ["musik"],
    registration: "mit-anmeldung",
    cost: "kostenlos",
    availability: { status: "unbekannt", checkedAt: "2026-10-03T10:00:00+02:00" },
    url: "https://example.org/",
    sourceUrl: "https://example.org/",
    providerName: "Anbieter",
    venue: { name: "Ort", address: "Beispielweg 1", ring: "innen", geo: { lat: 49.45, lon: 11.08 } },
    ...fields,
  };
}

const OFFERS = {
  kurs: offer({ format: "kurs", sessions: sessions("2026-10-13", 8, 7, "09:30", "11:00") }),
  woechentlich: offer({ format: "regelmaessig", sessions: sessions("2026-10-07", 5, 7) }),
  vierzehntaegig: offer({ format: "regelmaessig", sessions: sessions("2026-10-09", 4, 14) }),
  einmalig: offer({ format: "einmalig", sessions: sessions("2026-12-06", 1, 0) }),
  wenige: offer({
    format: "einmalig",
    sessions: sessions("2026-10-17", 1, 0),
    availability: { status: "wenige", checkedAt: "2026-10-03T10:00:00+02:00" },
  }),
  ohneAnmeldung: offer({
    format: "einmalig",
    sessions: sessions("2026-10-17", 1, 0),
    availability: { status: "ohne-anmeldung", checkedAt: "2026-10-03T10:00:00+02:00" },
  }),
};

describe("Texte in fremder Zeitzone (Test läuft in America/Los_Angeles)", () => {
  it("nennt Berliner Uhrzeiten, auch über die Zeitumstellung", () => {
    expect(clock("2026-10-20T09:30:00+02:00")).toBe("9:30");
    expect(clock("2026-10-27T09:30:00+01:00")).toBe("9:30");
    expect(timeRange({ start: "2026-10-07T10:00:00+02:00", end: "2026-10-07T11:30:00+02:00" })).toBe("10:00–11:30");
  });

  it("benennt Tagesgruppen relativ zu heute", () => {
    expect(dayHeading("2026-10-05", "2026-10-05")).toEqual({ title: "Heute", sub: "Montag, 5. Oktober" });
    expect(dayHeading("2026-10-06", "2026-10-05")).toEqual({ title: "Morgen", sub: "Dienstag, 6. Oktober" });
    expect(dayHeading("2026-10-07", "2026-10-05")).toEqual({ title: "Mittwoch", sub: "7. Oktober" });
    expect(agendaHeading("2026-10-05", "2026-10-05")).toBe("Heute, 5. Oktober");
    expect(agendaHeading("2026-10-07", "2026-10-05")).toBe("Mittwoch, 7. Oktober");
  });

  it("schreibt Kurzdaten, Wochen und den Datenstand", () => {
    expect(shortDate("2026-10-06")).toBe("Di 6.10.");
    expect(weekTitle(["2026-10-05", "2026-10-11"])).toBe("5.–11. Oktober");
    expect(weekTitle(["2026-10-26", "2026-11-01"])).toBe("26. Okt. – 1. Nov.");
    expect(standDate("2026-10-03T23:30:00Z")).toBe("4.10.2026");
  });
});

describe("Fakten", () => {
  it("beschreibt Format und Rhythmus", () => {
    expect(formatFact(OFFERS.kurs, FIXTURE_NOW)).toBe("Kurs · 8 Termine");
    expect(formatFact(OFFERS.kurs, new Date("2026-11-11T12:00:00+01:00"))).toBe("Kurs · noch 3 von 8");
    expect(formatFact(OFFERS.woechentlich, FIXTURE_NOW)).toBe("Jeden Mittwoch");
    expect(formatFact(OFFERS.vierzehntaegig, FIXTURE_NOW)).toBe("Freitags");
    expect(formatFact(OFFERS.einmalig, FIXTURE_NOW)).toBe("Einmalig");
  });

  it("zeigt nur aussagekräftige Verfügbarkeit", () => {
    expect(availabilityLabel(OFFERS.wenige)).toBe("Wenige Plätze");
    expect(availabilityLabel(OFFERS.ohneAnmeldung)).toBeUndefined();
    expect(availabilityLabel(OFFERS.kurs)).toBeUndefined();
  });

  it("formuliert Alter und Mengen", () => {
    expect(ageRangeLabel(undefined)).toBe("0–36 Monate");
    expect(ageRangeLabel({ minMonths: 6, maxMonths: 24 })).toBe("6–24 Monate");
    expect(ageChipLabel(undefined)).toBe("Alter?");
    expect(ageChipLabel(11)).toBe("11 Mon.");
    expect(ageChipLabel(26)).toBe("2 J.");
    expect(plural(1, "Angebot", "Angebote")).toBe("1 Angebot");
    expect(plural(3, "Angebot", "Angebote")).toBe("3 Angebote");
  });
});

describe("Detail: Wann und Anmeldung", () => {
  it("nennt beim einmaligen Termin Datum und Uhrzeit", () => {
    expect(whenLabels(OFFERS.einmalig, FIXTURE_NOW)).toEqual({ main: "Sonntag, 6. Dezember", sub: "10:00–11:00 Uhr" });
  });

  it("fasst einen Kurs zusammen, Uhrzeit nur, wenn sie immer gleich ist", () => {
    expect(whenLabels(OFFERS.kurs, FIXTURE_NOW)).toEqual({
      main: "Kurs mit 8 Terminen",
      sub: "Di 13.10. bis Di 1.12., jeweils 9:30–11:00",
    });
    const wechselnd = offer({
      format: "kurs",
      sessions: [...sessions("2026-10-13", 2, 7, "09:30", "11:00"), ...sessions("2026-10-27", 2, 7, "10:00", "11:30")],
    });
    expect(whenLabels(wechselnd, FIXTURE_NOW)).toEqual({ main: "Kurs mit 4 Terminen", sub: "Di 13.10. bis Di 3.11." });
  });

  it("zeigt beim laufenden Kurs den Fortschritt wie die Kachel, beim beendeten „vorbei“ (H8)", () => {
    const sub = "Di 13.10. bis Di 1.12., jeweils 9:30–11:00";
    // 20.10. 12:00: zwei von acht Terminen sind beendet
    expect(whenLabels(OFFERS.kurs, new Date("2026-10-20T12:00:00+02:00"))).toEqual({
      main: "Kurs · noch 6 von 8 Terminen",
      sub,
    });
    // erster Termin läuft gerade: noch nicht begonnen im Sinne der Zählung
    expect(whenLabels(OFFERS.kurs, new Date("2026-10-13T10:00:00+02:00")).main).toBe("Kurs mit 8 Terminen");
    expect(whenLabels(OFFERS.kurs, new Date("2026-12-24T12:00:00+01:00"))).toEqual({
      main: "Kurs mit 8 Terminen – vorbei",
      sub,
    });
  });

  it("beschreibt regelmäßige Termine nach Rhythmus und zählt nur kommende", () => {
    expect(whenLabels(OFFERS.woechentlich, FIXTURE_NOW)).toEqual({
      main: "Jeden Mittwoch, 10:00–11:00",
      sub: "5 kommende Termine",
    });
    expect(whenLabels(OFFERS.vierzehntaegig, FIXTURE_NOW)).toEqual({
      main: "Freitags, 10:00–11:00",
      sub: "4 kommende Termine",
    });
    expect(whenLabels(OFFERS.vierzehntaegig, new Date("2026-10-24T12:00:00+02:00"))).toEqual({
      main: "Freitags, 10:00–11:00",
      sub: "2 kommende Termine",
    });
    const offen = offer({ ...OFFERS.woechentlich, registration: "ohne-anmeldung" });
    expect(whenLabels(offen, FIXTURE_NOW).sub).toBe("Einzeln besuchbar");
  });

  it("nennt die Uhrzeit, wenn alle kommenden Termine dieselbe haben (B1)", () => {
    const gemischt = offer({
      format: "regelmaessig",
      sessions: [...sessions("2026-10-12", 1, 0, "10:30", "11:00"), ...sessions("2026-10-14", 2, 7, "10:30", "11:00")],
    });
    expect(whenLabels(gemischt, FIXTURE_NOW).main).toBe("Regelmäßig, 10:30–11:00");
    const einer = offer({ format: "regelmaessig", sessions: sessions("2026-10-16", 1, 0, "15:00", "16:30") });
    expect(whenLabels(einer, FIXTURE_NOW).main).toBe("Regelmäßig, 15:00–16:30");
  });

  it("lässt die Uhrzeit weg, wenn sie wechselt", () => {
    const wechselnd = offer({
      format: "regelmaessig",
      sessions: [...sessions("2026-10-09", 1, 0, "10:30", "11:00"), ...sessions("2026-10-23", 1, 0, "15:00", "16:00")],
    });
    expect(whenLabels(wechselnd, FIXTURE_NOW).main).toBe("Freitags");
    const gemischt = offer({
      format: "regelmaessig",
      sessions: [...sessions("2026-10-12", 1, 0, "10:30", "11:00"), ...sessions("2026-10-14", 1, 0, "15:00", "16:00")],
    });
    expect(whenLabels(gemischt, FIXTURE_NOW).main).toBe("Regelmäßig");
  });

  it("nennt ohne kommenden Termin keine Uhrzeit, obwohl uniformTimes([]) wahr ist", () => {
    expect(whenLabels(OFFERS.woechentlich, new Date("2027-01-01T00:00:00+01:00"))).toEqual({
      main: "Regelmäßig",
      sub: "0 kommende Termine",
    });
  });

  it("zählt nur kommende Termine für die Uhrzeit: ein vergangener Ausreißer stört nicht", () => {
    const verschoben = offer({
      format: "regelmaessig",
      sessions: [...sessions("2026-10-02", 1, 0, "15:00", "16:00"), ...sessions("2026-10-09", 3, 7, "10:30", "11:00")],
    });
    expect(whenLabels(verschoben, FIXTURE_NOW).main).toBe("Jeden Freitag, 10:30–11:00");
  });

  it("nennt das Anmeldefenster als Berliner Tage, sonst einen Hinweis", () => {
    const fenster = (registrationWindow?: NonNullable<SiteOffer["registrationWindow"]>, now = FIXTURE_NOW) =>
      registrationNote(offer({ ...OFFERS.kurs, ...(registrationWindow ? { registrationWindow } : {}) }), now);
    // bald
    expect(fenster({ opens: "2026-10-10T00:30:00+02:00", deadline: "2026-10-20T23:30:00+02:00" })).toBe(
      "Anmeldung ab 10.10., bis 20.10.",
    );
    expect(fenster({ opens: "2026-10-10T00:30:00+02:00" })).toBe("Anmeldung ab 10.10.");
    // offen mit bzw. ohne Anmeldeschluss
    expect(fenster({ deadline: "2026-10-20T23:30:00+02:00" })).toBe("Anmeldung bis 20.10.");
    expect(
      fenster(
        { opens: "2026-10-10T00:30:00+02:00", deadline: "2026-10-20T23:30:00+02:00" },
        new Date("2026-10-12T12:00:00+02:00"),
      ),
    ).toBe("Anmeldung bis 20.10.");
    expect(fenster({ opens: "2026-10-01T08:00:00+02:00" })).toBe("Anmeldung ab 1.10.");
    // ohne Fenster
    expect(fenster()).toBe("Beim Anbieter");
    expect(registrationNote(OFFERS.ohneAnmeldung, FIXTURE_NOW)).toBe("Beim Anbieter");
    expect(registrationNote(offer({ ...OFFERS.einmalig, registration: "ohne-anmeldung" }), FIXTURE_NOW)).toBe(
      "Einfach vorbeikommen",
    );
  });

  it("sagt nach Ablauf der Frist, dass sie vorbei ist (B4)", () => {
    const pekip = offer({ ...OFFERS.kurs, registrationWindow: { deadline: "2026-10-09T23:59:00+02:00" } });
    expect(registrationNote(pekip, new Date("2026-10-09T23:59:00+02:00"))).toBe("Anmeldung bis 9.10.");
    expect(registrationNote(pekip, new Date("2026-10-10T12:00:00+02:00"))).toBe("Anmeldeschluss war am 9.10.");
    const mitStart = offer({
      ...OFFERS.kurs,
      registrationWindow: { opens: "2026-09-01T08:00:00+02:00", deadline: "2026-10-09T23:59:00+02:00" },
    });
    expect(registrationNote(mitStart, new Date("2026-10-10T12:00:00+02:00"))).toBe("Anmeldeschluss war am 9.10.");
  });
});

describe("Entfernung und Wegzeit (Plan 0004, E6; Plan 0009, E1/E8/E11)", () => {
  const luftlinie = (meters: number): Reach => ({ kind: "luftlinie", meters });
  const oepnv = (minutes: number, byFoot = false): Reach => ({ kind: "oepnv", minutes, byFoot });
  const gostenhof: Origin = {
    source: "stadtteil",
    point: { lat: 49.448, lon: 11.058 },
    label: "Gostenhof",
    districtId: "gostenhof",
  };
  const standort: Origin = { source: "standort", point: { lat: 49.452, lon: 11.077 }, label: "Mein Standort" };
  const karte: Origin = { source: "karte", point: { lat: 49.452, lon: 11.077 }, label: "Kartenmitte" };

  it("kurz für die Kachel: Luftlinie gerundet mit deutschem Komma", () => {
    expect(reachShort(luftlinie(0))).toBe("100 m");
    expect(reachShort(luftlinie(226))).toBe("200 m");
    expect(reachShort(luftlinie(400))).toBe("400 m");
    expect(reachShort(luftlinie(1427))).toBe("1,4 km");
    expect(reachShort(luftlinie(2000))).toBe("2 km");
    expect(reachShort(luftlinie(9960))).toBe("10 km");
    expect(reachShort(luftlinie(12_400))).toBe("12 km");
  });

  it("kurz für die Kachel: Wegzeit gerundet, über 2 Std.", () => {
    expect(reachShort(oepnv(23))).toBe("25 Min.");
    expect(reachShort(oepnv(13.6))).toBe("15 Min.");
    expect(reachShort(oepnv(0, true))).toBe("5 Min.");
    expect(reachShort(oepnv(64))).toBe("60 Min.");
    expect(reachShort(oepnv(121))).toBe("über 2 Std.");
    expect(reachShort(oepnv(Number.POSITIVE_INFINITY))).toBe("über 2 Std.");
  });

  it("nennt den Startpunkt", () => {
    expect(originPhrase(gostenhof)).toBe("ab Gostenhof");
    expect(originPhrase(standort)).toBe("ab deinem Standort");
    expect(originPhrase(karte)).toBe("ab der Kartenmitte");
  });

  /** Teile von `reachLong` als sichtbarer Text, mit Pfeil wie `ReachLong` (Plan 0012, E10) */
  const long = (reach: Reach, origin: Origin) => {
    const { before, lines, after } = reachLong(reach, origin);
    return `${before}${(lines ?? []).join("\u00a0→ ")}${after}`;
  };
  const NB = "\u00a0";
  const withLines = (minutes: number, lines: [string] | [string, string]): Reach => ({
    kind: "oepnv",
    minutes,
    byFoot: false,
    lines,
  });

  it("lang fürs Detail: sagt, was gemeint ist (E1)", () => {
    expect(long(oepnv(23), gostenhof)).toBe("ca. 25 Min. mit Bus & Bahn ab Gostenhof");
    expect(long(oepnv(9.6, true), standort)).toBe("ca. 10 Min. zu Fuß ab deinem Standort");
    expect(long(oepnv(31), karte)).toBe("ca. 30 Min. mit Bus & Bahn ab der Kartenmitte");
    expect(long(luftlinie(1427), gostenhof)).toBe("ca. 1,4 km Luftlinie ab Gostenhof");
    expect(long(luftlinie(226), standort)).toBe("ca. 200 m Luftlinie ab deinem Standort");
    expect(long(luftlinie(1427), karte)).toBe("ca. 1,4 km Luftlinie ab der Kartenmitte");
    expect(reachLong(oepnv(23), gostenhof).lines).toBeUndefined();
  });

  it("nennt eine oder zwei Linien als eigene Teile (Plan 0012, E10, F1)", () => {
    expect(reachLong(withLines(23, [`Bus${NB}37`, "U1"]), gostenhof)).toEqual({
      before: "ca. 25 Min. mit ",
      lines: [`Bus${NB}37`, "U1"],
      after: " ab Gostenhof",
    });
    expect(long(withLines(13.6, [`Tram${NB}1`]), karte)).toBe(`ca. 15 Min. mit Tram${NB}1 ab der Kartenmitte`);
    expect(long(withLines(23, [`Bus${NB}37`, "U1"]), gostenhof)).toBe(
      `ca. 25 Min. mit Bus${NB}37${NB}→ U1 ab Gostenhof`,
    );
  });

  it("zu Fuß ignoriert Linien", () => {
    const foot: Reach = { kind: "oepnv", minutes: 9.6, byFoot: true, lines: [`Tram${NB}1`] };
    expect(reachLong(foot, standort)).toEqual({ before: "ca. 10 Min. zu Fuß ab deinem Standort", after: "" });
  });

  it("über 2 Std. oder ohne Weg: neutral mit „höchstens 1 Umstieg“, ohne Linien", () => {
    expect(long(oepnv(130), gostenhof)).toBe("über 2 Std. ab Gostenhof (mit höchstens 1 Umstieg)");
    expect(long(oepnv(Number.POSITIVE_INFINITY), gostenhof)).toBe("über 2 Std. ab Gostenhof (mit höchstens 1 Umstieg)");
    expect(reachLong(withLines(130, ["U1"]), gostenhof).lines).toBeUndefined();
  });

  describe("Karte „Wege ab …“ (Plan 0019, E6)", () => {
    const base: { kind: "oepnv"; byFoot: false } = { kind: "oepnv", byFoot: false };

    it("ohne andere Wege keine Karte", () => {
      expect(wayParts(withLines(23, ["U1"]), gostenhof)).toBeUndefined();
      expect(wayParts(luftlinie(800), gostenhof)).toBeUndefined();
    });

    it("Bus & Bahn ohne Linien oder Halt: keine Karte, nie als „zu Fuß“ umgedeutet (Arch-Review 0019, m1)", () => {
      const foot = { byFoot: true, minutes: 40 } satisfies TransitOther;
      expect(wayParts({ ...base, minutes: 29.6, others: [foot] }, gostenhof)).toBeUndefined();
      expect(wayParts({ ...base, minutes: 29.6, lines: ["U1"], others: [foot] }, gostenhof)).toBeUndefined();
    });

    it("Hauptweg zuerst, mit Linien, Umstieg aus dem Bit und Fußweg zum Halt; zu Fuß als eigene Zeile", () => {
      const reach: Reach = {
        ...base,
        minutes: 29.6,
        lines: [`Tram${NB}1`, `Bus${NB}2`],
        toStop: 1.58,
        transfer: true,
        others: [{ byFoot: true, minutes: 40.9 }],
      };
      expect(wayParts(reach, gostenhof)).toEqual({
        title: "Wege ab Gostenhof",
        rows: [
          {
            minutes: "ca. 30 Min.",
            lines: [`Tram${NB}1`, `Bus${NB}2`],
            extra: ["1 Umstieg", "2 Min. zum Halt"],
            main: true,
          },
          { minutes: "ca. 40 Min.", extra: ["zu Fuß"], main: false },
        ],
        reason: undefined,
      });
    });

    it("„1 Umstieg“ auch bei nur einer Linie; „zum Halt“ gerundet, mindestens 1", () => {
      const reach: Reach = {
        ...base,
        minutes: 15.9,
        lines: [`Bus${NB}202E`],
        toStop: 5.89,
        others: [{ byFoot: false, minutes: 17.3, toStop: 0.4, lines: ["U1"], transfer: true }],
      };
      expect(wayParts(reach, standort)?.rows).toEqual([
        { minutes: "ca. 15 Min.", lines: [`Bus${NB}202E`], extra: ["6 Min. zum Halt"], main: true },
        { minutes: "ca. 15 Min.", lines: ["U1"], extra: ["1 Umstieg", "1 Min. zum Halt"], main: false },
      ]);
      expect(wayParts(reach, standort)?.title).toBe("Wege ab deinem Standort");
    });

    it("Hauptweg zu Fuß", () => {
      const reach: Reach = {
        ...base,
        byFoot: true,
        minutes: 7,
        others: [{ byFoot: false, minutes: 11.7, toStop: 1.7, lines: ["U1"] }],
      };
      expect(wayParts(reach, karte)?.rows).toEqual([
        { minutes: "ca. 5 Min.", extra: ["zu Fuß"], main: true },
        { minutes: "ca. 10 Min.", lines: ["U1"], extra: ["2 Min. zum Halt"], main: false },
      ]);
    });

    it("Grund nur, wenn ein anderer Weg in der Anzeige schneller ist", () => {
      const reach = (other: number): Reach => ({
        ...base,
        minutes: 31.9,
        lines: [`Tram${NB}4`],
        toStop: 6.9,
        others: [{ byFoot: false, minutes: other, toStop: 1.7, lines: ["U1"], transfer: true }],
      });
      expect(wayParts(reach(23.7), gostenhof)?.reason).toBe(
        "Vorschlag: direkt vor Umstieg, wenn der Umstieg nur wenig Zeit spart",
      );
      // 31,2 und 31,9 zeigen beide „ca. 30 Min.“
      expect(wayParts(reach(31.2), gostenhof)?.reason).toBeUndefined();
    });
  });

  it("Statuszeile je Modus: nur der Startpunkt, im Rückfall mit Grund (E11; Plan 0020, E1)", () => {
    expect(reachNote({ kind: "oepnv" }, gostenhof)).toBe("Wegzeit ab Gostenhof");
    expect(reachNote({ kind: "oepnv" }, standort)).toBe("Wegzeit ab deinem Standort");
    expect(reachNote({ kind: "oepnv" }, karte)).toBe("Wegzeit ab der Kartenmitte");
    // lädt: derselbe Text, unsichtbar (die Breite steht schon)
    expect(reachNote({ kind: "laedt" }, gostenhof)).toBe("Wegzeit ab Gostenhof");
    expect(reachNote({ kind: "luftlinie", reason: "fehler" }, gostenhof)).toBe(
      "Luftlinie ab Gostenhof (Wegzeiten gerade nicht verfügbar)",
    );
    expect(reachNote({ kind: "luftlinie", reason: "ausserhalb" }, standort)).toBe(
      "Luftlinie ab deinem Standort (außerhalb des Stadtgebiets)",
    );
    expect(reachNote({ kind: "luftlinie", reason: "ausserhalb" }, karte)).toBe(
      "Luftlinie ab der Kartenmitte (außerhalb des Stadtgebiets)",
    );
  });

  it("beschriftet die Wegzeit-Grenze", () => {
    expect(reachLimitLabel({ kind: "minuten", value: 20 })).toBe("bis 20 Min.");
    expect(reachLimitLabel({ kind: "minuten", value: 45 })).toBe("bis 45 Min.");
  });

  it("Begründung unter gesperrten Chips je Modus (M6)", () => {
    expect(limitReason(undefined)).toBe("Erst einen Startpunkt wählen.");
    expect(limitReason({ kind: "laedt" })).toBe("Wegzeiten werden geladen …");
    expect(limitReason({ kind: "luftlinie", reason: "fehler" })).toBe("Wegzeiten gerade nicht verfügbar.");
    expect(limitReason({ kind: "luftlinie", reason: "ausserhalb" })).toBe(
      "Wegzeiten gibt es nur für Startpunkte im Stadtgebiet Nürnberg.",
    );
    expect(limitReason({ kind: "oepnv" })).toBeUndefined();
  });

  it("Hinweis unter der Statuszeile, wenn wegzeit= nicht wirkt (E11)", () => {
    const at30 = { kind: "minuten", value: 30 } as const;
    expect(limitHint(at30, undefined)).toBe("„bis 30 Min.“ braucht einen Startpunkt.");
    expect(limitHint(at30, { kind: "luftlinie", reason: "fehler" })).toBe(
      "„bis 30 Min.“ wirkt gerade nicht: Wegzeiten nicht geladen.",
    );
    expect(limitHint(at30, { kind: "luftlinie", reason: "ausserhalb" })).toBe(
      "„bis 30 Min.“ wirkt nicht: Startpunkt außerhalb des Stadtgebiets.",
    );
    // lädt: Platzhalter-Block statt Hinweis; mit Wegzeit wirkt die Grenze
    expect(limitHint(at30, { kind: "laedt" })).toBeUndefined();
    expect(limitHint(at30, { kind: "oepnv" })).toBeUndefined();
  });
});

describe("Quellenhinweis der Wegzeit (Plan 0009, E3: CC BY-SA 3.0 DE, 4a und 4c)", () => {
  const source = {
    attribution: "VGN – Verkehrsverbund Großraum Nürnberg GmbH",
    title: "VGN-Soll-Daten vom 24.06.2026",
    url: "https://www.vgn.de/web-entwickler/open-data/",
    license: "CC BY-SA 3.0 DE",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/de/",
    validFrom: "2026-06-24",
    validTo: "2026-12-12",
    // Satz zum Modell: setzt erst decodeTransitTable (Lazy-Chunk, TRANSIT_RULE); hier ein Platzhalter
    rule: "Regel.",
  };
  const text = (parts: ReturnType<typeof transitSourceNote>) =>
    parts.map((p) => (typeof p === "string" ? p : p.text)).join("");
  const links = (parts: ReturnType<typeof transitSourceNote>) => parts.filter((p) => typeof p !== "string");

  it("nennt Rechteinhaber, Titel mit Stand, „abgewandelt“ und die Lizenz, beide als Link", () => {
    const parts = transitSourceNote(source);
    expect(text(parts)).toBe(
      "Regel. " +
        "Fahrplan: VGN – Verkehrsverbund Großraum Nürnberg GmbH, ‚VGN-Soll-Daten vom 24.06.2026‘, abgewandelt, " +
        "Lizenz CC BY-SA 3.0 DE.",
    );
    expect(links(parts)).toEqual([
      { text: "VGN-Soll-Daten vom 24.06.2026", href: "https://www.vgn.de/web-entwickler/open-data/" },
      { text: "CC BY-SA 3.0 DE", href: "https://creativecommons.org/licenses/by-sa/3.0/de/", nowrap: true },
    ]);
  });

  it("nennt den Satz zum Modell aus der Domäne, mit 10 Min. und 1,5 km aus den Konstanten (Arch-Review 0012, H7)", () => {
    const parts = transitSourceNote({ ...source, rule: TRANSIT_RULE });
    expect(text(parts)).toMatch(
      /^Geschätzte Wegzeit mit Bus & Bahn oder zu Fuß für einen Dienstagvormittag, inklusive Warten\. /,
    );
    expect(text(parts)).toContain(`${TRANSIT_RULE} Fahrplan: `);
    expect(TRANSIT_RULE).toContain(`mindestens ${TRANSFER_PENALTY_MINUTES} Min. spart`);
    expect(TRANSIT_RULE).toContain(`bis ${String(ACCESS_METERS / 1000).replace(".", ",")} km zum und vom Halt`);
    // ohne Erklärung (Tabelle noch nicht dekodiert) nur die Quelle
    const { rule: _rule, ...plain } = source;
    expect(text(transitSourceNote(plain))).toMatch(/^Fahrplan: VGN/);
  });

  it("lange Lizenz-Bezeichnung aus den Daten darf umbrechen (N4)", () => {
    const long = { ...source, license: "Datenlizenz Deutschland – Namensnennung – Version 2.0" };
    expect(links(transitSourceNote(long)).at(-1)).toEqual({ text: long.license, href: long.licenseUrl });
  });

  it("entsteht aus `source`, nicht fest im Code", () => {
    const fixture = { ...source, attribution: "Fiktive Testdaten", title: "Fiktiver Fahrplan", license: "CC0 1.0" };
    expect(text(transitSourceNote(fixture))).toContain("Fahrplan: Fiktive Testdaten, ‚Fiktiver Fahrplan‘, abgewandelt");
    expect(text(transitSourceNote(fixture))).toContain("Lizenz CC0 1.0.");
  });

  it("ohne geladene Tabelle: VGN und Lizenz, beide als Link (die Erklärung kommt mit der Tabelle)", () => {
    const parts = transitSourceNote(undefined);
    expect(text(parts)).toBe("Fahrplan: VGN – Verkehrsverbund Großraum Nürnberg GmbH, CC BY-SA 3.0 DE.");
    expect(links(parts)).toEqual([
      { text: "VGN – Verkehrsverbund Großraum Nürnberg GmbH", href: "https://www.vgn.de/web-entwickler/open-data/" },
      { text: "CC BY-SA 3.0 DE", href: "https://creativecommons.org/licenses/by-sa/3.0/de/", nowrap: true },
    ]);
  });
});

describe("Karte und Orte (Plan 0005, E7)", () => {
  it("Statuszeile: Angebote an Orten, Singular und Plural", () => {
    expect(mapStatusParts(8, 5)).toEqual([8, " Angebote an ", 5, " Orten"]);
    expect(mapStatusParts(1, 1).join("")).toBe("1 Angebot an 1 Ort");
    expect(mapStatusParts(0, 0).join("")).toBe("0 Angebote an 0 Orten");
  });
});

describe("Statuszeile im Tab „Anbieter“ (Plan 0010, E4)", () => {
  it("nennt Anbieter und Angebote, die Zahlen getrennt", () => {
    expect(providerStatusParts(5, 8)).toEqual([5, " Anbieter mit ", 8, " Angeboten"]);
    expect(providerStatusParts(1, 1).join("")).toBe("1 Anbieter mit 1 Angebot");
    expect(providerStatusParts(0, 0).join("")).toBe("0 Anbieter mit 0 Angeboten");
  });
});

describe("Fehlerzustand (Plan 0008, E5)", () => {
  it("erklärt jede Fehlerart auf Deutsch, ohne Browsertext", () => {
    expect(loadErrorText("offline")).toBe(
      "Du bist gerade offline. Sobald das Netz wieder da ist, tippe auf ‚Nochmal versuchen‘.",
    );
    expect(loadErrorText("netz")).toBe("Die Verbindung ist abgebrochen. Versuch es gleich nochmal.");
    expect(loadErrorText("server")).toBe("Die Angebote ließen sich gerade nicht laden. Versuch es später nochmal.");
    for (const reason of ["offline", "netz", "server"] as const) {
      expect(loadErrorText(reason)).not.toMatch(/fetch|load|failed|error|network/i);
    }
  });
});

describe("Kalender: ausgeblendete Angebote (Plan 0008, E12)", () => {
  it("nennt die Zahl im Singular und Plural", () => {
    expect(hiddenNote(1, 0)).toBe("1 Angebot an diesem Tag ist ausgeblendet – durch Filter, Wegzeit oder Alter.");
    expect(hiddenNote(3, 0)).toBe("3 Angebote an diesem Tag sind ausgeblendet – durch Filter, Wegzeit oder Alter.");
  });

  it("sagt dazu, wenn heute Passendes schon vorbei ist", () => {
    expect(hiddenNote(1, 2)).toBe(
      "1 Angebot an diesem Tag ist ausgeblendet – durch Filter, Wegzeit oder Alter. " +
        "Was zu deiner Auswahl passt, ist heute schon vorbei.",
    );
  });
});

describe("Hinweis im Kind-Sheet (Plan 0009, N3)", () => {
  const point = { lat: 49.4, lon: 11.2 };
  const standort: Origin = { source: "standort", point, label: "Mein Standort" };
  const karte: Origin = { source: "karte", point, label: "Kartenmitte" };
  const stadtteil: Origin = { source: "stadtteil", point, label: "Gostenhof" };
  const ausserhalb: ReachMode = { kind: "luftlinie", reason: "ausserhalb" };
  const fehler: ReachMode = { kind: "luftlinie", reason: "fehler" };

  it("ein Problem der Standortabfrage geht vor; Großraum heißt Großraum, nicht Stadtgebiet", () => {
    expect(originHint("outside", undefined, undefined)).toEqual({
      cls: "hint bad",
      text: "Dein Standort liegt außerhalb des Großraums Nürnberg. Wähle einen Stadtteil.",
    });
    expect(originHint("denied", standort, { kind: "oepnv" })?.cls).toBe("hint bad");
  });

  it("außerhalb des Stadtgebiets sagt es das Sheet selbst, für Standort und Kartenmitte", () => {
    const text = "Wegzeiten gibt es nur für Startpunkte im Stadtgebiet Nürnberg. Wähle einen Stadtteil.";
    expect(originHint(undefined, standort, ausserhalb)).toEqual({ cls: "hint bad", text });
    expect(originHint(undefined, karte, ausserhalb)).toEqual({ cls: "hint bad", text });
  });

  it("Standort: Wegzeit nur, wenn sie kommt oder da ist; ohne Tabelle Entfernung", () => {
    const modes: ReachMode[] = [{ kind: "oepnv" }, { kind: "laedt" }];
    for (const mode of modes) {
      expect(originHint(undefined, standort, mode)).toEqual({
        cls: "hint ok",
        text: "Wegzeit ab deinem Standort (auf ca. 100 m gerundet).",
      });
    }
    expect(originHint(undefined, standort, fehler)?.text).toBe(
      "Entfernung ab deinem Standort (auf ca. 100 m gerundet).",
    );
  });

  it("kein Hinweis ohne Startpunkt, beim Stadtteil und bei der Kartenmitte im Stadtgebiet", () => {
    expect(originHint(undefined, undefined, undefined)).toBeUndefined();
    expect(originHint(undefined, stadtteil, fehler)).toBeUndefined();
    expect(originHint(undefined, karte, { kind: "oepnv" })).toBeUndefined();
    expect(originHint(undefined, karte, fehler)).toBeUndefined();
  });
});

describe("Altersfilter (Plan 0021, E2/E3)", () => {
  it("Untertitel des Schalters: an zählt die weiteren, aus die markierten", () => {
    expect(ageOnlyNote(148, true)).toBe("148 weitere passen nicht · geprüft zum Kursstart");
    expect(ageOnlyNote(1, true)).toBe("1 weiteres passt nicht · geprüft zum Kursstart");
    expect(ageOnlyNote(148, false)).toBe("148 unpassende sind markiert · geprüft zum Kursstart");
    expect(ageOnlyNote(1, false)).toBe("1 unpassendes ist markiert · geprüft zum Kursstart");
    expect(ageOnlyNote(0, true)).toBe("geprüft zum Kursstart");
    expect(ageOnlyNote(0, false)).toBe("geprüft zum Kursstart");
  });

  it("Warnhinweis bei abgeschaltetem Filter ist ein ganzer Satz", () => {
    expect(ageWarnText(148, "7 Mon.")).toBe("Zeigt auch 148 Angebote, die nicht zu 7 Mon. passen");
    expect(ageWarnText(1, "7 Mon.")).toBe("Zeigt auch 1 Angebot, das nicht zu 7 Mon. passt");
  });
});
