import { describe, expect, it } from "vitest";
import { searchLabel } from "./push-texts.ts";

describe("searchLabel", () => {
  it("nennt alle Dimensionen in der Reihenfolge des Filters", () => {
    expect(searchLabel("kat=musik,natur&format=kurs&anmeldung=ohne-anmeldung&kosten=kostenlos&wegzeit=20")).toBe(
      "Musik & Singen, Natur & Draußen · Kurs · Ohne Anmeldung · Kostenlos · bis 20 Min.",
    );
  });

  it("lässt leere Dimensionen weg", () => {
    expect(searchLabel("kat=buehne")).toBe("Bühne & Konzert");
    expect(searchLabel("format=regelmaessig,einmalig&wegzeit=45")).toBe("Regelmäßig, Einmalig · bis 45 Min.");
    expect(searchLabel("")).toBe("");
  });
});
