import { describe, expect, it } from "vitest";
import { validateDataset } from "../../../src/domain/dataset.ts";
import type { Provider } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import type { Candidate } from "./candidate.ts";
import { draftFromCandidate, looksRegular, providerFromCandidate, registrationOf } from "./draft.ts";

const { providers } = loadFixtures();
const familientreff = providers.find((p) => p.id === "familientreff-beispiel") as Provider; // alle Formate/Kosten
const bibliothek = providers.find((p) => p.id === "stadtbibliothek-beispiel") as Provider; // nur regelmäßig, kostenlos, ohne Anmeldung
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
      familientreff,
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

  it("nimmt Werte vom Anbieter, wenn er nur einen kennt", () => {
    const d = draftFromCandidate(cand({ title: "Fingerspiele" }), target, bibliothek);
    expect(d?.event).toMatchObject({ format: "regelmaessig", cost: "kostenlos", registration: "ohne-anmeldung" });
    expect(d?.event["topics"]).toEqual(["vorlesen", "bibliothek", "singen"]); // Text ohne Kategorie → Anbieterthemen
    expect(d?.open).toEqual(["summary"]);
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
      familientreff,
    );
    expect(d?.event).toMatchObject({
      format: "einmalig",
      registration: "mit-anmeldung",
      price: "5 €",
      url: "https://tickets.example/1",
      availability: { status: "unbekannt", note: "Plätze/Anmeldung: siehe https://tickets.example/1" },
    });
    expect(draftFromCandidate(cand({ soldOut: true }), target, familientreff)?.event["availability"]).toEqual({
      status: "ausgebucht",
    });
    expect(draftFromCandidate(cand({ waitlist: true }), target, familientreff)?.event["availability"]).toEqual({
      status: "warteliste",
    });
    expect(draftFromCandidate(cand({ cost: "Eintritt frei" }), target, familientreff)?.event).toMatchObject({
      cost: "kostenlos",
    });
  });

  it("lässt Abgesagtes weg", () => {
    expect(draftFromCandidate(cand({ cancelled: true }), target, familientreff)).toBeUndefined();
  });
});

describe("providerFromCandidate", () => {
  const kalender: Provider = { ...familientreff, id: "fk", role: "aggregator", adapter: "frankenkids", venues: [] };
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
      topics: ["fitness-mit-baby"],
      formats: ["regelmaessig"],
      costs: ["kostenpflichtig"],
      registrations: ["mit-anmeldung"],
      coveredBy: "fk",
      verified: "2026-10-04",
    });
    expect(p.venues[0]).toMatchObject({ id: "imiluv-studio", district: "Nordstadt", ring: "aussen" });
    const r = validateDataset([...providers, kalender, p], {
      generatedAt: "2026-10-04T12:00:00+02:00",
      horizon: { from: "2026-10-04", to: "2026-10-04" },
      offers: [],
    });
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("Fallbacks: Thema ohne Kategorie, Koordinaten als Adresse, kostenlos, ohne Sammelkalender", () => {
    const p = providerFromCandidate(cand({ title: "Papa-Frühstück", description: "kostenlos", organizer: "Verein" }), {
      id: "verein",
      geo: { lat: 49.45, lon: 11.08 },
      catalog: [],
      today: "2026-10-04",
    });
    expect(p.topics).toEqual(["vaeter", "eltern-kind-gruppe"]);
    expect(p.costs).toEqual(["kostenlos"]);
    expect(p.venues[0]?.address).toBe("49.45,11.08");
    expect(p.venues[0]?.district).toBeUndefined();
    expect(p.role === "anbieter" && p.coveredBy).toBeUndefined();
  });
});
