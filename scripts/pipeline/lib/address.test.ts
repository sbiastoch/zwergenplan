import { describe, expect, it } from "vitest";
import { normalizeAddress } from "./address.ts";

describe("normalizeAddress", () => {
  it("entfernt Kommentare in Klammern und nennt Straße, PLZ und Ort", () => {
    expect(normalizeAddress("Gemeindehaus (1. OG), Musterstraße 3, 90402 Nürnberg (Eingang hinten)")).toEqual({
      text: "Musterstraße 3, 90402 Nürnberg",
      street: "Musterstraße 3",
      postcode: "90402",
      city: "Nürnberg",
      name: "Gemeindehaus",
    });
  });

  it("findet die Straße auch als ersten Teil", () => {
    expect(normalizeAddress("Musterstraße 3, 90402 Nürnberg")).toMatchObject({
      text: "Musterstraße 3, 90402 Nürnberg",
      street: "Musterstraße 3",
    });
  });

  it("ergänzt das Leerzeichen vor der Hausnummer und vereinheitlicht „str.“", () => {
    expect(normalizeAddress("Tellerringstr.56, Düsseldorf")).toEqual({
      text: "Tellerringstraße 56, Düsseldorf",
      street: "Tellerringstraße 56",
      city: "Düsseldorf",
    });
  });

  it("„Str.“ und „Straße“ ergeben denselben Text", () => {
    expect(normalizeAddress("Fürther Str. 12a, 90429 Nürnberg").text).toBe(
      normalizeAddress("Fürther Straße 12a, 90429 Nürnberg").text,
    );
    expect(normalizeAddress("Fürther Str. 12a, 90429 Nürnberg").street).toBe("Fürther Straße 12a");
  });

  it("Düsseldorf: Kommentar ohne PLZ wird entfernt", () => {
    expect(normalizeAddress("Collenbachstr. 10, Düsseldorf (PLZ auf der Seite nicht angegeben)")).toEqual({
      text: "Collenbachstraße 10, Düsseldorf",
      street: "Collenbachstraße 10",
      city: "Düsseldorf",
    });
  });

  it("Ort ohne Postadresse: nur Name und Stadt", () => {
    expect(normalizeAddress("Ritterbad, Nürnberg")).toEqual({
      text: "Ritterbad, Nürnberg",
      city: "Nürnberg",
      name: "Ritterbad",
    });
  });

  it("Name mit PLZ und Ort, ohne Straße", () => {
    expect(normalizeAddress("Turnhalle Grundschule Eibach, 90451 Nürnberg")).toEqual({
      text: "Turnhalle Grundschule Eibach, 90451 Nürnberg",
      postcode: "90451",
      city: "Nürnberg",
      name: "Turnhalle Grundschule Eibach",
    });
  });

  it("Straßenname ohne Hausnummer im Namen wird erkannt (für die strukturierte Suche)", () => {
    expect(normalizeAddress("Turnhalle Volksschule Fürreuthweg, Nürnberg-Eibach")).toEqual({
      text: "Turnhalle Volksschule Fürreuthweg, Nürnberg-Eibach",
      city: "Nürnberg-Eibach",
      name: "Turnhalle Volksschule Fürreuthweg",
      streetName: "Fürreuthweg",
    });
    expect(normalizeAddress("Ritterbad, Nürnberg")).not.toHaveProperty("streetName");
  });

  it("Text nach dem Ort fällt weg, Leerraum wird vereinheitlicht", () => {
    expect(normalizeAddress("  Am  Plärrer 1 , 90443 Nürnberg, Hinterhaus ").text).toBe("Am Plärrer 1, 90443 Nürnberg");
  });
});
