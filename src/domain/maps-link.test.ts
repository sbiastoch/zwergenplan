import { describe, expect, it } from "vitest";
import { mapsDestination, mapsDirectionsUrl } from "./maps-link.ts";

describe("mapsDirectionsUrl", () => {
  it("Route mit Bus & Bahn zur Adresse, ohne Start (Plan 0019, E1)", () => {
    expect(mapsDirectionsUrl("Bühnenplatz 2, 90429 Nürnberg")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=B%C3%BChnenplatz+2%2C+90429+N%C3%BCrnberg&travelmode=transit",
    );
  });

  it("hat genau api, destination und travelmode – nie einen Startpunkt (E3)", () => {
    const url = new URL(mapsDirectionsUrl("Kornmarkt 6, 90402 Nürnberg (Turnhalle 2. UG)"));
    expect([...url.searchParams.keys()]).toEqual(["api", "destination", "travelmode"]);
    expect(url.searchParams.get("destination")).toBe("Kornmarkt 6, 90402 Nürnberg");
  });
});

describe("mapsDestination (E2)", () => {
  it.each([
    ["Klammer am Ende", "Beispielweg 6, 90402 Nürnberg (Turnhalle 2. UG)", "Beispielweg 6, 90402 Nürnberg"],
    [
      "Klammer mitten drin",
      "Kirchengemeindehausstraße 128a (Hinterhaus), 90461 Nürnberg",
      "Kirchengemeindehausstraße 128a, 90461 Nürnberg",
    ],
    ["Präfix", "Pfarramt Musterkirche (Keller), Musterstraße 34, 90471 Nürnberg", "Musterstraße 34, 90471 Nürnberg"],
    [
      "Zusätze dazwischen",
      "Musterstraße 212, Gebäude E6 (Eingang Nebenstraße), 2. OG, nicht barrierefrei, 90429 Nürnberg",
      "Musterstraße 212, 90429 Nürnberg",
    ],
    [
      "Zusatz mit Nummer hinter der Straße",
      "Musterstraße 5, Halle 2, 90402 Nürnberg",
      "Musterstraße 5, 90402 Nürnberg",
    ],
    ["Hausnummer mit Bereich", "Musterweg 12-14, 90402 Nürnberg", "Musterweg 12-14, 90402 Nürnberg"],
    ["Hausnummer mit Leerzeichen vor dem Buchstaben", "Musterweg 7 b, 90402 Nürnberg", "Musterweg 7 b, 90402 Nürnberg"],
    ["ohne PLZ", "Musterstraße 16, Nürnberg", "Musterstraße 16, Nürnberg"],
    ["ohne Hausnummer", "Musterpark, Astraße/Bstraße", "Musterpark, Astraße/Bstraße"],
    ["doppelte Leerzeichen", "Musterweg  3 , 90402  Nürnberg", "Musterweg 3, 90402 Nürnberg"],
    ["mehrere Klammern", "Haus (A) Musterweg 3 (Hof), 90402 Nürnberg (UG)", "Haus Musterweg 3, 90402 Nürnberg"],
  ])("%s", (_case, address, expected) => {
    expect(mapsDestination(address)).toBe(expected);
  });

  it("bleibt unverändert, wenn nach der Bereinigung zu wenig übrig bliebe", () => {
    expect(mapsDestination("(nur Hinweis)")).toBe("(nur Hinweis)");
    expect(mapsDestination("A (Hof)")).toBe("A (Hof)");
  });
});
