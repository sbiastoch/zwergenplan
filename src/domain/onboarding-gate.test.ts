import { describe, expect, it } from "vitest";
import { onboardingGate } from "./onboarding-gate.ts";

describe("onboardingGate (Plan 0033, E2)", () => {
  const base = { storage: true, done: false, stored: false, deepLink: false };

  it("erster Start ohne Angaben: zeigen", () => {
    expect(onboardingGate(base)).toBe("zeigen");
  });

  it("Bestandsnutzer mit gespeicherten Angaben: still erledigt", () => {
    expect(onboardingGate({ ...base, stored: true })).toBe("still-erledigt");
  });

  it("erledigt, Deep-Link oder kein nutzbarer Speicher: nichts", () => {
    expect(onboardingGate({ ...base, done: true })).toBe("nichts");
    expect(onboardingGate({ ...base, done: true, stored: true })).toBe("nichts");
    expect(onboardingGate({ ...base, deepLink: true })).toBe("nichts");
    expect(onboardingGate({ ...base, deepLink: true, stored: true })).toBe("nichts");
    expect(onboardingGate({ ...base, storage: false })).toBe("nichts");
    expect(onboardingGate({ ...base, storage: false, stored: true })).toBe("nichts");
  });
});
