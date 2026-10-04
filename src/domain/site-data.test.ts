import { describe, expect, it } from "vitest";
import { toSiteData } from "./site-data.ts";
import { loadFixtures } from "./test-fixtures.ts";
import { berlinDate, berlinKey, parseIsoDate, toIcsUtc } from "./time.ts";

describe("toSiteData", () => {
  const { providers, file } = loadFixtures();
  const site = toSiteData(providers, file);

  it("ergänzt Anbietername und Ort", () => {
    const pekip = site.offers.find((o) => o.id.includes("pekip-herbst"));
    expect(pekip?.providerName).toBe("Familientreff Beispielhof (fiktiv)");
    expect(pekip?.venue).toEqual({
      name: "Familientreff Beispielhof",
      address: "Beispielstraße 1, 90402 Nürnberg",
      district: "Altstadt",
      ring: "innen",
      geo: { lat: 49.4521, lon: 11.0767 },
    });
  });

  it("sortiert chronologisch nach erstem Termin", () => {
    const starts = site.offers.map((o) => Date.parse(o.sessions[0]?.start ?? ""));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(site.generatedAt).toBe(file.generatedAt);
  });

  it("lässt district weg, wenn der Ort keinen hat", () => {
    const [first] = providers;
    if (!first) throw new Error("Fixture");
    const { district: _omit, ...venue } = first.venues[0] ?? ({} as never);
    const site2 = toSiteData([{ ...first, venues: [venue] }], {
      ...file,
      offers: file.offers.filter((o) => o.providerId === first.id),
    });
    expect(site2.offers.every((o) => !("district" in o.venue))).toBe(true);
  });

  it("weist ungeprüfte Referenzen ab", () => {
    expect(() => toSiteData([], file)).toThrow("Ungeprüfte Daten");
  });
});

describe("time", () => {
  it("akzeptiert Strings und Date-Objekte", () => {
    const d = new Date("2026-10-25T00:30:00+02:00");
    expect(berlinDate(d)).toEqual({ year: 2026, month: 10, day: 25 });
    expect(toIcsUtc(d)).toBe("20261024T223000Z");
    expect(berlinKey("2026-10-25T02:30:00+01:00")).toBe("20261025T0230");
  });

  it("lehnt Nicht-ISO-Daten ab", () => {
    expect(() => parseIsoDate("2026-1-1")).toThrow("Kein ISO-Datum");
  });
});
