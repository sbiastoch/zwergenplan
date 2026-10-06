import { describe, expect, it } from "vitest";
import { berlinDay, PUSH_CRON, PUSH_TIMEZONE, shouldSendNow } from "./push-schedule.ts";

const at = (iso: string) => shouldSendNow(new Date(iso));

describe("shouldSendNow", () => {
  it("sendet samstags ab 10 Uhr Berliner Zeit, im Sommer und im Winter", () => {
    expect(at("2026-10-10T10:07:00+02:00")).toBe(true);
    expect(at("2026-12-05T10:07:00+01:00")).toBe(true);
    // Der Runner läuft in UTC: 08:07 UTC im Sommer und 09:07 UTC im Winter sind beide 10:07 in Berlin.
    expect(at("2026-10-10T08:07:00Z")).toBe(true);
    expect(at("2026-12-05T09:07:00Z")).toBe(true);
    expect(at("2026-12-05T08:07:00Z")).toBe(false);
  });

  it("sendet nur zwischen 10:00 und 14:00 (ein verspäteter Lauf zählt noch, ein Re-run am Abend nicht)", () => {
    expect(at("2026-10-10T09:59:59+02:00")).toBe(false);
    expect(at("2026-10-10T10:00:00+02:00")).toBe(true);
    expect(at("2026-10-10T13:59:59+02:00")).toBe(true);
    expect(at("2026-10-10T14:00:00+02:00")).toBe(false);
  });

  it("sendet an keinem anderen Tag", () => {
    expect(at("2026-10-09T10:07:00+02:00")).toBe(false);
    expect(at("2026-10-11T10:07:00+02:00")).toBe(false);
    expect(at("2026-10-12T10:07:00+02:00")).toBe(false);
  });

  it("gilt auch an den Umstellungs-Wochenenden", () => {
    // Samstag vor dem Ende der Sommerzeit (25.10.2026) und vor ihrem Beginn (28.3.2027)
    expect(at("2026-10-24T10:07:00+02:00")).toBe(true);
    expect(at("2026-10-31T10:07:00+01:00")).toBe(true);
    expect(at("2027-03-27T10:07:00+01:00")).toBe(true);
    expect(at("2027-04-03T10:07:00+02:00")).toBe(true);
    expect(at("2026-10-25T10:07:00+01:00")).toBe(false);
  });
});

describe("berlinDay", () => {
  it("nimmt den Berliner Kalendertag für die Versand-Marke", () => {
    expect(berlinDay(new Date("2026-10-10T08:07:00Z"))).toBe("2026-10-10");
    expect(berlinDay(new Date("2026-10-10T22:30:00Z"))).toBe("2026-10-11");
  });
});

describe("Zeitplan", () => {
  it("steht für Samstag 10:07 in Berliner Zeit (Minute 7: volle Stunden verwirft GitHub unter Last)", () => {
    expect(PUSH_CRON).toBe("7 10 * * 6");
    expect(PUSH_TIMEZONE).toBe("Europe/Berlin");
  });
});
