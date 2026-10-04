import { describe, expect, it } from "vitest";
import { addDays, addMonths, fromBerlinLocal, isoWeekday } from "./time.ts";

describe("fromBerlinLocal", () => {
  it("setzt den Offset nach Sommer- bzw. Winterzeit", () => {
    expect(fromBerlinLocal("2026-10-13T09:30")).toBe("2026-10-13T09:30:00+02:00");
    expect(fromBerlinLocal("2026-11-03T09:30")).toBe("2026-11-03T09:30:00+01:00");
    expect(fromBerlinLocal("2027-01-01T00:00")).toBe("2027-01-01T00:00:00+01:00");
  });

  it("wählt in der doppelten Stunde (Oktober) die frühere Variante", () => {
    expect(fromBerlinLocal("2026-10-25T02:30")).toBe("2026-10-25T02:30:00+02:00");
    expect(fromBerlinLocal("2026-10-25T03:00")).toBe("2026-10-25T03:00:00+01:00");
    expect(fromBerlinLocal("2026-10-25T01:59")).toBe("2026-10-25T01:59:00+02:00");
  });

  it("wirft für die fehlende Stunde (März)", () => {
    expect(() => fromBerlinLocal("2027-03-28T02:30")).toThrow("gibt es in Berlin nicht");
    expect(fromBerlinLocal("2027-03-28T03:00")).toBe("2027-03-28T03:00:00+02:00");
  });

  it("lehnt andere Formate ab", () => {
    expect(() => fromBerlinLocal("2026-10-13 09:30")).toThrow("Keine lokale Zeit");
    expect(() => fromBerlinLocal("2026-10-13T09:30:00+02:00")).toThrow("Keine lokale Zeit");
  });
});

describe("Kalenderrechnung", () => {
  it("addiert Tage über Monats- und Jahresgrenzen", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-25", 7)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("addiert Monate und kappt am Monatsende", () => {
    expect(addMonths("2026-10-04", 4)).toBe("2027-02-04");
    expect(addMonths("2026-10-31", 4)).toBe("2027-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("liefert den ISO-Wochentag (1 = Montag)", () => {
    expect(isoWeekday("2026-10-05")).toBe(1);
    expect(isoWeekday("2026-10-11")).toBe(7);
  });
});
