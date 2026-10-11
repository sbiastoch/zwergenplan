import { describe, expect, it } from "vitest";
import { APP_STEP_TEXTS, PUSH_TEXTS, searchLabel } from "./push-texts.ts";

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

describe("PUSH_TEXTS", () => {
  it("nennt den Schalter überall „Samstags-Nachricht“ (Plan 0033, N2)", () => {
    expect(PUSH_TEXTS.switchLabel).toBe("Samstags-Nachricht");
    for (const text of [
      PUSH_TEXTS.on,
      PUSH_TEXTS.off,
      PUSH_TEXTS.addedOff,
      PUSH_TEXTS.needsSwitch,
      APP_STEP_TEXTS.iosNote,
    ]) {
      expect(text).toContain("Samstags-Nachricht");
      expect(text).not.toContain("Wochen-Nachricht");
    }
  });
});
