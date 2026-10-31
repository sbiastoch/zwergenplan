import { describe, expect, it } from "vitest";
import {
  ageCheck,
  ageInMonths,
  ageVisibility,
  DEFAULT_AGE,
  detailSession,
  fitsAgeAt,
  fittingSessions,
  offerFitsAge,
  offerFitsAgeIn,
  sessionFit,
  splitByAge,
  startFitsAge,
} from "./age.ts";
import { applyFilters, EMPTY_FILTER } from "./filter.ts";
import { FIXTURE_NOW, fixtureKey, fixtureOffer, fixtureSiteOffers } from "./test-fixtures.ts";

describe("ageInMonths", () => {
  it("zählt vollendete Monate am Berliner Kalendertag", () => {
    expect(ageInMonths("2026-05-15", "2026-10-14T10:00:00+02:00")).toBe(4);
    expect(ageInMonths("2026-05-15", "2026-10-15T10:00:00+02:00")).toBe(5);
  });

  it("nutzt den Berliner Tag, auch wenn UTC noch am Vortag ist", () => {
    // 00:30 Berlin = 22:30 UTC am Vortag
    expect(ageInMonths("2026-05-15", "2026-10-15T00:30:00+02:00")).toBe(5);
  });

  it("behandelt Geburtstage am Monatsende in kurzen Monaten", () => {
    expect(ageInMonths("2026-01-31", "2026-02-27T12:00:00+01:00")).toBe(0);
    expect(ageInMonths("2026-01-31", "2026-02-28T12:00:00+01:00")).toBe(1);
    expect(ageInMonths("2024-01-31", "2024-02-29T12:00:00+01:00")).toBe(1);
  });

  it("ist vor der Geburt negativ", () => {
    expect(ageInMonths("2026-12-01", "2026-10-15T10:00:00+02:00")).toBe(-2);
  });

  it("lehnt kaputte Daten ab", () => {
    expect(() => ageInMonths("15.05.2026", "2026-10-15T10:00:00+02:00")).toThrow();
  });
});

describe("fitsAgeAt", () => {
  it("ist an beiden Grenzen inklusiv", () => {
    const range = { minMonths: 6, maxMonths: 12 };
    expect(fitsAgeAt(range, "2026-01-10", "2026-07-10T10:00:00+02:00")).toBe(true);
    expect(fitsAgeAt(range, "2026-01-10", "2026-07-09T10:00:00+02:00")).toBe(false);
    expect(fitsAgeAt(range, "2025-07-10", "2026-08-09T10:00:00+02:00")).toBe(true);
    expect(fitsAgeAt(range, "2025-07-10", "2026-08-10T10:00:00+02:00")).toBe(false);
  });

  it("nimmt ohne Angabe 0–36 Monate an", () => {
    expect(fitsAgeAt(undefined, "2024-01-01", "2026-10-15T10:00:00+02:00")).toBe(true);
    expect(fitsAgeAt(undefined, "2023-01-01", "2026-10-15T10:00:00+02:00")).toBe(false);
  });
});

describe("offerFitsAge", () => {
  it("prüft Kurse zum ersten Termin", () => {
    const pekip = fixtureOffer("pekip-herbst"); // 1–5 Monate, Start 13.10.
    expect(offerFitsAge(pekip, "2026-09-10", FIXTURE_NOW)).toBe(true);
    // Am Kursende wäre das Kind zu alt – zählt nicht.
    expect(offerFitsAge(pekip, "2026-05-14", FIXTURE_NOW)).toBe(true);
    expect(offerFitsAge(pekip, "2026-04-13", FIXTURE_NOW)).toBe(false); // am 13.10. schon 6 Monate
  });

  it("lässt regelmäßige Angebote zu, sobald ein Termin passt", () => {
    const treff = fixtureOffer("krabbeltreff"); // 6–24 Monate, bis 4.11.
    expect(offerFitsAge(treff, "2026-05-01", FIXTURE_NOW)).toBe(true); // wird im Oktober 5, im November 6
    expect(offerFitsAge(treff, "2026-06-01", FIXTURE_NOW)).toBe(false);
  });

  it("mit Zeitraum: regelmäßig nur über Termine darin, Kurse weiter am ersten Termin (Plan 0053, E2)", () => {
    const treff = fixtureOffer("krabbeltreff"); // 6–24 Monate; geb. 1.5.2026 erst ab 1.11. passend
    expect(offerFitsAgeIn(treff, "2026-05-01", FIXTURE_NOW, { range: { from: "2026-10-05", to: "2026-10-11" } })).toBe(
      false,
    );
    expect(offerFitsAgeIn(treff, "2026-05-01", FIXTURE_NOW, { range: { from: "2026-11-01" } })).toBe(true);
    const pekip = fixtureOffer("pekip-herbst");
    expect(offerFitsAgeIn(pekip, "2026-09-10", FIXTURE_NOW, { range: { from: "2026-12-01" } })).toBe(true);
  });

  it("wertet bei regelmäßigen Angeboten nur kommende Termine", () => {
    const treff = fixtureOffer("krabbeltreff"); // bis 24 Monate; Termine 7.10.–4.11.
    // geb. 15.9.2024: am 7. und 14.10. noch 24 Monate, ab 15.10. zu alt
    expect(offerFitsAge(treff, "2024-09-15", FIXTURE_NOW)).toBe(true);
    expect(offerFitsAge(treff, "2024-09-15", new Date("2026-10-16T12:00:00+02:00"))).toBe(false);
  });

  it("läuft wirklich in einer fremden Zeitzone (sonst wären die Berlin-Tests wertlos)", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Los_Angeles");
  });
});

describe("startFitsAge: der Beginn passt (Plan 0043, E2)", () => {
  /** Turnzwerge-Fall: 12–36 Monate, jeden Montag bis Oktober 2027; das Kind ist am 24.10.2026 genau 8 Monate */
  const BIRTH_8 = "2026-02-24";
  const NOW = new Date("2026-10-24T10:00:00+02:00");
  const mondays = Array.from({ length: 50 }, (_, i) => {
    const start = new Date(Date.UTC(2026, 9, 26 + 7 * i, 9, 0));
    return { start: start.toISOString(), end: new Date(start.getTime() + 3_600_000).toISOString() };
  });
  const turnzwerge = { ...fixtureOffer("krabbeltreff"), age: { minMonths: 12, maxMonths: 36 }, sessions: mondays };

  it("regelmäßig: passt der nächste Termin nicht, zählt kein späterer (anders als offerFitsAge)", () => {
    expect(offerFitsAge(turnzwerge, BIRTH_8, NOW)).toBe(true);
    expect(startFitsAge(turnzwerge, BIRTH_8, NOW)).toBe(false);
  });

  it("regelmäßig: passt der nächste Termin, ohne Zeitgrenze", () => {
    // ab Februar 12 Monate: Ab dann ist der nächste Termin passend, auch wenn er Monate entfernt ist
    expect(startFitsAge(turnzwerge, BIRTH_8, new Date("2027-02-24T12:00:00+01:00"))).toBe(true);
    const later = { ...turnzwerge, sessions: mondays.slice(20) };
    expect(later.sessions[0]?.start.slice(0, 10)).toBe("2027-03-15");
    expect(startFitsAge(later, BIRTH_8, NOW)).toBe(true);
  });

  it("regelmäßig ohne kommenden Termin: false", () => {
    expect(startFitsAge(turnzwerge, BIRTH_8, new Date("2028-01-01T12:00:00+01:00"))).toBe(false);
  });

  it("Kurs und Einzeltermin wie offerFitsAge: erster Termin", () => {
    const musik = fixtureOffer("musikgarten-1"); // 12–24, erster Termin 5.11.2026
    expect(startFitsAge(musik, "2025-11-05", FIXTURE_NOW)).toBe(true);
    expect(startFitsAge(musik, "2025-11-06", FIXTURE_NOW)).toBe(false);
    const kuckuck = fixtureOffer("kuckuck-im-nest");
    for (const birth of ["2025-05-15", "2025-05-16"])
      expect(startFitsAge(kuckuck, birth, FIXTURE_NOW)).toBe(offerFitsAge(kuckuck, birth, FIXTURE_NOW));
  });
});

describe("splitByAge", () => {
  it("teilt nach der Altersregel, Reihenfolge bleibt", () => {
    const upcoming = applyFilters(fixtureSiteOffers(), EMPTY_FILTER, { now: FIXTURE_NOW });
    // Kind geb. 1.9.2026: im Oktober 1 Monat alt
    const { fitting, unfit } = splitByAge(upcoming, "2026-09-01", FIXTURE_NOW);
    // Reihenfolge der Eingabe, also wie in site.json chronologisch nach erstem Termin
    expect(fitting.map(fixtureKey)).toEqual([
      "krabbelreime",
      "pekip-herbst",
      "babymassage-workshop",
      "babykonzert-advent",
    ]);
    expect(unfit).toHaveLength(upcoming.length - 4);
    expect(unfit.map(fixtureKey)).toContain("krabbeltreff");
  });
});

describe("ageVisibility", () => {
  const upcoming = applyFilters(fixtureSiteOffers(), EMPTY_FILTER, { now: FIXTURE_NOW });
  // Ausschnitt wie nach einem Filter: ein passendes und zwei unpassende Angebote (Kind geb. 1.9.2026)
  const filtered = upcoming.filter((o) =>
    ["pekip-herbst", "krabbeltreff", "musikgarten-1"].includes(fixtureKey(o) ?? ""),
  );
  const unfitKeys = (ids: ReadonlySet<string>) => upcoming.filter((o) => ids.has(o.id)).map(fixtureKey);

  it("blendet unpassende Angebote aus und zählt sie", () => {
    const v = ageVisibility(filtered, upcoming, "2026-09-01", FIXTURE_NOW, { ageOnly: true });
    expect(v.visible.map(fixtureKey)).toEqual(["pekip-herbst"]);
    expect(v.unfitCount).toBe(2);
  });

  it("markiert unpassende Angebote über alle kommenden, nicht nur die gefilterten", () => {
    const v = ageVisibility(filtered, upcoming, "2026-09-01", FIXTURE_NOW, { ageOnly: true });
    expect(v.unfitIds.size).toBe(upcoming.length - 4);
    expect(unfitKeys(v.unfitIds)).toContain("kuckuck-im-nest");
    expect(unfitKeys(v.unfitIds)).not.toContain("pekip-herbst");
  });

  it("Altersfilter aus: nichts ausgeblendet, unpassende gezählt und markiert (Plan 0021, E1)", () => {
    const v = ageVisibility(filtered, upcoming, "2026-09-01", FIXTURE_NOW, { ageOnly: false });
    expect(v.visible).toBe(filtered);
    expect(v.unfitCount).toBe(2);
    expect(v.unfitIds.size).toBe(upcoming.length - 4);
  });

  it("ohne Geburtsdatum passt alles", () => {
    const v = ageVisibility(filtered, upcoming, undefined, FIXTURE_NOW, { ageOnly: true });
    expect(v).toEqual({ visible: filtered, unfitCount: 0, unfitIds: new Set(), listUnfitIds: new Set() });
  });

  it("mit Zeitraum zählt bei regelmäßigen nur ein passender Termin darin (Plan 0053, E2)", () => {
    // Treff 6–24 Monate, Kind geb. 1.5.2026: am 7.10. 5 Monate, erst am 4.11. passend
    const birth = "2026-05-01";
    const week = { from: "2026-10-05", to: "2026-10-11" };
    const v = ageVisibility(filtered, upcoming, birth, FIXTURE_NOW, { ageOnly: true, range: week });
    expect(v.visible.map(fixtureKey)).not.toContain("krabbeltreff");
    expect(unfitKeys(v.listUnfitIds)).toContain("krabbeltreff");
    // ohne Zeitraum passt er später: keine Markierung auf Merkliste und in Sheets
    expect(unfitKeys(v.unfitIds)).not.toContain("krabbeltreff");
    const later = ageVisibility(filtered, upcoming, birth, FIXTURE_NOW, {
      ageOnly: true,
      range: { from: "2026-11-01" },
    });
    expect(later.visible.map(fixtureKey)).toContain("krabbeltreff");
    const none = ageVisibility(filtered, upcoming, birth, FIXTURE_NOW, { ageOnly: true });
    expect(none.listUnfitIds).toBe(none.unfitIds);
    expect(none.visible.map(fixtureKey)).toContain("krabbeltreff");
  });
});

describe("offerFitsAgeIn und ageVisibility mit Tageszeit (Plan 0057, E7)", () => {
  // Treff 6–24 Monate; Kind geb. 1.5.2026: am 7.10. 5 Monate, ab 1.11. passend. Die echten Termine sind vormittags;
  // hier passt nur ein Vormittagstermin, die Nachmittagstermine liegen vorher.
  const treff = fixtureOffer("krabbeltreff");
  const mixed = {
    ...treff,
    sessions: [
      { start: "2026-10-14T16:00:00+02:00", end: "2026-10-14T17:00:00+02:00" },
      { start: "2026-10-21T16:00:00+02:00", end: "2026-10-21T17:00:00+02:00" },
      { start: "2026-11-04T10:00:00+01:00", end: "2026-11-04T11:00:00+01:00" },
    ],
  };
  const birth = "2026-05-01";

  it("passender Termin nur vormittags, Filter nachmittags: passt nicht", () => {
    expect(offerFitsAgeIn(mixed, birth, FIXTURE_NOW)).toBe(true);
    expect(offerFitsAgeIn(mixed, birth, FIXTURE_NOW, { daytimes: ["vormittags"] })).toBe(true);
    expect(offerFitsAgeIn(mixed, birth, FIXTURE_NOW, { daytimes: ["nachmittags"] })).toBe(false);
    expect(offerFitsAgeIn(mixed, birth, FIXTURE_NOW, { daytimes: [] })).toBe(true);
    expect(offerFitsAgeIn(mixed, birth, FIXTURE_NOW, { range: { from: "2026-11-01" }, daytimes: ["vormittags"] })).toBe(
      true,
    );
    expect(offerFitsAgeIn(mixed, birth, FIXTURE_NOW, { range: { to: "2026-10-31" }, daytimes: ["vormittags"] })).toBe(
      false,
    );
  });

  it("ageVisibility markiert mit der Tageszeit, unfitIds bleibt ohne", () => {
    const v = ageVisibility([mixed], [mixed], birth, FIXTURE_NOW, { ageOnly: true, daytimes: ["nachmittags"] });
    expect(v.visible).toEqual([]);
    expect(v.listUnfitIds.has(mixed.id)).toBe(true);
    expect(v.unfitIds.has(mixed.id)).toBe(false);
    const none = ageVisibility([mixed], [mixed], birth, FIXTURE_NOW, { ageOnly: true, daytimes: [] });
    expect(none.listUnfitIds).toBe(none.unfitIds);
  });
});

describe("DEFAULT_AGE", () => {
  it("ist die ganze Zielgruppe 0–3 Jahre", () => {
    expect(DEFAULT_AGE).toEqual({ minMonths: 0, maxMonths: 36 });
  });
});

describe("ageCheck", () => {
  it("prüft Kurse und Einzeltermine zum ersten Termin", () => {
    const pekip = fixtureOffer("pekip-herbst"); // Start Di 13.10.
    expect(ageCheck(pekip, "2026-09-10", FIXTURE_NOW)).toEqual({
      fits: true,
      at: "2026-10-13T09:30:00+02:00",
      months: 1,
    });
    expect(ageCheck(pekip, "2026-04-13", FIXTURE_NOW)?.fits).toBe(false);
  });

  it("hat ohne kommende Termine nichts zu erklären", () => {
    expect(ageCheck(fixtureOffer("krabbeltreff"), "2026-05-01", new Date("2027-01-01T12:00:00+01:00"))).toBeUndefined();
  });

  it("nimmt bei regelmäßigen Angeboten den ersten passenden kommenden Termin", () => {
    const treff = fixtureOffer("krabbeltreff"); // 6–24 Monate, mittwochs ab 7.10.
    const check = ageCheck(treff, "2026-05-01", FIXTURE_NOW); // wird am 1.11. 6 Monate
    expect(check).toEqual({ fits: true, at: "2026-11-04T10:00:00+01:00", months: 6 });
    expect(ageCheck(treff, "2026-06-01", FIXTURE_NOW)).toMatchObject({ fits: false, at: "2026-10-07T10:00:00+02:00" });
  });

  it("prüft einen vorgegebenen Termin einer regelmäßigen Reihe (aus dem Kalender)", () => {
    const treff = fixtureOffer("krabbeltreff");
    const first = treff.sessions[0];
    expect(first && ageCheck(treff, "2026-05-01", FIXTURE_NOW, first)).toEqual({
      fits: false,
      at: "2026-10-07T10:00:00+02:00",
      months: 5,
      from: { at: "2026-11-04T10:00:00+01:00", months: 6, scheduled: true },
    });
  });

  it("nennt hinter den Daten den Tag, an dem das Kind ins Alter hineinwächst", () => {
    const treff = fixtureOffer("krabbeltreff"); // letzter Termin 4.11.
    expect(ageCheck(treff, "2026-06-01", FIXTURE_NOW)?.from).toEqual({
      at: "2026-12-01T00:00:00+01:00",
      months: 6,
      scheduled: false,
    });
  });

  it("hat kein „ab“ für Kurse und für Kinder, die herausgewachsen sind", () => {
    expect(ageCheck(fixtureOffer("pekip-herbst"), "2026-04-13", FIXTURE_NOW)?.from).toBeUndefined();
    expect(ageCheck(fixtureOffer("krabbeltreff"), "2024-01-01", FIXTURE_NOW)).toMatchObject({ fits: false });
    expect(ageCheck(fixtureOffer("krabbeltreff"), "2024-01-01", FIXTURE_NOW)?.from).toBeUndefined();
  });
});

describe("detailSession (Browser-Review Plan 0028)", () => {
  const treff = fixtureOffer("krabbeltreff"); // regelmäßig, 6–24 Monate, mittwochs 7.10.–4.11.
  const pekip = fixtureOffer("pekip-herbst"); // Kurs ab Di 13.10.

  it("nimmt bei regelmäßigen den ersten passenden Termin, wie die Alters-Kachel", () => {
    expect(detailSession(treff, FIXTURE_NOW, undefined, "2026-04-20")?.start).toBe("2026-10-21T10:00:00+02:00");
    expect(detailSession(treff, FIXTURE_NOW, undefined, "2026-04-20")?.start).toBe(
      ageCheck(treff, "2026-04-20", FIXTURE_NOW)?.at,
    );
  });

  it("bleibt am gewählten Kalendertag, ohne Geburtsdatum und ohne passenden Termin beim bisherigen", () => {
    expect(detailSession(treff, FIXTURE_NOW, "2026-10-14", "2026-04-20")?.start).toBe("2026-10-14T10:00:00+02:00");
    expect(detailSession(treff, FIXTURE_NOW, undefined, undefined)?.start).toBe("2026-10-07T10:00:00+02:00");
    expect(detailSession(treff, FIXTURE_NOW, undefined, "2026-08-01")?.start).toBe("2026-10-07T10:00:00+02:00");
  });

  it("lässt Kurse unverändert (ADR 0007)", () => {
    expect(detailSession(pekip, FIXTURE_NOW, undefined, "2023-01-01")).toEqual(pekip.sessions[0]);
  });
});

describe("sessionFit und fittingSessions (Plan 0028)", () => {
  const treff = fixtureOffer("krabbeltreff"); // regelmäßig, 6–24 Monate, mittwochs 7.10.–4.11.
  const pekip = fixtureOffer("pekip-herbst"); // Kurs, 1–5 Monate

  it("gibt es ohne Geburtsdatum nicht", () => {
    expect(sessionFit(undefined)).toBeUndefined();
    expect(fittingSessions(treff, FIXTURE_NOW, undefined)).toEqual(treff.sessions);
  });

  it("prüft regelmäßige je Termin, Kurse und Einzeltermine gar nicht", () => {
    const fits = sessionFit("2026-04-20"); // 5 Monate am 14.10., 6 am 21.10.
    expect(treff.sessions.map((s) => fits?.(treff, s))).toEqual([false, false, true, true, true]);
    expect(pekip.sessions.every((s) => sessionFit("2023-01-01")?.(pekip, s))).toBe(true);
  });

  it("lässt bei regelmäßigen nur kommende, passende Termine", () => {
    expect(fittingSessions(treff, FIXTURE_NOW, "2026-04-20")).toEqual(treff.sessions.slice(2));
    expect(fittingSessions(treff, FIXTURE_NOW, "2026-08-01")).toEqual([]);
    expect(fittingSessions(pekip, FIXTURE_NOW, "2023-01-01")).toEqual(pekip.sessions);
  });
});
