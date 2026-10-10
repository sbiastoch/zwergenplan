import { describe, expect, it } from "vitest";
import type { Anbieter, Provider } from "../../../src/domain/schema.ts";
import type { Candidate } from "./candidate.ts";
import { addressKey, matchCandidate } from "./match.ts";

/** Auszug aus dem echten Katalog (Orte, Namen, Programm-URLs). */
function anbieter(id: string, name: string, venues: Anbieter["venues"], programme: string[] = []): Anbieter {
  return {
    id,
    role: "anbieter",
    name,
    url: "https://example.org/",
    venues,
    programme: programme.map((url) => ({ url, kind: "ical" as const })),
    availability: { shown: "nein" },
    verified: "2026-10-04",
  };
}
const venue = (id: string, address: string, lat: number, lon: number) => ({
  id,
  name: id,
  address,
  ring: "aussen" as const,
  geo: { lat, lon },
});

const catalog: Provider[] = [
  anbieter(
    "ev-zerzabelshof-musikzwerge",
    "Ev. Auferstehungskirche Zerzabelshof – Musikzwerge",
    [venue("ev-zerzabelshof-musikzwerge", "Julius-Schieder-Platz 2, 90480 Nürnberg", 49.442366, 11.129887)],
    ["https://www.evangelische-termine.de/ical?vid=124"],
  ),
  anbieter("die-familienbox", "Die FamilienBox – Das 'Dorf' für Familien", [
    venue("die-familienbox", "Rosenaustraße 7 (Hinterhaus), 90429 Nürnberg", 49.449976, 11.062789),
  ]),
  anbieter("hebanne-schulz", "HebAnne – Hebamme Anne Schulz", [
    venue("hebanne-schulz", "Rosenaustraße 7 (Hinterhaus, FamilienBox), 90429 Nürnberg", 49.449976, 11.062789),
  ]),
  anbieter("fbs-nuernberg", "FBS – Evangelische Familien-Bildungsstätte Nürnberg", [
    venue("fbs-nuernberg", "Südliche Fürther Str. 20, 90429 Nürnberg", 49.449323, 11.06096),
    venue("fbs-nuernberg-waldracker", "Schiestlstraße, 90427 Nürnberg", 49.511053, 11.052141),
  ]),
  {
    ...anbieter("feb", "FEB Eltern-Kind-Gruppen", [venue("feb-x", "Irgendwo 1, 90402 Nürnberg", 49.45, 11.07)]),
    role: "verzeichnis",
  },
];

const cand = (over: Partial<Candidate>): Candidate => ({
  source: "frankenkids",
  sourceId: "1",
  title: "Krabbelgruppe",
  description: "",
  detailUrl: "https://example.org/k",
  cancelled: false,
  soldOut: false,
  waitlist: false,
  weekly: false,
  occurrences: [{ start: "2026-10-07T10:00" }],
  ...over,
});

describe("matchCandidate", () => {
  it("evangelische-termine: vid in der Programm-URL", () => {
    expect(
      matchCandidate(cand({ source: "evtermine", organizerId: "124", geo: { lat: 49.4424, lon: 11.1299 } }), catalog),
    ).toEqual({
      kind: "ok",
      providerId: "ev-zerzabelshof-musikzwerge",
      venueId: "ev-zerzabelshof-musikzwerge",
      via: "vid",
    });
  });

  it("Koordinaten in der Nähe eines Orts (auch weiterer Orte)", () => {
    expect(matchCandidate(cand({ geo: { lat: 49.5112, lon: 11.0523 } }), catalog)).toMatchObject({
      providerId: "fbs-nuernberg",
      venueId: "fbs-nuernberg-waldracker",
    });
  });

  it("geteilter Ort: der Veranstaltername entscheidet, sonst offen", () => {
    const geo = { lat: 49.44998, lon: 11.06279 };
    expect(matchCandidate(cand({ geo, organizer: "Die FamilienBox" }), catalog)).toMatchObject({
      kind: "ok",
      providerId: "die-familienbox",
      via: "geo+name",
    });
    expect(matchCandidate(cand({ geo, organizer: "Kulturverein" }), catalog)).toEqual({
      kind: "offen",
      reason: "Ort geteilt von die-familienbox, hebanne-schulz",
    });
  });

  it("gleiche Adresse trotz Schreibweise", () => {
    expect(matchCandidate(cand({ address: "Südl. Fürther Straße 20, 90429 Nürnberg" }), catalog)).toMatchObject({
      providerId: "fbs-nuernberg",
      venueId: "fbs-nuernberg",
      via: "adresse",
    });
  });

  it("Anbieter am Namen erkannt; Ort nur, wenn eindeutig", () => {
    expect(matchCandidate(cand({ organizer: "HebAnne – Hebamme Anne Schulz" }), catalog)).toMatchObject({
      providerId: "hebanne-schulz",
      via: "name",
    });
    expect(matchCandidate(cand({ organizer: "FBS – Evangelische Familien-Bildungsstätte Nürnberg" }), catalog)).toEqual(
      {
        kind: "offen",
        reason: "Anbieter am Namen erkannt, Ort unbekannt",
        providerId: "fbs-nuernberg",
      },
    );
    expect(
      matchCandidate(cand({ source: "evtermine", organizerId: "124", geo: { lat: 49.3, lon: 11.0 } }), catalog),
    ).toMatchObject({ kind: "ok", venueId: "ev-zerzabelshof-musikzwerge" });
  });

  it("vid erkannt, aber mehrere Orte und keine Ortsangabe → offen; Name aus dem Ortsfeld", () => {
    const multi = catalog.map((p) =>
      p.id === "ev-zerzabelshof-musikzwerge" && p.role === "anbieter"
        ? { ...p, venues: [...p.venues, venue("ev-zerzabelshof-saal", "Andere Str. 1, 90480 Nürnberg", 49.44, 11.12)] }
        : p,
    );
    expect(matchCandidate(cand({ source: "evtermine", organizerId: "124" }), multi)).toEqual({
      kind: "offen",
      reason: "Anbieter per vid erkannt, Ort unbekannt",
      providerId: "ev-zerzabelshof-musikzwerge",
    });
    expect(matchCandidate(cand({ location: "HebAnne – Hebamme Anne Schulz" }), catalog)).toMatchObject({
      providerId: "hebanne-schulz",
    });
    expect(matchCandidate(cand({}), catalog)).toEqual({ kind: "offen", reason: "Veranstalter nicht im Katalog" });
  });

  it("ignoriert Orte von Nicht-Anbietern und meldet Unbekanntes", () => {
    expect(matchCandidate(cand({ geo: { lat: 49.45, lon: 11.07 }, organizer: "FEB" }), catalog)).toEqual({
      kind: "offen",
      reason: "Veranstalter nicht im Katalog",
    });
  });
});

describe("addressKey", () => {
  it("normalisiert Straße, Nummer und PLZ", () => {
    expect(addressKey("Frankenstr. 29, 90443 Nürnberg")).toBe("frankenstrasse29|90443");
    expect(addressKey("Markuskirche / FreiRaum, Frankenstraße 29, 90443 Nürnberg")).toBe("frankenstrasse29|90443");
    expect(addressKey("Neumühlweg 20a, 90449 Nürnberg")).toBe("neumuehlweg20a|90449");
    expect(addressKey("wechselnd, Nürnberger Wald")).toBeUndefined();
    expect(addressKey(undefined)).toBeUndefined();
  });
});
