import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIcal } from "./ical.ts";

describe("parseIcal", () => {
  it("liest den evangelische-termine-Feed (Snapshot)", () => {
    const text = readFileSync(
      new URL("../../../tests/fixtures/pipeline/api/evtermine-vid124.ics", import.meta.url),
      "utf8",
    );
    const events = parseIcal(text);
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events[1]).toMatchObject({
      SUMMARY: "Musikzwerge für Eltern mit Kind ab ca. 2 Jahren",
      DTSTART: "20261005T091500",
      DTEND: "20261005T101500",
      LOCATION: "Nürnberg: Miniclubraum im gr. Saal",
    });
    // VTIMEZONE-Regeln gehören zu keinem Termin
    expect(events.some((e) => e.RRULE?.includes("BYMONTH=10"))).toBe(false);
  });

  it("entfaltet Zeilen, löst Escapes auf und kürzt Beschreibungen", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:Krabbelgruppe\\, offen\\; mit Kaffee",
      "DESCRIPTION:Zeile eins\\nZeile",
      "  zwei",
      `X-UNBEKANNT:${"x".repeat(5)}`,
      "OHNE-DOPPELPUNKT",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseIcal(text)).toEqual([
      { SUMMARY: "Krabbelgruppe, offen; mit Kaffee", DESCRIPTION: "Zeile eins Zeile zwei" },
    ]);
    const long = parseIcal(`BEGIN:VEVENT\nDESCRIPTION:${"a".repeat(400)}\nEND:VEVENT`);
    expect(long[0]?.DESCRIPTION).toHaveLength(300);
  });
});
