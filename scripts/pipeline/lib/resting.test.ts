import { describe, expect, it } from "vitest";
import type { Offer, OffersFile } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import { parseResting, RESTING_DAYS, RESTING_SPAN_DAYS, type RestingFile, updateResting } from "./resting.ts";
import { keyOf } from "./stable-ids.ts";

const { file: fixtures } = loadFixtures();
const base = fixtures.offers[0] as Offer;

/** Wöchentlich mittwochs 10:00 Berliner Zeit ab `first`, `n` Termine, Offset nach Sommer-/Winterzeit */
function wednesdays(first: string, n: number): Offer["sessions"] {
  const start = Date.parse(`${first}T12:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start + i * 7 * 86_400_000).toISOString().slice(0, 10);
    const off = d >= "2026-10-25" && d < "2027-03-28" ? "+01:00" : "+02:00";
    return { start: `${d}T10:00:00${off}`, end: `${d}T11:00:00${off}` };
  });
}

const offer = (id: string, over: Partial<Offer> = {}): Offer => ({
  ...base,
  id,
  providerId: "turnverein-beispiel",
  venueId: "turnverein-beispiel-halle",
  title: `Angebot ${id}`,
  format: "regelmaessig",
  sessions: wednesdays("2026-11-04", 30),
  listedAt: "2026-10-01T06:00:00+02:00",
  ...over,
});
const offersFile = (offers: Offer[], to = "2027-11-03"): OffersFile => ({
  generatedAt: "2026-11-03T06:00:00+01:00",
  horizon: { from: "2026-11-03", to },
  offers,
});
const run = (today: string, previous: OffersFile | undefined, resting: RestingFile | undefined, next: Offer[]) =>
  updateResting({
    previous,
    resting,
    next,
    generatedAt: `${today}T06:00:00+01:00`,
    horizon: { from: today, to: "2027-11-04" },
  });

describe("updateResting (Plan 0061, E2)", () => {
  it("ein Angebot aus dem Vorstand, das in der Ausgabe fehlt, ruht mit seinen Feldern ab heute", () => {
    const b = offer("bbbbbbbb", { age: { minMonths: 6, maxMonths: 12 }, sessions: wednesdays("2026-10-28", 10) });
    const r = run("2026-11-04", offersFile([offer("aaaaaaaa"), b]), undefined, [offer("aaaaaaaa")]);
    expect(r.generatedAt).toBe("2026-11-04T06:00:00+01:00");
    expect(r.entries).toEqual([
      {
        id: "bbbbbbbb",
        key: keyOf(b),
        providerId: b.providerId,
        venueId: b.venueId,
        title: b.title,
        format: b.format,
        age: { minMonths: 6, maxMonths: 12 },
        listedAt: b.listedAt,
        restingSince: "2026-11-04T06:00:00+01:00",
        horizonTo: "2027-02-24", // Ruhebeginn + 112 Tage
        // der Termin am 28.10. liegt vor dem Ruhebeginn
        starts: b.sessions.slice(1).map((s) => s.start),
      },
    ]);
  });

  it("ein ruhender Eintrag bleibt unverändert, solange er fehlt; die Einträge stehen nach ID sortiert", () => {
    const first = run("2026-11-04", offersFile([offer("zzzzzzzz"), offer("bbbbbbbb")]), undefined, []);
    const later = run("2026-11-11", undefined, first, [offer("cccccccc")]);
    expect(later.entries.map((e) => e.id)).toEqual(["bbbbbbbb", "zzzzzzzz"]);
    expect(later.entries).toEqual(first.entries);
  });

  it(`nach ${RESTING_DAYS} Berliner Tagen entfällt der Eintrag`, () => {
    const first = run(
      "2026-11-04",
      offersFile([offer("bbbbbbbb", { sessions: wednesdays("2026-11-04", 52) })]),
      undefined,
      [],
    );
    expect(run("2026-12-30", undefined, first, []).entries).toHaveLength(1); // genau 56 Tage
    expect(run("2026-12-31", undefined, first, []).entries).toHaveLength(0);
  });

  it("ohne Beginn ab heute entfällt der Eintrag", () => {
    const first = run(
      "2026-11-04",
      offersFile([offer("bbbbbbbb", { sessions: wednesdays("2026-11-04", 3) })]),
      undefined,
      [],
    );
    expect(run("2026-11-18", undefined, first, []).entries).toHaveLength(1);
    expect(run("2026-11-19", undefined, first, []).entries).toHaveLength(0);
    // kein Termin ab heute schon beim Ruhebeginn: kein Eintrag
    expect(
      run("2026-11-04", offersFile([offer("bbbbbbbb", { sessions: wednesdays("2026-10-07", 3) })]), undefined, [])
        .entries,
    ).toEqual([]);
  });

  it("kehrt die ID zurück, entfällt der Eintrag", () => {
    const first = run("2026-11-04", offersFile([offer("bbbbbbbb")]), undefined, []);
    expect(run("2026-11-11", undefined, first, [offer("bbbbbbbb")]).entries).toEqual([]);
  });

  it(`die Beginne reichen höchstens ${RESTING_SPAN_DAYS} Tage weit und nicht über den Horizont des Vorstands`, () => {
    const long = offer("bbbbbbbb", { sessions: wednesdays("2026-11-04", 52) });
    const [wide] = run("2026-11-04", offersFile([long]), undefined, []).entries;
    expect(wide?.horizonTo).toBe("2027-02-24");
    expect(wide?.starts.at(-1)?.slice(0, 10)).toBe("2027-02-24");
    expect(wide?.starts).toHaveLength(17);
    const [short] = run("2026-11-04", offersFile([long], "2026-12-31"), undefined, []).entries;
    expect(short?.horizonTo).toBe("2026-12-31");
    expect(short?.starts.at(-1)?.slice(0, 10)).toBe("2026-12-30");
  });

  it("ein Eintrag, dessen ID im Vorstand steht, ist ein Rest und wird ersetzt bzw. entfernt (Review m3)", () => {
    const stale = run("2026-11-04", offersFile([offer("bbbbbbbb", { title: "Alt" })]), undefined, []);
    // Rest aus einem abgebrochenen Lauf: bbbbbbbb steht wieder im Vorstand
    const back = run("2026-11-11", offersFile([offer("bbbbbbbb", { title: "Neu" })]), stale, [offer("bbbbbbbb")]);
    expect(back.entries).toEqual([]);
    const gone = run("2026-11-11", offersFile([offer("bbbbbbbb", { title: "Neu" })]), stale, []);
    expect(gone.entries.map((e) => [e.title, e.restingSince])).toEqual([["Neu", "2026-11-11T06:00:00+01:00"]]);
  });
});

describe("parseResting (Plan 0061, E2)", () => {
  it("liest eine gültige Datei und meldet eine ungültige als Fehler statt zu werfen", () => {
    const file = run("2026-11-04", offersFile([offer("bbbbbbbb")]), undefined, []);
    expect(parseResting(JSON.parse(JSON.stringify(file)))).toEqual({ file });
    const bad = parseResting({ generatedAt: "gestern", entries: [] });
    expect("error" in bad && bad.error).toMatch(/generatedAt/);
    expect("error" in parseResting({ ...file, entries: [{ ...file.entries[0], id: "ZU-LANG-123" }] })).toBe(true);
    // doppelte ID (Arch-Review E2, m3)
    const twice = parseResting({ ...file, entries: [file.entries[0], file.entries[0]] });
    expect("error" in twice && twice.error).toMatch(/doppelt/);
  });
});

describe("updateResting über die Zeitumstellung (Plan 0061, E2; Arch-Review E2, m5)", () => {
  it("zählt Berliner Tage: Beginn kurz nach Mitternacht und Kappung über den 28.03.", () => {
    // mittwochs 00:30 Berliner Zeit: in UTC noch der Dienstag
    const sessions = Array.from({ length: 20 }, (_, i) => {
      const d = new Date(Date.UTC(2027, 0, 6 + 7 * i, 12)).toISOString().slice(0, 10);
      const off = d < "2027-03-28" ? "+01:00" : "+02:00";
      return { start: `${d}T00:30:00${off}`, end: `${d}T01:30:00${off}` };
    });
    const previous = offersFile([offer("bbbbbbbb", { sessions })], "2028-01-06");
    const [entry] = updateResting({
      previous,
      resting: undefined,
      next: [],
      generatedAt: "2027-01-06T06:00:00+01:00",
      horizon: { from: "2027-01-06", to: "2028-01-06" },
    }).entries;
    expect(entry?.horizonTo).toBe("2027-04-28");
    expect(entry?.starts[0]).toBe("2027-01-06T00:30:00+01:00");
    expect(entry?.starts.at(-1)).toBe("2027-04-28T00:30:00+02:00");
    expect(entry?.starts).toHaveLength(17);
  });
});
