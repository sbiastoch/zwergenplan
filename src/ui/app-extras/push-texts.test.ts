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
  it("nennt den Schalter überall „Wöchentliche Push-Nachricht“, ohne Wochentag (Nachtrag Plan 0034, 2026-10-11)", () => {
    expect(PUSH_TEXTS.switchLabel).toBe("Wöchentliche Push-Nachricht");
    for (const text of [
      PUSH_TEXTS.on,
      PUSH_TEXTS.off,
      PUSH_TEXTS.addedOff,
      PUSH_TEXTS.needsSwitch,
      APP_STEP_TEXTS.iosNote,
    ]) {
      expect(text).toMatch(/[Ww]öchentliche(r)? Push-Nachricht/);
    }
    for (const text of [...Object.values(PUSH_TEXTS), ...Object.values(APP_STEP_TEXTS)]) {
      expect(text).not.toMatch(/[Ss]amstag/);
    }
  });

  it("App-Schritt: „An.“ verspricht keinen Wochentag", () => {
    expect(APP_STEP_TEXTS.on).toBe("An. Die erste kommt in den nächsten Tagen.");
  });
});
