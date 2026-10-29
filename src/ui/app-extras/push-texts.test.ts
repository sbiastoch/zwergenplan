import { describe, expect, it } from "vitest";
import { APP_STEP_TEXTS, PUSH_TEXTS } from "./push-texts.ts";

describe("PUSH_TEXTS", () => {
  it("nennt den Schalter überall „Wöchentliche Push-Nachricht“, ohne Wochentag (Nachtrag Plan 0035, 2026-10-11)", () => {
    expect(PUSH_TEXTS.switchLabel).toBe("Wöchentliche Push-Nachricht");
    for (const text of [PUSH_TEXTS.on, PUSH_TEXTS.off, APP_STEP_TEXTS.iosNote]) {
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
