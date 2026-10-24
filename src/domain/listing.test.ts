import { describe, expect, it } from "vitest";
import { listingWeek } from "./listing.ts";

/** Sonntag, 25.10.2026: Ende der Sommerzeit um 3:00 */
const SUNDAY = new Date("2026-10-25T12:00:00+01:00");
const at = (listedAt: string) => listingWeek({ listedAt }, SUNDAY);

describe("listingWeek (Plan 0043, E3)", () => {
  it("ohne listedAt: früher eingestellt", () => {
    expect(listingWeek({}, SUNDAY)).toBe("frueher");
  });

  it("Berliner Kalendertage: 0–6 diese Woche, 7–13 vorige Woche, ab 14 früher", () => {
    expect(at("2026-10-25T05:00:00+01:00")).toBe("diese-woche"); // Tag 0
    expect(at("2026-10-19T00:00:00+02:00")).toBe("diese-woche"); // Tag 6, Mitternacht
    expect(at("2026-10-18T23:59:00+02:00")).toBe("vorige-woche"); // Tag 7
    expect(at("2026-10-12T00:00:00+02:00")).toBe("vorige-woche"); // Tag 13
    expect(at("2026-10-11T23:59:00+02:00")).toBe("frueher"); // Tag 14
  });

  it("nimmt den Berliner Tag, auch wenn UTC noch am Vortag ist", () => {
    // 22:30 UTC am 18.10. = 00:30 am 19.10. in Berlin → Tag 6
    expect(at("2026-10-18T22:30:00Z")).toBe("diese-woche");
    // 23:30 UTC am 25.10. ist in Berlin schon Montag, der 26.10.: Tag 14 statt 13
    expect(listingWeek({ listedAt: "2026-10-12T06:00:00+02:00" }, new Date("2026-10-25T23:30:00Z"))).toBe("frueher");
  });

  it("listedAt nach heute zählt zu dieser Woche (Push kam verspätet an, Review 4, M2)", () => {
    expect(at("2026-10-27T05:00:00+01:00")).toBe("diese-woche");
  });
});
