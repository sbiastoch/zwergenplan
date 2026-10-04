import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { freeDays, OpenHolidaysResponse } from "./holidays.ts";

const api = (file: string) =>
  OpenHolidaysResponse.parse(
    JSON.parse(readFileSync(new URL(`../../../tests/fixtures/pipeline/api/${file}`, import.meta.url), "utf8")),
  );
const all = [...api("holidays-school-2026.json"), ...api("holidays-public-2026.json")];

describe("freeDays", () => {
  it("liefert Herbstferien und bayerische Feiertage im Zeitraum", () => {
    const days = freeDays(all, "2026-10-01", "2026-11-30");
    expect(days["2026-10-03"]).toBe("Tag der Deutschen Einheit");
    expect(days["2026-11-01"]).toBe("Allerheiligen");
    expect(Object.keys(days).filter((d) => days[d] === "Herbstferien").length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(days).every((d) => d >= "2026-10-01" && d <= "2026-11-30")).toBe(true);
  });

  it("ignoriert regionale Feiertage außerhalb Bayerns bzw. nur in Augsburg", () => {
    const days = freeDays(api("holidays-public-2026.json"), "2026-06-01", "2026-08-31");
    expect(days["2026-08-08"]).toBeUndefined(); // Friedensfest nur Augsburg
    expect(days["2026-08-15"]).toBe("Mariä Himmelfahrt");
    expect(days["2026-06-04"]).toBe("Fronleichnam"); // gilt auch in Bayern
  });

  it("ist nach Datum sortiert", () => {
    const keys = Object.keys(freeDays(all, "2026-01-01", "2026-12-31"));
    expect(keys).toEqual([...keys].sort());
  });
});
