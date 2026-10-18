import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { freeDays, freeDaysOfRegion, OpenHolidaysResponse } from "./holidays.ts";

const api = (file: string) =>
  OpenHolidaysResponse.parse(
    JSON.parse(readFileSync(new URL(`../../../tests/fixtures/pipeline/api/${file}`, import.meta.url), "utf8")),
  );
const all = [...api("holidays-school-2026.json"), ...api("holidays-public-2026.json")];
/** Antworten für Bayern und NRW gemischt: Der Filter muss das Land auseinanderhalten (Plan 0039, E6) */
const mixed = [...all, ...api("holidays-school-nw-2026.json")];

describe("freeDays", () => {
  it("liefert Herbstferien und bayerische Feiertage im Zeitraum", () => {
    const days = freeDays(all, "DE-BY", "2026-10-01", "2026-11-30");
    expect(days["2026-10-03"]).toBe("Tag der Deutschen Einheit");
    expect(days["2026-11-01"]).toBe("Allerheiligen");
    expect(Object.keys(days).filter((d) => days[d] === "Herbstferien").length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(days).every((d) => d >= "2026-10-01" && d <= "2026-11-30")).toBe(true);
  });

  it("ignoriert regionale Feiertage außerhalb Bayerns bzw. nur in Augsburg", () => {
    const days = freeDays(api("holidays-public-2026.json"), "DE-BY", "2026-06-01", "2026-08-31");
    expect(days["2026-08-08"]).toBeUndefined(); // Friedensfest nur Augsburg
    expect(days["2026-08-15"]).toBe("Mariä Himmelfahrt");
    expect(days["2026-06-04"]).toBe("Fronleichnam"); // gilt auch in Bayern
  });

  it("ist nach Datum sortiert", () => {
    const keys = Object.keys(freeDays(all, "DE-BY", "2026-01-01", "2026-12-31"));
    expect(keys).toEqual([...keys].sort());
  });

  it("DE-NW: NRW-Ferien und -Feiertage, keine bayerischen", () => {
    const days = freeDays(mixed, "DE-NW", "2026-01-01", "2026-12-31");
    expect(days["2026-10-19"]).toBe("Herbstferien"); // NRW 17.–31.10.
    expect(days["2026-11-03"]).toBeUndefined(); // bayerische Herbstferien
    expect(days["2026-11-18"]).toBeUndefined(); // Buß- und Bettag nur in Bayern schulfrei
    expect(days["2026-01-06"]).toBeUndefined(); // Heilige Drei Könige nicht in NRW
    expect(freeDays(mixed, "DE-NW", "2026-08-15", "2026-08-15")).toEqual({ "2026-08-15": "Sommerferien" }); // nicht Mariä Himmelfahrt
    expect(days["2026-11-01"]).toBe("Allerheiligen"); // gilt in beiden
    expect(days["2026-06-04"]).toBe("Fronleichnam");
    expect(days["2026-10-03"]).toBe("Tag der Deutschen Einheit"); // bundesweit
  });

  it("DE-BY: bayerische Ferien, keine aus NRW", () => {
    const days = freeDays(mixed, "DE-BY", "2026-01-01", "2026-12-31");
    expect(days["2026-11-03"]).toBe("Herbstferien");
    expect(days["2026-10-19"]).toBeUndefined();
    expect(days["2026-07-21"]).toBeUndefined(); // NRW-Sommerferien beginnen am 20.07., Bayern erst am 03.08.
    expect(days["2026-01-06"]).toBe("Heilige Drei Könige");
  });
});

describe("freeDaysOfRegion", () => {
  const byNetwork = { vgn: { "2026-11-03": "Herbstferien" }, vrr: { "2026-10-19": "Herbstferien" } };

  it("wählt die Map über das Netz der Region", () => {
    expect(freeDaysOfRegion(byNetwork, "fuerth")).toBe(byNetwork.vgn);
    expect(freeDaysOfRegion(byNetwork, "nuernberg")).toBe(byNetwork.vgn);
    expect(freeDaysOfRegion(byNetwork, "duesseldorf")).toBe(byNetwork.vrr);
  });

  it("fehlt die Map des Netzes, ist das ein Fehler statt still keine Ferien", () => {
    expect(() => freeDaysOfRegion({ vgn: {} }, "duesseldorf")).toThrow(/vrr/);
  });
});
