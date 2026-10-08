import { describe, expect, it } from "vitest";
import {
  ageRangeLabel,
  availabilityLabel,
  clock,
  costLabel,
  monthShort,
  registrationLabel,
  timeRange,
  weekdayName,
} from "./labels.ts";
import type { SiteOffer } from "./site-data.ts";
import { fixtureSiteOffers } from "./test-fixtures.ts";

const offers = fixtureSiteOffers();
const byTitle = (title: string): SiteOffer => {
  const offer = offers.find((o) => o.title === title);
  if (!offer) throw new Error(`Fixture ${title} fehlt`);
  return offer;
};

describe("Monatsnamen kurz (Plan 0026, E3, Review m8)", () => {
  it("kürzt nur, wo es üblich ist", () => {
    expect([5, 6, 7].map(monthShort)).toEqual(["Mai", "Juni", "Juli"]);
    expect([1, 2, 3, 9, 10, 12].map(monthShort)).toEqual(["Jan.", "Feb.", "März", "Sept.", "Okt.", "Dez."]);
  });
});

describe("Datumswörter und Uhrzeit in Berlin (Test läuft in America/Los_Angeles)", () => {
  it("Wochentag aus der ISO-Nummer", () => {
    expect(weekdayName(1)).toBe("Montag");
    expect(weekdayName(7)).toBe("Sonntag");
  });
  it("Uhrzeit über den Wechsel auf Winterzeit", () => {
    expect(clock("2026-10-20T09:30:00+02:00")).toBe("9:30");
    expect(clock("2026-10-27T09:30:00+01:00")).toBe("9:30");
    expect(timeRange({ start: "2026-10-27T09:30:00+01:00", end: "2026-10-27T11:00:00+01:00" })).toBe("9:30–11:00");
  });
});

describe("Fakten wie im Detail (aus src/ui/format.ts verschoben)", () => {
  it("Kosten, Anmeldung, Alter, Plätze", () => {
    const krabbeltreff = byTitle("Offener Krabbeltreff");
    expect(costLabel(krabbeltreff)).toBe("Kostenlos");
    expect(costLabel({ ...krabbeltreff, cost: "kostenpflichtig", price: "8 €" })).toBe("8 €");
    const { price: _, ...ohnePreis } = { ...krabbeltreff, cost: "kostenpflichtig" as const, price: "x" };
    expect(costLabel(ohnePreis)).toBe("Kostenpflichtig");
    expect(registrationLabel(krabbeltreff)).toBe("Ohne Anmeldung");
    expect(registrationLabel(byTitle("PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026)"))).toBe("Anmeldung nötig");
    expect(ageRangeLabel(undefined)).toBe("0–36 Monate");
    expect(ageRangeLabel({ minMonths: 6, maxMonths: 24 })).toBe("6–24 Monate");
    expect(availabilityLabel(krabbeltreff)).toBeUndefined();
  });
});
