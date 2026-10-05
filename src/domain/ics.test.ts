import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { escapeText, foldLine, icsContextFor, icsForCollection, icsForSeries, icsForSession } from "./ics.ts";
import { toSiteData } from "./site-data.ts";
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

describe("icsForCollection", () => {
  const pekip = fixtureOffer("pekip-herbst");
  const treff = fixtureOffer("krabbeltreff");
  const ics = icsForCollection(
    [
      { offer: pekip, sessions: pekip.sessions, ctx: ctxFor(pekip.id) },
      { offer: treff, sessions: treff.sessions.slice(2), ctx: ctxFor(treff.id) },
    ],
    "Zwergenplan – Merkliste",
  );

  it("bündelt mehrere Angebote in einem Kalender", () => {
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(parseEvents(ics)).toHaveLength(8 + 3);
    expect(ics).toContain("X-WR-CALNAME:Zwergenplan – Merkliste");
  });

  it("nutzt dieselben UIDs und Titel wie die Einzeldateien", () => {
    const single = parseEvents(icsForSeries(pekip, ctxFor(pekip.id)));
    const events = parseEvents(ics);
    expect(events.slice(0, 8).map((e) => [e.uid, e.summary])).toEqual(single.map((e) => [e.uid, e.summary]));
    expect(events[8]?.uid).toBe(`${treff.id}--20261021T1000@zwergenplan`);
  });
});

// Pfade: ics-paths.test.ts
describe("Escaping", () => {
  it("escaped Sonderzeichen", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    expect(escapeText("x\ry\u0007z")).toBe("x\\nyz");
  });

  it("zerteilt beim Falten keine Umlaute", () => {
    const folded = foldLine(`SUMMARY:${"ä".repeat(60)}`);
    expect(folded.split("\r\n ").join("")).toBe(`SUMMARY:${"ä".repeat(60)}`);
  });
});

/** Die VEVENT-Blöcke einer Datei als Text, Zeilenfaltung unverändert. */
function veventBlocks(ics: string): string[] {
  return ics.match(/BEGIN:VEVENT\r\n[\s\S]*?END:VEVENT\r\n/g) ?? [];
}

describe("ADR 0007: Sammel-ICS und statische Dateien sind dieselben VEVENTs", () => {
  const site = toSiteData(providers, file);

  it("leitet den Kontext aus dem denormalisierten Angebot und dem Datenstand ab", () => {
    const pekip = site.offers.find((o) => o.id === fixtureOffer("pekip-herbst").id);
    if (!pekip) throw new Error("Fixture");
    const ctx = icsContextFor(pekip, site.generatedAt);
    const { name, address, geo } = pekip.venue;
    expect(ctx).toEqual({ providerName: pekip.providerName, venue: { name, address, geo }, stamp: site.generatedAt });
  });

  it("erzeugt für jedes Angebot byte-gleiche VEVENTs wie der Build (Reihe und Einzeltermin)", () => {
    const merkliste = icsForCollection(
      site.offers.map((offer) => ({ offer, sessions: offer.sessions, ctx: icsContextFor(offer, site.generatedAt) })),
      "Zwergenplan – Merkliste",
    );
    const build = site.offers.flatMap((offer) =>
      veventBlocks(icsForSeries(offer, icsContextFor(offer, site.generatedAt))),
    );
    expect(build.length).toBeGreaterThan(0);
    expect(veventBlocks(merkliste)).toEqual(build);

    const blocks = new Set(build);
    for (const offer of site.offers.filter((o) => o.format === "regelmaessig")) {
      for (const session of offer.sessions) {
        const [single] = veventBlocks(icsForSession(offer, session, icsContextFor(offer, site.generatedAt)));
        expect(single && blocks.has(single)).toBe(true);
      }
    }
  });

  it("wirft, wenn ein Termin nicht zum Angebot gehört", () => {
    const treff = fixtureOffer("krabbeltreff");
    const foreign = { start: "2030-01-01T10:00:00+01:00", end: "2030-01-01T11:00:00+01:00" };
    expect(() =>
      icsForCollection([{ offer: treff, sessions: [foreign], ctx: ctxFor(treff.id) }], "Zwergenplan – Merkliste"),
    ).toThrow(/gehört nicht zu/);
  });
});
