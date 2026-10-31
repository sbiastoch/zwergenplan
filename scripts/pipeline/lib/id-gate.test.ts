import { describe, expect, it } from "vitest";
import type { Anbieter, Offer, OffersFile, Provider, Session } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import { buildFromState } from "./build-offers.ts";
import { gatedUnits, heldBack, judgeInputOf, unitLosses, withKeepIds } from "./id-gate.ts";
import { type ProviderRaw, type ProviderRawV2, RawEvent, type UnitState } from "./raw.ts";

const TODAY = "2026-10-06";
const NOW = "2026-10-06T03:00:00+02:00";
const P = "familientreff-beispiel";
const VENUE = "familientreff-beispiel-haus";
const URL_A = "https://example.org/familientreff/programm";
const URL_B = "https://example.org/familientreff/kurse";
const A = `seite:${URL_A}`;
const B = `seite:${URL_B}`;
const WINDOW = { from: TODAY, to: "2027-10-06", freeDays: {} };

const { providers } = loadFixtures();
/** Fixture-Katalog, der Familientreff mit zweiter Programmseite B */
const catalog: Provider[] = providers.map((p) =>
  p.id === P && p.role === "anbieter"
    ? { ...p, programme: [...p.programme, { url: URL_B, kind: "html", use: "termine" }] }
    : p,
);
const familientreff = catalog.find((p): p is Anbieter => p.id === P && p.role === "anbieter");
if (!familientreff) throw new Error("Fixture familientreff-beispiel fehlt");

const event = (over: Partial<RawEvent> = {}): RawEvent =>
  RawEvent.parse({
    providerId: P,
    venueId: VENUE,
    title: "Offener Krabbeltreff",
    summary: "Spielen und Austausch für Familien mit Babys.",
    topics: ["krabbelgruppe"],
    format: "regelmaessig",
    registration: "ohne-anmeldung",
    cost: "kostenlos",
    url: "https://example.org/familientreff/krabbeltreff",
    sourceUrl: URL_A,
    availability: { status: "ohne-anmeldung" },
    schedule: {
      kind: "weekly",
      weekdays: ["WE"],
      start: "10:00",
      end: "11:30",
      from: "2026-10-07",
      until: "2026-11-25",
      skipHolidays: false,
    },
    ...over,
  });
/** Einzeltermine: ein Angebot je Datum */
const concert = (title: string, at = "10:00") =>
  event({
    title,
    format: "einmalig",
    registration: "mit-anmeldung",
    schedule: {
      kind: "dates",
      dates: [
        { start: `2026-10-10T${at}`, end: "2026-10-10T11:00" },
        { start: `2026-10-17T${at}`, end: "2026-10-17T11:00" },
      ],
    },
  });

const unit = (events: RawEvent[], o: { inputHash?: string; partsHash?: string } = {}): UnitState => ({
  events,
  inputHash: o.inputHash ?? "h-alt",
  ...(o.partsHash === undefined ? {} : { partsHash: o.partsHash }),
  model: "haiku",
  status: events.length > 0 ? "ok" : "keine-termine",
  checkedAt: NOW,
  changedAt: NOW,
});
const raw = (units: Record<string, UnitState>): ProviderRawV2 => ({ version: 2, units });

const session = (start: string, end = start): Session => ({ start, end });
const offer = (id: string, over: Partial<Offer> = {}): Offer => ({
  id,
  providerId: P,
  venueId: VENUE,
  title: `Angebot ${id}`,
  summary: "Für Babys.",
  category: "treffs-cafes",
  topics: ["krabbelgruppe"],
  format: "regelmaessig",
  registration: "ohne-anmeldung",
  cost: "kostenlos",
  sessions: [session("2026-10-07T10:00:00+02:00", "2026-10-07T11:30:00+02:00")],
  availability: { status: "ohne-anmeldung", checkedAt: NOW },
  url: "https://example.org/familientreff",
  sourceUrl: URL_A,
  ...over,
});
const file = (offers: Offer[]): OffersFile => ({
  generatedAt: NOW,
  horizon: { from: TODAY, to: "2027-10-06" },
  offers,
});

const build = (raws: Readonly<Record<string, ProviderRaw>>, previous?: OffersFile) => {
  const r = buildFromState({ raws, catalog, previous, today: TODAY, freeDays: {}, generatedAt: NOW, sources: {} });
  if (!r.file) throw new Error(r.report.errors.join("\n"));
  return { ...r, file: r.file };
};
const idOf = (f: OffersFile, title: string, start?: string) =>
  f.offers.find((o) => o.title === title && (start === undefined || o.sessions[0]?.start === start))?.id;

describe("gatedUnits: Einheiten mit neuer Fassung (ADR 0041, Punkt 2)", () => {
  const prev = { [P]: raw({ [A]: unit([event()], { partsHash: "f1" }), [B]: unit([event()], { partsHash: "f1" }) }) };

  it("nur Einheiten mit Vorstand und anderer Fassung; eine neue Einheit und ein neuer Anbieter nicht", () => {
    const next = {
      [P]: raw({
        [A]: unit([event()], { inputHash: "h-neu", partsHash: "f2" }),
        [B]: unit([event()], { partsHash: "f1" }),
        "seite:https://example.org/familientreff/neu": unit([event()], { inputHash: "h-neu", partsHash: "f2" }),
      }),
      "musikschule-beispiel": raw({ x: unit([], { inputHash: "h-neu", partsHash: "f2" }) }),
    };
    expect(gatedUnits(prev, next)).toEqual(new Map([[P, new Set([A])]]));
  });

  it("gleiche Fassung mit geänderter Seite ist nicht gated; ohne partsHash im Vorstand schon", () => {
    const sameParts = { [P]: raw({ [A]: unit([event()], { inputHash: "h-neu", partsHash: "f1" }) }) };
    expect(gatedUnits(prev, sameParts).size).toBe(0);
    const legacy = { [P]: raw({ [A]: unit([event()]) }) };
    expect(gatedUnits(legacy, sameParts)).toEqual(new Map([[P, new Set([A])]]));
  });

  it("V1-Zustand auf einer Seite: kein Gate", () => {
    const v1: ProviderRaw = { events: [event()], status: "ok", checkedAt: NOW, inputHash: "h", sources: [] };
    const next = { [P]: raw({ [A]: unit([event()], { inputHash: "h-neu", partsHash: "f2" }) }) };
    expect(gatedUnits({ [P]: v1 }, next).size).toBe(0);
  });
});

describe("heldBack: Stand (b)", () => {
  it("gated Einheiten im Stand des Vorstands, alles andere neu; Anbieter ohne Gate unverändert", () => {
    const oldA = unit([event({ title: "Alt A" })], { partsHash: "f1" });
    const newA = unit([event({ title: "Neu A" })], { inputHash: "h-neu", partsHash: "f2" });
    const newB = unit([event({ title: "Neu B" })], { inputHash: "h-neu", partsHash: "f2" });
    const other = raw({ x: unit([]) });
    const prev = { [P]: raw({ [A]: oldA, [B]: unit([event({ title: "Alt B" })], { partsHash: "f1" }) }) };
    const next = { [P]: raw({ [A]: newA, [B]: newB }), "musikschule-beispiel": other };
    const b = heldBack(prev, next, new Map([[P, new Set([A])]]));
    expect(b[P]).toEqual(raw({ [A]: oldA, [B]: newB }));
    expect(b["musikschule-beispiel"]).toBe(other);
    // Eingaben bleiben unverändert
    expect((next[P] as ProviderRawV2).units[A]).toBe(newA);
  });
});

describe("unitLosses: Verluste je gated Einheit", () => {
  const gated = new Map([[P, new Set([A])]]);
  const unitOf = { [`${P}#00`]: A, [`${P}#01`]: B };
  const lost = offer("lost0001", { title: "Verloren" });
  const losses = (o: { previous: Offer[]; a: Offer[]; b: Offer[]; origins: Record<string, string> }) =>
    unitLosses({
      previous: file(o.previous),
      a: file(o.a),
      b: file(o.b),
      origins: o.origins,
      unitOf,
      gated,
      today: TODAY,
    });

  it("im Vorstand, in (b), nicht in (a), Ursprung gated: Verlust dieser Einheit", () => {
    expect(losses({ previous: [lost], a: [], b: [lost], origins: { lost0001: `${P}#00` } })).toEqual([
      { providerId: P, unit: A, lost: [lost] },
    ]);
  });

  it("kein Verlust: in (a) vorhanden, in (b) nicht (Änderung einer nicht gated Einheit), nur vergangene Termine", () => {
    const origins = { lost0001: `${P}#00` };
    expect(losses({ previous: [lost], a: [lost], b: [lost], origins })).toEqual([]);
    expect(losses({ previous: [lost], a: [], b: [], origins })).toEqual([]);
    const past = offer("lost0001", { sessions: [session("2026-10-05T10:00:00+02:00", "2026-10-05T11:00:00+02:00")] });
    expect(losses({ previous: [past], a: [], b: [past], origins })).toEqual([]);
  });

  it("künftig zählt nach Ende: Termin von gestern bis heute ist noch ein Verlust", () => {
    const overnight = offer("lost0001", {
      format: "einmalig",
      sessions: [session("2026-10-05T20:00:00+02:00", "2026-10-06T08:00:00+02:00")],
    });
    expect(losses({ previous: [overnight], a: [], b: [overnight], origins: { lost0001: `${P}#00` } })).toHaveLength(1);
  });

  it("Ursprung in einer nicht gated Einheit oder ohne Ursprung (Altbestand): kein Verlust des Gates", () => {
    expect(losses({ previous: [lost], a: [], b: [lost], origins: { lost0001: `${P}#01` } })).toEqual([]);
    expect(losses({ previous: [lost], a: [], b: [lost], origins: {} })).toEqual([]);
  });

  it("gruppiert je Anbieter und Einheit, sortiert nach ID", () => {
    const x = offer("zz000001");
    const y = offer("aa000001");
    const r = losses({ previous: [x, y], a: [], b: [x, y], origins: { zz000001: `${P}#00`, aa000001: `${P}#00` } });
    expect(r).toEqual([{ providerId: P, unit: A, lost: [y, x] }]);
  });

  it("Ursprung über mergeParts: dasselbe Angebot auf zwei Seiten liegt im Batch der ersten; ist nur B gated, kein Verlust", () => {
    const shared = event({ title: "Babymassage", sourceUrl: URL_B });
    const before = { [P]: raw({ [A]: unit([shared], { partsHash: "f1" }), [B]: unit([shared], { partsHash: "f1" }) }) };
    const night0 = build(before);
    const id = idOf(night0.file, "Babymassage");
    expect(night0.file.offers).toHaveLength(1);
    // Stand (b) mit B gated: dasselbe wie der Vorstand; das Angebot stammt aus dem Batch von A
    const b = build(before, night0.file);
    expect(id && b.unitOf[b.report.origins[id] ?? ""]).toBe(A);
    const r = unitLosses({
      previous: night0.file,
      a: file([]),
      b: b.file,
      origins: b.report.origins,
      unitOf: b.unitOf,
      gated: new Map([[P, new Set([B])]]),
      today: TODAY,
    });
    expect(r).toEqual([]);
    // ist A gated, ist es ein Verlust von A
    const ra = unitLosses({
      previous: night0.file,
      a: file([]),
      b: b.file,
      origins: b.report.origins,
      unitOf: b.unitOf,
      gated: new Map([[P, new Set([A])]]),
      today: TODAY,
    });
    expect(ra.map((l) => [l.unit, l.lost.map((o) => o.id)])).toEqual([[A, [id]]]);
  });
});

describe("judgeInputOf: Eingabe des Richters", () => {
  const input = (o: { events: RawEvent[]; lost: Offer[]; a?: Offer[]; previous?: Offer[] }) =>
    judgeInputOf({
      excerpt: familientreff,
      unit: A,
      text: "Programm",
      layout: { pageUrls: [URL_A], candidates: 0 },
      lost: o.lost,
      events: o.events,
      a: file(o.a ?? []),
      previous: file(o.previous ?? o.lost),
      window: WINDOW,
    });
  const times = (xs: readonly string[]) => xs.map((s) => Date.parse(s));

  it("verlorene Angebote mit künftigen Beginnen; neue Events mit Index und Beginnen im Fenster", () => {
    const old = offer("lost0001", {
      title: "Krabbeltreff",
      sessions: [
        session("2026-09-30T10:00:00+02:00", "2026-09-30T11:30:00+02:00"),
        session("2026-10-07T10:00:00+02:00", "2026-10-07T11:30:00+02:00"),
      ],
    });
    const r = input({ events: [event({ title: "Spielgruppe" })], lost: [old] });
    expect(r).toMatchObject({ providerId: P, unit: A, text: "Programm", layout: { pageUrls: [URL_A], candidates: 0 } });
    expect(r.lost).toEqual([
      {
        id: "lost0001",
        title: "Krabbeltreff",
        venueId: VENUE,
        summary: "Für Babys.",
        starts: ["2026-10-07T10:00:00+02:00"],
      },
    ]);
    expect(r.fresh).toHaveLength(1);
    expect(r.fresh[0]?.index).toBe(0);
    expect(r.fresh[0]?.taken).toBe(false);
    // mittwochs vom 7.10. bis 25.11., Zeitumstellung am 25.10.
    expect(r.fresh[0]?.starts).toHaveLength(8);
    expect(r.fresh[0]?.starts[0]).toBe("2026-10-07T10:00:00+02:00");
    expect(r.fresh[0]?.starts.at(-1)).toBe("2026-11-25T10:00:00+01:00");
  });

  it("taken: ein Event, das in (a) eine nicht verlorene alte ID trägt, ist kein Ziel", () => {
    const fresh = event({ title: "Offener Krabbeltreff" });
    const keeper = offer("kept0001", { title: "Offener Krabbeltreff" });
    const lost = offer("lost0001", { title: "Babymassage" });
    const r = input({
      events: [fresh, event({ title: "Spielgruppe Zwerge" })],
      lost: [lost],
      a: [keeper],
      previous: [keeper, lost],
    });
    expect(r.fresh.map((f) => f.taken)).toEqual([true, false]);
  });

  it("taken nur bei gleichem Anbieter, ähnlichem Titel, gemeinsamem Beginn und alter, nicht verlorener ID", () => {
    const fresh = event({ title: "Offener Krabbeltreff" });
    const lost = offer("lost0001", { title: "Babymassage" });
    const cases: Array<[string, Offer[], Offer[]]> = [
      // neue ID (nicht im Vorstand)
      ["neu", [offer("new00001", { title: "Offener Krabbeltreff" })], [lost]],
      // die verlorene ID selbst
      ["verloren", [{ ...lost, title: "Offener Krabbeltreff" }], [lost]],
      // anderer Anbieter
      [
        "fremd",
        [offer("kept0001", { title: "Offener Krabbeltreff", providerId: "musikschule-beispiel" })],
        [lost, offer("kept0001", { providerId: "musikschule-beispiel" })],
      ],
      // anderer Titel
      ["titel", [offer("kept0001", { title: "Musikgarten" })], [lost, offer("kept0001")]],
      // kein gemeinsamer Beginn
      [
        "zeit",
        [offer("kept0001", { title: "Offener Krabbeltreff", sessions: [session("2026-10-08T10:00:00+02:00")] })],
        [lost, offer("kept0001")],
      ],
    ];
    for (const [name, a, previous] of cases)
      expect([name, input({ events: [fresh], lost: [lost], a, previous }).fresh[0]?.taken]).toEqual([name, false]);
  });

  it("gemeinsamer Beginn zählt als Zeitpunkt, nicht als Schreibweise", () => {
    const keeper = offer("kept0001", {
      title: "Offener Krabbeltreff",
      sessions: [session("2026-10-07T08:00:00Z")],
    });
    const r = input({ events: [event()], lost: [], a: [keeper], previous: [keeper] });
    expect(times(r.fresh[0]?.starts ?? []).includes(Date.parse("2026-10-07T08:00:00Z"))).toBe(true);
    expect(r.fresh[0]?.taken).toBe(true);
  });
});

describe("withKeepIds: Erbe am Event", () => {
  const next = unit([event({ title: "Eins" }), concert("Zwei"), event({ title: "Drei" })], { inputHash: "h-neu" });

  it("ohne Erbe unverändert (dasselbe Objekt)", () => {
    expect(withKeepIds(next, [])).toBe(next);
  });

  it("je Index und Beginn; Einzeltermine mit mehreren Beginnen; vorhandenes Erbe bleibt; Rest unberührt", () => {
    const withOld: UnitState = {
      ...next,
      events: next.events.map((e, i) => (i === 1 ? { ...e, keepIds: { "2026-10-24T10:00:00+02:00": "alt00001" } } : e)),
    };
    const r = withKeepIds(withOld, [
      { index: 1, start: "2026-10-10T10:00:00+02:00", id: "kon00010" },
      { index: 1, start: "2026-10-17T10:00:00+02:00", id: "kon00017" },
      { index: 0, start: "2026-10-07T10:00:00+02:00", id: "eins0001" },
      { index: 9, start: "2026-10-07T10:00:00+02:00", id: "nirgends" },
    ]);
    expect(r.events.map((e) => e.keepIds)).toEqual([
      { "2026-10-07T10:00:00+02:00": "eins0001" },
      {
        "2026-10-24T10:00:00+02:00": "alt00001",
        "2026-10-10T10:00:00+02:00": "kon00010",
        "2026-10-17T10:00:00+02:00": "kon00017",
      },
      undefined,
    ]);
    expect(r.events[2]).toBe(withOld.events[2]);
    expect({ ...r, events: [] }).toEqual({ ...withOld, events: [] });
  });

  it("Einzeltermine im Build: jeder Termin erbt seine ID, auch bei neuem Titel (Kette bis offers.json)", () => {
    const night0 = build({ [P]: raw({ [A]: unit([concert("Konzert für Babys")], { partsHash: "f1" }) }) });
    const d10 = "2026-10-10T10:00:00+02:00";
    const d17 = "2026-10-17T10:00:00+02:00";
    const id10 = idOf(night0.file, "Konzert für Babys", d10);
    const id17 = idOf(night0.file, "Konzert für Babys", d17);
    expect(id10).toBeDefined();
    expect(id17).toBeDefined();
    expect(id10).not.toBe(id17);
    // neue Fassung: anderer Titel, eine halbe Stunde später (keine Stufe der Zuordnung greift)
    const renamed = unit([concert("Musik im Kinderwagen", "10:30")], { inputHash: "h-neu", partsHash: "f2" });
    const n10 = "2026-10-10T10:30:00+02:00";
    const n17 = "2026-10-17T10:30:00+02:00";
    // ohne Erbe: neue IDs (Gegenprobe)
    const plain = build({ [P]: raw({ [A]: renamed }) }, night0.file);
    const plainIds = [idOf(plain.file, "Musik im Kinderwagen", n10), idOf(plain.file, "Musik im Kinderwagen", n17)];
    expect(plainIds).not.toContain(id10);
    expect(plainIds).not.toContain(id17);
    const inherited = withKeepIds(renamed, [
      { index: 0, start: n10, id: id10 ?? "" },
      { index: 0, start: n17, id: id17 ?? "" },
    ]);
    const after = build({ [P]: raw({ [A]: inherited }) }, night0.file);
    expect(idOf(after.file, "Musik im Kinderwagen", n10)).toBe(id10);
    expect(idOf(after.file, "Musik im Kinderwagen", n17)).toBe(id17);
  });
});
