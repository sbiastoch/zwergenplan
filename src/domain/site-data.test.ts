import { describe, expect, it } from "vitest";
import { icsContextFor, icsForSeries } from "./ics.ts";
import { Venue } from "./schema.ts";
import { MIN_ADDRESS, toSiteData, venueAddress } from "./site-data.ts";
import { fixtureKey, loadFixtures } from "./test-fixtures.ts";
import { berlinDate, berlinKey, parseIsoDate, toIcsUtc } from "./time.ts";

describe("toSiteData", () => {
  const { providers, file } = loadFixtures();
  const site = toSiteData(providers, file);

  it("ergänzt Anbietername und Ort", () => {
    const pekip = site.offers.find((o) => fixtureKey(o) === "pekip-herbst");
    expect(pekip?.providerName).toBe("Familientreff Beispielhof (fiktiv)");
    expect(pekip?.venue).toEqual({
      name: "Familientreff Beispielhof",
      address: "Beispielstraße 1, 90402 Nürnberg",
      district: "Altstadt",
      ring: "innen",
      geo: { lat: 49.4521, lon: 11.0767 },
    });
  });

  it("sortiert chronologisch nach erstem Termin", () => {
    const starts = site.offers.map((o) => Date.parse(o.sessions[0]?.start ?? ""));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(site.generatedAt).toBe(file.generatedAt);
  });

  it("lässt district weg, wenn der Ort keinen hat", () => {
    const [first] = providers;
    if (!first) throw new Error("Fixture");
    const { district: _omit, ...venue } = first.venues[0] ?? ({} as never);
    const site2 = toSiteData([{ ...first, venues: [venue] }], {
      ...file,
      offers: file.offers.filter((o) => o.providerId === first.id),
    });
    expect(site2.offers.every((o) => !("district" in o.venue))).toBe(true);
  });

  it("weist ungeprüfte Referenzen ab", () => {
    expect(() => toSiteData([], file)).toThrow("Ungeprüfte Daten");
  });
});

describe("venueAddress", () => {
  it("nutzt dasselbe Adress-Minimum wie das Schema", () => {
    // Die UI darf Zod nicht laden (no-zod-in-client), deshalb steht die Zahl doppelt.
    expect(MIN_ADDRESS).toBe(Venue.shape.address.minLength);
  });

  it("schneidet den Ortsnamen als Präfix ab", () => {
    expect(venueAddress("CVJM-Haus", "CVJM-Haus, Kornmarkt 6, 90402 Nürnberg (Turnhalle 2. UG)")).toBe(
      "Kornmarkt 6, 90402 Nürnberg (Turnhalle 2. UG)",
    );
    expect(venueAddress(" Langwasserbad ", "Langwasserbad,  Breslauer Straße 251, 90471 Nürnberg")).toBe(
      "Breslauer Straße 251, 90471 Nürnberg",
    );
  });

  it("ignoriert Groß- und Kleinschreibung", () => {
    expect(venueAddress("Tabeahaus", "TabeaHaus, Kölner Straße 33, 90419 Nürnberg")).toBe(
      "Kölner Straße 33, 90419 Nürnberg",
    );
  });

  it("schneidet den Ortsnamen als Suffix in Klammern ab", () => {
    expect(
      venueAddress(
        "Haus der Katholischen Stadtkirche",
        "Vordere Sterngasse 1, 90402 Nürnberg (Haus der Katholischen Stadtkirche)",
      ),
    ).toBe("Vordere Sterngasse 1, 90402 Nürnberg");
  });

  it("lässt Teilübereinstimmungen unverändert", () => {
    const eibach = "Gemeindehaus Eibach, Eibacher Hauptstraße 61, 90451 Nürnberg";
    expect(venueAddress("Gemeindehaus Eibach, Kleiner Saal", eibach)).toBe(eibach);
    expect(venueAddress("Gemeindehaus", eibach)).toBe(eibach);
    const thon = "Ökumenisches Gemeindezentrum Thon (evang. Teil, UG), Cuxhavener Straße 54, 90425 Nürnberg";
    expect(venueAddress("Ökumenisches Gemeindezentrum Thon", thon)).toBe(thon);
    const muther = "Mutherstudio, Kraftshofer Hauptstraße 181, 90427 Nürnberg (Zugang Am Kressenstein)";
    expect(venueAddress("Mutherstudio Kraftshof", muther)).toBe(muther);
    expect(venueAddress("Beispielhof", "Beispielstraße 1, 90402 Nürnberg")).toBe("Beispielstraße 1, 90402 Nürnberg");
  });

  it("lässt die Adresse unverändert, wenn sonst weniger als 5 Zeichen blieben", () => {
    expect(venueAddress("Bad", "Bad, Weg")).toBe("Bad, Weg");
    expect(venueAddress("Bad", "Bad (Bad)")).toBe("Bad (Bad)");
    expect(venueAddress("", "Lesegasse 3, 90403 Nürnberg")).toBe("Lesegasse 3, 90403 Nürnberg");
  });
});

describe("toSiteData mit Ortsnamen in der Adresse (H6)", () => {
  const { providers, file } = loadFixtures();
  const [first] = providers;
  if (!first) throw new Error("Fixture");
  const doubled = first.venues.map((v) => ({ ...v, name: "CVJM-Haus", address: `CVJM-Haus, ${v.address}` }));
  const site = toSiteData([{ ...first, venues: doubled }], {
    ...file,
    offers: file.offers.filter((o) => o.providerId === first.id),
  });
  const [offer] = site.offers;
  if (!offer) throw new Error("Fixture");

  it("wendet venueAddress an", () => {
    expect(offer.venue.name).toBe("CVJM-Haus");
    expect(offer.venue.address).toBe("Beispielstraße 1, 90402 Nürnberg");
  });

  it("nennt den Ort in der ICS-LOCATION genau einmal", () => {
    const ics = icsForSeries(offer, icsContextFor(offer, site.generatedAt)).replaceAll("\r\n ", "");
    const locations = ics.split("\r\n").filter((line) => line.startsWith("LOCATION:"));
    expect(locations.length).toBeGreaterThan(0);
    for (const line of locations) {
      expect(line).toBe("LOCATION:CVJM-Haus\\, Beispielstraße 1\\, 90402 Nürnberg");
    }
  });
});

describe("time", () => {
  it("akzeptiert Strings und Date-Objekte", () => {
    const d = new Date("2026-10-25T00:30:00+02:00");
    expect(berlinDate(d)).toEqual({ year: 2026, month: 10, day: 25 });
    expect(toIcsUtc(d)).toBe("20261024T223000Z");
    expect(berlinKey("2026-10-25T02:30:00+01:00")).toBe("20261025T0230");
  });

  it("lehnt Nicht-ISO-Daten ab", () => {
    expect(() => parseIsoDate("2026-1-1")).toThrow("Kein ISO-Datum");
  });
});
