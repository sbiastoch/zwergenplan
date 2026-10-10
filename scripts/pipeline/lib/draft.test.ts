import { describe, expect, it } from "vitest";
import { validateDataset } from "../../../src/domain/dataset.ts";
import type { Provider } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import type { Candidate } from "./candidate.ts";
import { draftFromCandidate, looksRegular, providerFromCandidate, registrationOf } from "./draft.ts";

const { providers } = loadFixtures();
const target = { providerId: "familientreff-beispiel", venueId: "familientreff-beispiel-haus" };

const cand = (over: Partial<Candidate>): Candidate => ({
  source: "evtermine",
  sourceId: "1",
  title: "Krabbelgruppe",
  description: "",
  detailUrl: "https://example.org/detail",
  cancelled: false,
  soldOut: false,
  waitlist: false,
  weekly: false,
  occurrences: [{ start: "2026-10-05T15:30", end: "2026-10-05T17:30" }],
  ...over,
});

describe("looksRegular / registrationOf", () => {
  it("erkennt wöchentliche und 14-tägliche Einzeltermine zur gleichen Uhrzeit", () => {
    expect(looksRegular([{ start: "2026-10-05T15:30" }, { start: "2026-10-12T15:30" }])).toBe(true);
    expect(looksRegular([{ start: "2026-10-08T10:45" }, { start: "2026-10-22T10:45" }])).toBe(true);
    expect(looksRegular([{ start: "2026-10-05T15:30" }, { start: "2026-10-12T16:00" }])).toBe(false);
    expect(looksRegular([{ start: "2026-10-05T15:30" }])).toBe(false);
  });

  it("liest die Anmeldung aus dem Text", () => {
    expect(registrationOf(cand({ description: "Anmeldung über unsere App" }))).toBe("mit-anmeldung");
    expect(registrationOf(cand({ description: "Einfach vorbeikommen, ohne Anmeldung" }))).toBe("ohne-anmeldung");
    expect(registrationOf(cand({}))).toBeUndefined();
  });
});

describe("draftFromCandidate", () => {
  it("leitet ab, was eindeutig ist, und listet offene Pflichtfelder", () => {
    const d = draftFromCandidate(
      cand({
        occurrences: [{ start: "2026-10-05T15:30" }, { start: "2026-10-12T15:30" }],
        description: "ohne Anmeldung",
      }),
      target,
    );
    expect(d?.event).toMatchObject({
      ...target,
      title: "Krabbelgruppe",
      summary: "",
      topics: ["krabbelgruppe"],
      format: "regelmaessig",
      registration: "ohne-anmeldung",
      availability: { status: "ohne-anmeldung" },
      schedule: { kind: "dates", dates: [{ start: "2026-10-05T15:30" }, { start: "2026-10-12T15:30" }] },
      via: "evtermine",
    });
    expect(d?.event["cost"]).toBeUndefined();
    expect(d?.open).toEqual(["summary", "cost"]);
  });

  it("ohne Rückfall aus dem Katalog: Format, Kosten, Anmeldung und Themen bleiben offen (Plan 0030)", () => {
    const d = draftFromCandidate(cand({ title: "Fingerspiele" }), target);
    expect(d?.event).toMatchObject({ format: "einmalig", topics: [] });
    expect(d?.event["cost"]).toBeUndefined();
    expect(d?.event["registration"]).toBeUndefined();
    expect(d?.open).toEqual(["summary", "topics", "format", "registration", "cost"]);
  });

  it("Einzeltermin, Preis, Ticketlink, Warteliste, ausverkauft, Anmeldung laut Quelle", () => {
    const d = draftFromCandidate(
      cand({
        source: "stadt-vk",
        title: "Krabbelkonzert",
        cost: "5 €",
        ticketUrl: "https://tickets.example/1",
        registrationRequired: true,
      }),
      target,
    );
    expect(d?.event).toMatchObject({
      format: "einmalig",
      registration: "mit-anmeldung",
      price: "5 €",
      url: "https://tickets.example/1",
      availability: { status: "unbekannt", note: "Plätze/Anmeldung: siehe https://tickets.example/1" },
    });
    expect(draftFromCandidate(cand({ soldOut: true }), target)?.event["availability"]).toEqual({
      status: "ausgebucht",
    });
    expect(draftFromCandidate(cand({ waitlist: true }), target)?.event["availability"]).toEqual({
      status: "warteliste",
    });
    expect(draftFromCandidate(cand({ cost: "Eintritt frei" }), target)?.event).toMatchObject({
      cost: "kostenlos",
    });
  });

  it("lässt Abgesagtes weg", () => {
    expect(draftFromCandidate(cand({ cancelled: true }), target)).toBeUndefined();
  });
});

describe("providerFromCandidate", () => {
  const kalender: Provider = {
    id: "fk",
    role: "aggregator",
    region: "nuernberg",
    adapter: "frankenkids",
    name: "Sammelkalender (fiktiv)",
    url: "https://example.org/fk",
    programme: [{ url: "https://example.org/fk", kind: "html" }],
    availability: { shown: "nein" },
    verified: "2026-10-04",
  };
  it("baut einen gültigen Anbieter mit Hauptort, Ring und coveredBy", () => {
    const p = providerFromCandidate(
      cand({
        source: "frankenkids",
        title: "Barre für Mamas & Babys",
        description: "Anmeldung über die App",
        location: "IMILUV Studio",
        address: "Schopenhauer Str. 10, 90409 Nürnberg",
        organizerUrl: "https://imiluv.de",
        occurrences: [{ start: "2026-10-08T10:45" }, { start: "2026-10-22T10:45" }],
      }),
      {
        id: "imiluv-studio",
        geo: { lat: 49.4677, lon: 11.0895, district: "Nordstadt" },
        catalog: [kalender],
        today: "2026-10-04",
      },
    );
    expect(p).toMatchObject({
      id: "imiluv-studio",
      role: "anbieter",
      name: "IMILUV Studio",
      url: "https://imiluv.de",
      coveredBy: "fk",
      verified: "2026-10-04",
    });
    for (const facet of ["topics", "formats", "costs", "registrations"]) expect(p).not.toHaveProperty(facet);
    // Plan 0031: Region aus dem Sammelkalender, Hauptort ohne ring, Programmseite für Termine
    expect(p.region).toBe("nuernberg");
    expect(p.venues[0]).not.toHaveProperty("ring");
    expect(p.programme).toEqual([{ url: "https://imiluv.de", kind: "html", use: "termine" }]);
    expect(p.notes).toEqual(["Aus frankenkids aufgenommen (https://example.org/detail)."]);
    expect(p.venues[0]).toMatchObject({ id: "imiluv-studio", district: "Nordstadt" });
    const r = validateDataset([...providers, kalender, p], {
      generatedAt: "2026-10-04T12:00:00+02:00",
      horizon: { from: "2026-10-04", to: "2026-10-04" },
      offers: [],
    });
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("evangelische-termine: die vid kommt als Programmseite dazu, sonst scheitert coveredBy (Plan 0031)", () => {
    const evKalender: Provider = { ...kalender, id: "et", adapter: "evtermine" };
    const p = providerFromCandidate(cand({ organizer: "Ev. Gemeinde", organizerId: "579" }), {
      id: "ev-gemeinde",
      geo: { lat: 49.45, lon: 11.08 },
      catalog: [evKalender],
      today: "2026-10-04",
    });
    expect(p.coveredBy).toBe("et");
    expect(p.programme.at(-1)).toEqual({
      url: "https://www.evangelische-termine.de/ical?vid=579",
      kind: "ical",
      use: "termine",
    });
    const r = validateDataset([...providers, evKalender, p], {
      generatedAt: "2026-10-04T12:00:00+02:00",
      horizon: { from: "2026-10-04", to: "2026-10-04" },
      offers: [],
    });
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("Fallbacks: Koordinaten als Adresse, ohne Sammelkalender", () => {
    const p = providerFromCandidate(cand({ title: "Papa-Frühstück", description: "kostenlos", organizer: "Verein" }), {
      id: "verein",
      geo: { lat: 49.45, lon: 11.08 },
      catalog: [],
      today: "2026-10-04",
    });
    expect(p.venues[0]?.address).toBe("49.45,11.08");
    expect(p.venues[0]?.district).toBeUndefined();
    expect(p.role === "anbieter" && p.coveredBy).toBeUndefined();
  });
});
