import { describe, expect, it } from "vitest";
import { onboardingGate } from "./onboarding-gate.ts";

describe("onboardingGate (Plan 0033, E2; Plan 0035, E3)", () => {
  it("zeigen nur mit nutzbarem Speicher, ohne Flag und ohne Deep-Link; gespeicherte Angaben spielen keine Rolle", () => {
    for (const storage of [true, false]) {
      for (const done of [true, false]) {
        for (const deepLink of [true, false]) {
          const expected = storage && !done && !deepLink ? "zeigen" : "nichts";
          expect(onboardingGate({ storage, done, deepLink }), JSON.stringify({ storage, done, deepLink })).toBe(
            expected,
          );
        }
      }
    }
  });
});
