import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Candidate, plainText } from "../candidate.ts";
import { EvtermineResponse, normalizeEvtermine } from "./evtermine.ts";
import { FrankenkidsPage, normalizeFrankenkids } from "./frankenkids.ts";
import { normalizeStadtVk, StadtVkResponse } from "./stadt-vk.ts";

const snapshot = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../../tests/fixtures/pipeline/api/${file}`, import.meta.url), "utf8"));

const FROM = "2026-10-05";
const TO = "2027-02-04";

describe("Stadt-Kalender (Snapshot „Baby“)", () => {
  const raw = StadtVkResponse.parse(snapshot("stadt-vk-baby.json")).VERANSTALTUNGEN ?? [];
  const candidates = normalizeStadtVk(raw, FROM, TO);

  it("filtert auf Baby-Bezug und liefert gültige Kandidaten", () => {
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) Candidate.parse(c);
    expect(candidates.some((c) => c.title.includes("crisprbaby"))).toBe(true); // großzügig – Agent entscheidet
  });

  it("nimmt nur Termine im Zeitraum, mit Ende, Ort und Koordinaten", () => {
    const museum = candidates.find((c) => c.title.startsWith("Baby & Museum"));
    expect(museum?.occurrences[0]).toEqual({ start: "2026-10-09T10:30", end: "2026-10-09T11:30" });
    expect(museum?.occurrences.every((o) => o.start >= FROM)).toBe(true);
    expect(museum?.geo?.lat).toBeCloseTo(49.4478, 3);
    expect(museum?.detailUrl).toBe("https://www.nuernberg.de/internet/stadtportal/veranstaltung.html?vid=378173");
  });

  it("wertet abgesagt/ausverkauft/Anmeldung und String-Terminlisten aus", () => {
    const [c] = normalizeStadtVk(
      [
        {
          VERANSTALTUNGID: 1,
          TITEL: "Krabbelkonzert",
          ALLETERMINE: "{'2026-11-02T10:00': {'E': '2026-11-02 11:00'}, '2026-12-24T10:00': None}",
          ABGESAGT: 1,
          AUSVERKAUFT: "1",
          ANMELDUNG: 0,
          ORTSLAT: "0",
        },
        { VERANSTALTUNGID: 1, TITEL: "Krabbelkonzert (Dublette)", ALLETERMINE: {} },
        { VERANSTALTUNGID: 2, TITEL: "Babykino", ALLETERMINE: "kaputt" },
        { VERANSTALTUNGID: 3, TITEL: "Orgelkonzert", ALLETERMINE: { "2026-11-02T20:00": null } },
      ],
      FROM,
      TO,
    );
    expect(c).toMatchObject({ cancelled: true, soldOut: true, registrationRequired: false });
    expect(c?.occurrences).toEqual([
      { start: "2026-11-02T10:00", end: "2026-11-02T11:00" },
      { start: "2026-12-24T10:00" },
    ]);
    expect(c?.geo).toBeUndefined();
  });
});

describe("frankenkids (Snapshot Seite 1)", () => {
  const page = FrankenkidsPage.parse(snapshot("frankenkids-seite1.json"));
  const candidates = normalizeFrankenkids(page.events);

  it("filtert, dekodiert Entities und bündelt nach Titel + Ort", () => {
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) Candidate.parse(c);
    const titles = candidates.map((c) => c.title);
    expect(titles).toContain("Barre für Mamas & Babys");
    expect(titles.some((t) => t.startsWith("Taekwon-Do"))).toBe(false);
    expect(titles.every((t) => !t.includes("&#"))).toBe(true);
  });

  it("verwirft Orte außerhalb Nürnbergs und bündelt Wiederholungen", () => {
    const base = page.events.find((e) => e.title.startsWith("PEKiP"));
    if (!base) throw new Error("Snapshot ohne PEKiP");
    const out = normalizeFrankenkids([
      base,
      { ...base, id: 2, start_date: "2026-10-14 09:30:00", end_date: "2026-10-14 10:45:00" },
      { ...base, id: 3, venue: { venue: "Anderswo", city: "Fürth" } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.occurrences.map((o) => o.start)).toEqual(["2026-10-07T09:30", "2026-10-14T09:30"]);
  });
});

describe("evangelische-termine (Snapshot „krabbel“)", () => {
  const entries = EvtermineResponse.parse(snapshot("evtermine-krabbel.json")).flatMap((x) =>
    x.Veranstaltung ? [x.Veranstaltung] : [],
  );
  const candidates = normalizeEvtermine(entries, FROM, TO);

  it("expandiert „jeweils“-Reihen wöchentlich ab dem Zeitraumbeginn", () => {
    const kaefer = candidates.find((c) => c.title === "Krabbelkäfer");
    expect(kaefer?.weekly).toBe(true);
    expect(kaefer?.organizerId).toBe("1858");
    expect(kaefer?.occurrences[0]).toEqual({ start: "2026-10-07T10:00", end: "2026-10-07T11:30" });
    expect(kaefer?.occurrences.at(-1)?.start).toBe("2026-12-23T10:00");
    expect(kaefer?.address).toBe("Südl. Fürther Str. 20, 90429 Nürnberg");
    expect(kaefer?.geo).toBeUndefined();
  });

  it("bündelt Einzeltermine nach Titel, Veranstalter und Ort; Ende 00:00 gilt als unbekannt", () => {
    const zwerge = candidates.find((c) => c.title.startsWith("Musikzwerge für Eltern mit Baby"));
    expect(zwerge?.organizerId).toBe("124");
    expect(zwerge?.occurrences.map((o) => o.start)).toEqual(["2026-10-05T10:30", "2026-10-12T10:30"]);
    expect(zwerge?.geo?.lat).toBeCloseTo(49.4424, 3);
    const ohneEnde = candidates.flatMap((c) => c.occurrences).find((o) => o.start === "2026-10-06T10:30" && !o.end);
    expect(ohneEnde).toBeDefined();
  });

  it("filtert Orte außerhalb Nürnbergs, Warteliste und abschaltbaren Relevanzfilter", () => {
    const first = entries.find((e) => e.MODE !== "jeweils");
    if (!first) throw new Error("Snapshot leer");
    const out = normalizeEvtermine(
      [
        { ...first, ID: "x1", _place_CITY: "Schwaig" },
        { ...first, ID: "x2", _event_TITLE: "Gemeindefest (Warteliste)", MODE: "vonbis" },
      ],
      FROM,
      TO,
      { filter: false },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.waitlist).toBe(true);
    const [abgesagt] = normalizeEvtermine(
      [{ ...first, ID: "x4", _event_TITLE: "Krabbelgruppe – entfällt!" }],
      FROM,
      TO,
    );
    expect(abgesagt?.cancelled).toBe(true);
    expect(
      normalizeEvtermine([{ ...first, ID: "x3", _event_TITLE: "Gemeindefest", _event_LONG_DESCRIPTION: "" }], FROM, TO),
    ).toEqual([]);
  });
});

describe("Randfälle der Quellen", () => {
  it("frankenkids: Ort als leeres Array, ohne Veranstalter und Adresse", () => {
    const [c] = normalizeFrankenkids([
      {
        id: 9,
        title: "Babytreff",
        start_date: "2026-10-05 10:00:00",
        end_date: "2026-10-05 11:00:00",
        url: "https://www.frankenkids.de/x",
        venue: [],
        cost: "",
      },
    ]);
    expect(c).toMatchObject({ title: "Babytreff", detailUrl: "https://www.frankenkids.de/x" });
    expect(c?.organizer).toBeUndefined();
    expect(c?.address).toBeUndefined();
    expect(c?.location).toBeUndefined();
  });

  it("evangelische-termine: ohne Straße, Koordinaten, Link und Veranstalter", () => {
    const [c] = normalizeEvtermine(
      [{ ID: "77", START: "2026-10-06 09:00:00", _event_TITLE: "Miniclub", _event_SHORT_DESCRIPTION: "Für Babys" }],
      FROM,
      TO,
    );
    expect(c).toMatchObject({
      detailUrl: "https://www.evangelische-termine.de/detail-bt?ID=77",
      description: "Für Babys",
    });
    expect(c?.occurrences).toEqual([{ start: "2026-10-06T09:00" }]);
    expect(c?.address ?? c?.geo ?? c?.organizerId).toBeUndefined();
  });

  it("Stadt-Kalender: ohne Straße, Ort aus ORT", () => {
    const [c] = normalizeStadtVk(
      [
        {
          VERANSTALTUNGID: "5",
          TITEL: "Krabbelkino",
          ORT: "Kulturladen",
          ALLETERMINE: { "2026-11-02T10:00": {}, "2026-11-09T10:00": [] },
        },
      ],
      FROM,
      TO,
    );
    expect(c).toMatchObject({
      location: "Kulturladen",
      occurrences: [{ start: "2026-11-02T10:00" }, { start: "2026-11-09T10:00" }],
    });
    expect(c?.address).toBeUndefined();
  });
});

describe("plainText", () => {
  it("entfernt Tags und dekodiert Entities", () => {
    expect(plainText("<p>Barre f&uuml;r Mamas &#038; Babys&nbsp;&ndash; &#x41;</p>")).toBe(
      "Barre für Mamas & Babys – A",
    );
  });
});
