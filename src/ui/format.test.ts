import { describe, expect, it } from "vitest";
import type { SiteOffer } from "../domain/site-data.ts";
import { addDays, fromBerlinLocal } from "../domain/time.ts";
import {
  ageChipLabel,
  agendaHeading,
  ageRangeLabel,
  availabilityLabel,
  clock,
  dayHeading,
  formatFact,
  plural,
  shortDate,
  standDate,
  timeRange,
  weekTitle,
} from "./format.ts";

// Eigene Testangebote statt der Zod-Fixtures: src/ui bleibt zod-frei (no-zod-in-client), auch im Test.
const FIXTURE_NOW = new Date("2026-10-05T12:00:00+02:00");

/** Termine alle `step` Tage ab `firstDay`, Berliner Ortszeit */
function sessions(firstDay: string, count: number, step: number, from = "10:00", to = "11:00") {
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(firstDay, i * step);
    return { start: fromBerlinLocal(`${day}T${from}`), end: fromBerlinLocal(`${day}T${to}`) };
  });
}

function offer(fields: Pick<SiteOffer, "format" | "sessions"> & Partial<SiteOffer>): SiteOffer {
  return {
    id: "anbieter--titel--ort",
    providerId: "anbieter",
    venueId: "ort",
    title: "Titel",
    summary: "Zusammenfassung",
    topics: ["musik"],
    registration: "mit-anmeldung",
    cost: "kostenlos",
    availability: { status: "unbekannt", checkedAt: "2026-10-03T10:00:00+02:00" },
    url: "https://example.org/",
    sourceUrl: "https://example.org/",
    providerName: "Anbieter",
    venue: { name: "Ort", address: "Beispielweg 1", ring: "innen", geo: { lat: 49.45, lon: 11.08 } },
    ...fields,
  };
}

const OFFERS = {
  kurs: offer({ format: "kurs", sessions: sessions("2026-10-13", 8, 7, "09:30", "11:00") }),
  woechentlich: offer({ format: "regelmaessig", sessions: sessions("2026-10-07", 5, 7) }),
  vierzehntaegig: offer({ format: "regelmaessig", sessions: sessions("2026-10-09", 4, 14) }),
  einmalig: offer({ format: "einmalig", sessions: sessions("2026-12-06", 1, 0) }),
  wenige: offer({
    format: "einmalig",
    sessions: sessions("2026-10-17", 1, 0),
    availability: { status: "wenige", checkedAt: "2026-10-03T10:00:00+02:00" },
  }),
  ohneAnmeldung: offer({
    format: "einmalig",
    sessions: sessions("2026-10-17", 1, 0),
    availability: { status: "ohne-anmeldung", checkedAt: "2026-10-03T10:00:00+02:00" },
  }),
};

describe("Texte in fremder Zeitzone (Test läuft in America/Los_Angeles)", () => {
  it("nennt Berliner Uhrzeiten, auch über die Zeitumstellung", () => {
    expect(clock("2026-10-20T09:30:00+02:00")).toBe("9:30");
    expect(clock("2026-10-27T09:30:00+01:00")).toBe("9:30");
    expect(timeRange({ start: "2026-10-07T10:00:00+02:00", end: "2026-10-07T11:30:00+02:00" })).toBe("10:00–11:30");
  });

  it("benennt Tagesgruppen relativ zu heute", () => {
    expect(dayHeading("2026-10-05", "2026-10-05")).toEqual({ title: "Heute", sub: "Montag, 5. Oktober" });
    expect(dayHeading("2026-10-06", "2026-10-05")).toEqual({ title: "Morgen", sub: "Dienstag, 6. Oktober" });
    expect(dayHeading("2026-10-07", "2026-10-05")).toEqual({ title: "Mittwoch", sub: "7. Oktober" });
    expect(agendaHeading("2026-10-05", "2026-10-05")).toBe("Heute, 5. Oktober");
    expect(agendaHeading("2026-10-07", "2026-10-05")).toBe("Mittwoch, 7. Oktober");
  });

  it("schreibt Kurzdaten, Wochen und den Datenstand", () => {
    expect(shortDate("2026-10-06")).toBe("Di 6.10.");
    expect(weekTitle(["2026-10-05", "2026-10-11"])).toBe("5.–11. Oktober");
    expect(weekTitle(["2026-10-26", "2026-11-01"])).toBe("26. Okt. – 1. Nov.");
    expect(standDate("2026-10-03T23:30:00Z")).toBe("4.10.2026");
  });
});

describe("Fakten", () => {
  it("beschreibt Format und Rhythmus", () => {
    expect(formatFact(OFFERS.kurs, FIXTURE_NOW)).toBe("Kurs · 8 Termine");
    expect(formatFact(OFFERS.kurs, new Date("2026-11-11T12:00:00+01:00"))).toBe("Kurs · noch 3 von 8");
    expect(formatFact(OFFERS.woechentlich, FIXTURE_NOW)).toBe("Jeden Mittwoch");
    expect(formatFact(OFFERS.vierzehntaegig, FIXTURE_NOW)).toBe("Freitags");
    expect(formatFact(OFFERS.einmalig, FIXTURE_NOW)).toBe("Einmalig");
  });

  it("zeigt nur aussagekräftige Verfügbarkeit", () => {
    expect(availabilityLabel(OFFERS.wenige)).toBe("Wenige Plätze");
    expect(availabilityLabel(OFFERS.ohneAnmeldung)).toBeUndefined();
    expect(availabilityLabel(OFFERS.kurs)).toBeUndefined();
  });

  it("formuliert Alter und Mengen", () => {
    expect(ageRangeLabel(undefined)).toBe("0–36 Monate");
    expect(ageRangeLabel({ minMonths: 6, maxMonths: 24 })).toBe("6–24 Monate");
    expect(ageChipLabel(undefined)).toBe("Alter?");
    expect(ageChipLabel(11)).toBe("11 Mon.");
    expect(ageChipLabel(26)).toBe("2 J.");
    expect(plural(1, "Angebot", "Angebote")).toBe("1 Angebot");
    expect(plural(3, "Angebot", "Angebote")).toBe("3 Angebote");
  });
});
