import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { escapeText, foldLine, icsForSeries, icsForSession, seriesIcsPath, sessionIcsPath } from "./ics.ts";
import { fixtureOffer, loadFixtures } from "./test-fixtures.ts";

const { providers, file } = loadFixtures();
function ctxFor(offerId: string) {
  const offer = file.offers.find((o) => o.id === offerId);
  const provider = providers.find((p) => p.id === offer?.providerId);
  const venue = provider?.venues.find((v) => v.id === offer?.venueId);
  if (!provider || !venue) throw new Error("Fixture unvollständig");
  return { providerName: provider.name, venue, stamp: file.generatedAt };
}

function parseEvents(ics: string) {
  const comp = new ICAL.Component(ICAL.parse(ics));
  return comp.getAllSubcomponents("vevent").map((v) => new ICAL.Event(v));
}

describe("icsForSeries", () => {
  const pekip = fixtureOffer("pekip-herbst");
  const ics = icsForSeries(pekip, ctxFor(pekip.id));

  it("ist gültiges iCalendar mit einem VEVENT je Termin", () => {
    const events = parseEvents(ics);
    expect(events).toHaveLength(8);
    expect(events[0]?.summary).toBe("PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026) (1/8)");
    expect(events[0]?.location).toBe("Familientreff Beispielhof, Beispielstraße 1, 90402 Nürnberg");
  });

  it("bleibt über die Zeitumstellung um 9:30 Berliner Zeit", () => {
    const starts = parseEvents(ics).map((e) => e.startDate.toJSDate().toISOString());
    expect(starts[1]).toBe("2026-10-20T07:30:00.000Z"); // Sommerzeit
    expect(starts[2]).toBe("2026-10-27T08:30:00.000Z"); // Winterzeit
  });

  it("hat stabile, eindeutige UIDs", () => {
    const uids = parseEvents(ics).map((e) => e.uid);
    expect(new Set(uids).size).toBe(8);
    expect(uids[0]).toBe(`${pekip.id}--20261013T0930@zwergenplan`);
    expect(icsForSeries(pekip, ctxFor(pekip.id))).toBe(ics); // deterministisch
  });

  it("nutzt CRLF und faltet lange Zeilen", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});

describe("icsForSession", () => {
  const treff = fixtureOffer("krabbeltreff");
  it("exportiert genau einen Termin einer regelmäßigen Reihe", () => {
    const session = treff.sessions[3];
    if (!session) throw new Error("Fixture");
    const events = parseEvents(icsForSession(treff, session, ctxFor(treff.id)));
    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe("Offener Krabbeltreff");
    expect(events[0]?.startDate.toJSDate().toISOString()).toBe("2026-10-28T09:00:00.000Z");
  });

  it("weist fremde Termine ab", () => {
    expect(() =>
      icsForSession(treff, { start: "2030-01-01T10:00:00+01:00", end: "2030-01-01T11:00:00+01:00" }, ctxFor(treff.id)),
    ).toThrow();
  });
});

describe("Pfade und Escaping", () => {
  it("leitet Dateipfade aus IDs ab", () => {
    const treff = fixtureOffer("krabbeltreff");
    expect(seriesIcsPath(treff)).toBe(`ics/${treff.id}.ics`);
    expect(sessionIcsPath(treff, treff.sessions[0] as never)).toBe(`ics/${treff.id}/20261007T1000.ics`);
  });

  it("escaped Sonderzeichen", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("zerteilt beim Falten keine Umlaute", () => {
    const folded = foldLine(`SUMMARY:${"ä".repeat(60)}`);
    expect(folded.split("\r\n ").join("")).toBe(`SUMMARY:${"ä".repeat(60)}`);
  });
});
