import { describe, expect, it } from "vitest";
import { registrationPhase } from "./registration.ts";

const OPENS = "2026-10-15T08:00:00+02:00";
const DEADLINE = "2026-10-31T23:59:00+01:00";
const at = (iso: string) => new Date(iso);
const plusMs = (iso: string, ms: number) => new Date(Date.parse(iso) + ms);

describe("registrationPhase", () => {
  it("kennt ohne Fenster keine Phase", () => {
    expect(registrationPhase(undefined, at("2026-10-05T12:00:00+02:00"))).toBeUndefined();
    expect(registrationPhase({}, at("2026-10-05T12:00:00+02:00"))).toBeUndefined();
  });

  it("ist „bald“, solange die Anmeldung noch nicht offen ist", () => {
    expect(registrationPhase({ opens: OPENS, deadline: DEADLINE }, at("2026-10-05T12:00:00+02:00"))).toBe("bald");
    expect(registrationPhase({ opens: OPENS }, plusMs(OPENS, -1))).toBe("bald");
  });

  it("ist ab dem Öffnen „offen“, die Grenze eingeschlossen", () => {
    expect(registrationPhase({ opens: OPENS, deadline: DEADLINE }, at(OPENS))).toBe("offen");
    expect(registrationPhase({ opens: OPENS }, at("2027-01-01T00:00:00+01:00"))).toBe("offen");
  });

  it("ist bis zum Anmeldeschluss einschließlich „offen“, danach „vorbei“", () => {
    expect(registrationPhase({ opens: OPENS, deadline: DEADLINE }, at(DEADLINE))).toBe("offen");
    expect(registrationPhase({ opens: OPENS, deadline: DEADLINE }, plusMs(DEADLINE, 1))).toBe("vorbei");
  });

  it("kommt mit nur einem Anmeldeschluss aus", () => {
    expect(registrationPhase({ deadline: DEADLINE }, at("2026-10-05T12:00:00+02:00"))).toBe("offen");
    expect(registrationPhase({ deadline: DEADLINE }, plusMs(DEADLINE, 1))).toBe("vorbei");
  });

  it("rechnet mit Zeitpunkten, nicht mit der Ortszeit des Geräts (Test läuft in LA)", () => {
    // 9.10. 23:59 Berlin = 9.10. 14:59 in LA: um 15:00 LA-Zeit ist die Frist vorbei.
    const deadline = "2026-10-09T23:59:00+02:00";
    expect(registrationPhase({ deadline }, at("2026-10-09T14:59:00-07:00"))).toBe("offen");
    expect(registrationPhase({ deadline }, at("2026-10-09T15:00:00-07:00"))).toBe("vorbei");
  });
});
