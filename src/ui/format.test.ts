import { describe, expect, it } from "vitest";
import type { Origin, Reach } from "../domain/reach.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { addDays, fromBerlinLocal } from "../domain/time.ts";
import {
  ageChipLabel,
  agendaHeading,
  ageRangeLabel,
  availabilityLabel,
  clock,
  dayHeading,
  distanceLong,
  distanceNote,
  distanceShort,
  formatFact,
  mapStatusParts,
  originPhrase,
  placeLine,
  plural,
  reachLimitLabel,
  registrationNote,
  shortDate,
  standDate,
  timeRange,
  weekTitle,
  whenLabels,
} from "./format.ts";

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

describe("Entfernung (Plan 0004, E6)", () => {
  const luftlinie = (meters: number): Reach => ({ kind: "luftlinie", meters });
  const gostenhof: Origin = {
    source: "stadtteil",
    point: { lat: 49.448, lon: 11.058 },
    label: "Gostenhof",
    districtId: "gostenhof",
  };
  const standort: Origin = { source: "standort", point: { lat: 49.452, lon: 11.077 }, label: "Mein Standort" };

  it("kurz für die Kachel: gerundet, deutsches Komma", () => {
    expect(distanceShort(luftlinie(0))).toBe("100 m");
    expect(distanceShort(luftlinie(226))).toBe("200 m");
    expect(distanceShort(luftlinie(400))).toBe("400 m");
    expect(distanceShort(luftlinie(1427))).toBe("1,4 km");
    expect(distanceShort(luftlinie(2000))).toBe("2 km");
    expect(distanceShort(luftlinie(9960))).toBe("10 km");
    expect(distanceShort(luftlinie(12_400))).toBe("12 km");
  });

  it("nennt den Startpunkt", () => {
    expect(originPhrase(gostenhof)).toBe("ab Gostenhof");
    expect(originPhrase(standort)).toBe("ab deinem Standort");
  });

  it("lang fürs Detail, immer mit „Luftlinie“", () => {
    expect(distanceLong(luftlinie(1427), gostenhof)).toBe("ca. 1,4 km Luftlinie ab Gostenhof");
    expect(distanceLong(luftlinie(226), standort)).toBe("ca. 200 m Luftlinie ab deinem Standort");
  });

  it("erklärt in der Statuszeile, was die Zahl auf der Kachel ist", () => {
    expect(distanceNote(gostenhof)).toBe("Entfernung als Luftlinie ab Gostenhof");
    expect(distanceNote(standort)).toBe("Entfernung als Luftlinie ab deinem Standort");
  });

  it("Kartenmitte als Startpunkt (Plan 0005, E8)", () => {
    const karte: Origin = { source: "karte", point: { lat: 49.452, lon: 11.077 }, label: "Kartenmitte" };
    expect(originPhrase(karte)).toBe("ab der Kartenmitte");
    expect(distanceNote(karte)).toBe("Entfernung als Luftlinie ab der Kartenmitte");
    expect(distanceLong(luftlinie(1427), karte)).toBe("ca. 1,4 km Luftlinie ab der Kartenmitte");
  });

  it("beschriftet den Umkreis", () => {
    expect(reachLimitLabel({ kind: "km", value: 2 })).toBe("bis 2 km");
    expect(reachLimitLabel({ kind: "km", value: 10 })).toBe("bis 10 km");
  });
});

describe("Karte und Orte (Plan 0005, E7)", () => {
  it("Statuszeile: Angebote an Orten, Singular und Plural", () => {
    expect(mapStatusParts(8, 5)).toEqual([8, " Angebote an ", 5, " Orten"]);
    expect(mapStatusParts(1, 1).join("")).toBe("1 Angebot an 1 Ort");
    expect(mapStatusParts(0, 0).join("")).toBe("0 Angebote an 0 Orten");
  });

  it("Zeile der Orts-Liste: Stadtteil bzw. Adresse, Zahl, Entfernung", () => {
    const place = { district: "Gostenhof", address: "Beispielweg 1, 90429 Nürnberg", offers: [1, 2, 3] };
    expect(placeLine(place, undefined)).toBe("Gostenhof · 3 Angebote");
    expect(placeLine({ address: "Beispielweg 1", offers: [1] }, { kind: "luftlinie", meters: 1427 })).toBe(
      "Beispielweg 1 · 1 Angebot · 1,4 km",
    );
  });
});
