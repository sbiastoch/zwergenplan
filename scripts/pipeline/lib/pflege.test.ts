import { describe, expect, it } from "vitest";
import type { Anbieter, Offer, Provider, Session } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import type { Seite } from "./discover-state.ts";
import {
  careOrder,
  comparisonRaws,
  coveredBy,
  durableUnitIds,
  inRest,
  judgeProof,
  listPages,
  neighborIds,
  nextState,
  ortsHint,
  pflegeReport,
  rejectedUrls,
  simulateNight,
  standOf,
  termineHints,
  withCandidate,
} from "./pflege.ts";
import { type ProviderRaw, type ProviderRawV2, RawEvent, type UnitState } from "./raw.ts";

const TODAY = "2026-10-06";
const NOW = "2026-10-06T03:00:00+02:00";
const P = "familientreff-beispiel";
const VENUE = "familientreff-beispiel-haus";
const URL_A = "https://example.org/familientreff/programm";
const URL_B = "https://example.org/familientreff/kurse";
const URL_C = "https://example.org/familientreff/neu";
const A = `seite:${URL_A}`;
const B = `seite:${URL_B}`;
const C = `seite:${URL_C}`;

const { providers } = loadFixtures();
/** Fixture-Katalog, der Familientreff mit zweiter Programmseite B */
const catalog: Provider[] = providers.map((p) =>
  p.id === P && p.role === "anbieter"
    ? { ...p, programme: [...p.programme, { url: URL_B, kind: "html", use: "termine" }] }
    : p,
);
const anbieter = (id: string, list: readonly Provider[] = catalog): Anbieter => {
  const p = list.find((x): x is Anbieter => x.id === id && x.role === "anbieter");
  if (!p) throw new Error(`Fixture ${id} fehlt`);
  return p;
};
const familientreff = anbieter(P);

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
const babymassage = (sourceUrl = URL_C) =>
  event({
    title: "Babymassage am Freitag",
    topics: ["babymassage"],
    registration: "mit-anmeldung",
    sourceUrl,
    url: sourceUrl,
    schedule: {
      kind: "weekly",
      weekdays: ["FR"],
      start: "15:00",
      end: "16:00",
      from: "2026-10-09",
      until: "2026-11-27",
      skipHolidays: false,
    },
  });

const unit = (events: RawEvent[], over: Partial<UnitState> = {}): UnitState => ({
  events,
  inputHash: "h",
  model: "haiku",
  status: events.length > 0 ? "ok" : "keine-termine",
  checkedAt: NOW,
  changedAt: NOW,
  ...over,
});
const raw = (units: Record<string, UnitState>): ProviderRawV2 => ({ version: 2, units });
/** Einheit, deren Seite seit `since` dauerhaft scheitert (Plan 0048, E8) */
const failing = (events: RawEvent[], since: string): UnitState =>
  unit(events, {
    status: "fehler",
    reason: "HTTP 404",
    klasse: "dauerhaft",
    klasseSince: since,
    failingSince: since,
  });

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
const weekly = (dates: string[], time = "10:00") => dates.map((d) => session(`${d}T${time}:00+02:00`));

/** Beweis für Seite C: Katalog mit C als letzter Seite, Einheit C mit `events`, simulierter Nachtlauf */
const proveC = (raws: Readonly<Record<string, ProviderRaw>>, events: RawEvent[], list = catalog) => {
  const entry = withCandidate(anbieter(P, list), { url: URL_C, kind: "html", use: "termine" });
  return simulateNight({
    comparison: comparisonRaws(raws, list, TODAY),
    catalog: list,
    entry,
    unitId: C,
    unit: unit(events),
    previous: undefined,
    today: TODAY,
    freeDays: {},
    now: NOW,
  });
};

describe("coveredBy: abgedeckt (Plan 0049, E2)", () => {
  const overview = offer("a1", {
    title: "Krabbelgruppe Mäusenest",
    sessions: weekly(["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"]),
  });

  it("Teaser mit dem nächsten Termin: gleicher erster künftiger Beginn", () => {
    const teaser = offer("t", { title: "Krabbelgruppe Mäusenest", sessions: weekly(["2026-10-07"]) });
    expect(coveredBy(teaser, [overview], TODAY)?.id).toBe("a1");
  });

  it("Druckansicht mit umformuliertem Titel: ähnlicher Kerntitel und mindestens 50 % gleiche Beginnzeiten", () => {
    const print = offer("d", {
      title: "Mäusenest – Krabbelgruppe",
      sessions: weekly(["2026-10-14", "2026-10-21", "2026-11-04"]),
    });
    expect(coveredBy(print, [overview], TODAY)?.id).toBe("a1");
  });

  it("Detailseite eines Kurses der Übersicht: gleicher Wochentag und gleiche Uhrzeit", () => {
    const detail = offer("k", { title: "Krabbelgruppe Mäusenest", sessions: weekly(["2026-11-11", "2026-11-18"]) });
    expect(coveredBy(detail, [overview], TODAY)?.id).toBe("a1");
  });

  it("anderer Titel oder andere Zeit: nicht abgedeckt; vergangene Termine zählen nicht", () => {
    const other = offer("x", { title: "Babymassage", sessions: weekly(["2026-10-07"]) });
    expect(coveredBy(other, [overview], TODAY)).toBeUndefined();
    const later = offer("y", { title: "Krabbelgruppe Mäusenest", sessions: weekly(["2026-11-12"], "16:00") });
    expect(coveredBy(later, [overview], TODAY)).toBeUndefined();
    const past = offer("p", {
      title: "Krabbelgruppe Mäusenest",
      sessions: weekly(["2026-09-30", "2026-10-08"], "16:00"),
    });
    const pastOverview = offer("q", { title: "Krabbelgruppe Mäusenest", sessions: weekly(["2026-09-30"], "16:00") });
    expect(coveredBy(past, [pastOverview], TODAY)).toBeUndefined();
  });
});

describe("judgeProof: Ergebnis (E2)", () => {
  const own = [offer("a1", { title: "Krabbelgruppe Mäusenest" })];
  const fresh = offer("n1", { title: "Babymassage", sessions: weekly(["2026-10-09"], "15:00") });

  it("neues Angebot mit Kleinkindbezug → anhaengen, mit den neuen Angeboten", () => {
    const v = judgeProof({ candidate: [fresh, own[0] as Offer], own, neighbors: [], relevant: true, today: TODAY });
    expect(v.ergebnis).toBe("anhaengen");
    expect(v.neu.map((o) => o.id)).toEqual(["n1"]);
  });

  it("alles abgedeckt → deckungsgleich; leer oder ohne künftigen Termin → ohne-ertrag", () => {
    expect(judgeProof({ candidate: own, own, neighbors: [], relevant: true, today: TODAY }).ergebnis).toBe(
      "deckungsgleich",
    );
    expect(judgeProof({ candidate: [], own, neighbors: [], relevant: true, today: TODAY }).ergebnis).toBe(
      "ohne-ertrag",
    );
    const past = offer("p", { sessions: weekly(["2026-09-30"]) });
    expect(judgeProof({ candidate: [past], own, neighbors: [], relevant: true, today: TODAY }).ergebnis).toBe(
      "ohne-ertrag",
    );
  });

  it("Extraktion mit Terminen, aber alle mit bestehenden Seiten vereinigt → deckungsgleich", () => {
    const v = judgeProof({ candidate: [], own, neighbors: [], relevant: true, today: TODAY, extracted: true });
    expect(v.ergebnis).toBe("deckungsgleich");
  });

  it("neu, aber ohne Kleinkindbezug im Text → ohne-ertrag", () => {
    const v = judgeProof({ candidate: [fresh], own, neighbors: [], relevant: false, today: TODAY });
    expect(v).toMatchObject({ ergebnis: "ohne-ertrag", grund: expect.stringMatching(/Kleinkindbezug/) });
  });

  it("Angebot eines anderen Anbieters am Ort in ≤ 100 m (wie hebanne-schulz bei der FamilienBox) → fremder-anbieter", () => {
    const hebamme = offer("h1", { providerId: "hebamme-beispiel", title: "Babymassage", sessions: fresh.sessions });
    const v = judgeProof({ candidate: [fresh], own, neighbors: [hebamme], relevant: true, today: TODAY });
    expect(v).toMatchObject({ ergebnis: "fremder-anbieter", fremd: [{ offer: { id: "n1" }, by: { id: "h1" } }] });
  });
});

describe("simulateNight: Beweis bei bestehenden Einheiten (B1, M6)", () => {
  it("drei Einheiten im Stand, Kandidat mit neuem Angebot → die Angebote des Kandidaten sind nur seine neuen", () => {
    const three = raw({
      [A]: unit([event()]),
      [B]: unit([event({ title: "Familienfrühstück", sourceUrl: URL_B })]),
      kandidaten: unit([event({ title: "Elterncafé", sourceUrl: URL_A })]),
    });
    const r = proveC({ [P]: three }, [babymassage(), event({ sourceUrl: URL_C })]);
    expect(r.errors).toEqual([]);
    expect(r.candidate.map((o) => o.title)).toEqual(["Babymassage am Freitag"]);
    expect(r.own.map((o) => o.title).sort()).toEqual(["Elterncafé", "Familienfrühstück", "Offener Krabbeltreff"]);
    const v = judgeProof({ ...r, neighbors: [], relevant: true, today: TODAY });
    expect(v.ergebnis).toBe("anhaengen");
  });

  it("Termine nur aus der Einheit kandidaten → deckungsgleich", () => {
    const r = proveC({ [P]: raw({ [A]: unit([]), kandidaten: unit([babymassage(URL_A)]) }) }, [babymassage()]);
    expect(judgeProof({ ...r, neighbors: [], relevant: true, today: TODAY }).ergebnis).toBe("deckungsgleich");
  });

  it("Ersatzseite einer Einheit mit dauerhaft seit zwei Kalendertagen → anhaengen", () => {
    const raws = {
      [P]: raw({ [A]: unit([event()]), [B]: failing([babymassage(URL_B)], "2026-10-04T03:00:00+02:00") }),
    };
    expect(durableUnitIds(raws[P], TODAY)).toEqual([B]);
    const r = proveC(raws, [babymassage()]);
    expect(judgeProof({ ...r, neighbors: [], relevant: true, today: TODAY }).ergebnis).toBe("anhaengen");
  });

  it("zweite Fassung einer vorübergehend oder erst seit gestern ausgefallenen Seite → deckungsgleich", () => {
    for (const since of ["2026-10-05T03:00:00+02:00"]) {
      const raws = { [P]: raw({ [A]: unit([event()]), [B]: failing([babymassage(URL_B)], since) }) };
      expect(durableUnitIds(raws[P], TODAY)).toEqual([]);
      const r = proveC(raws, [babymassage()]);
      expect(judgeProof({ ...r, neighbors: [], relevant: true, today: TODAY }).ergebnis).toBe("deckungsgleich");
    }
    const flaky = unit([babymassage(URL_B)], { status: "fehler", klasse: "voruebergehend", klasseSince: NOW });
    const r = proveC({ [P]: raw({ [A]: unit([event()]), [B]: flaky }) }, [babymassage()]);
    expect(judgeProof({ ...r, neighbors: [], relevant: true, today: TODAY }).ergebnis).toBe("deckungsgleich");
  });

  it("mit --katalog ohne die entfernte Seite → anhaengen (Einheiten außerhalb des wirksamen Katalogs zählen nicht)", () => {
    const copy = catalog.map((p) => (p.id === P && p.role === "anbieter" ? { ...p, programme: [p.programme[0]] } : p));
    const raws = { [P]: raw({ [A]: unit([event()]), [B]: unit([babymassage(URL_B)]) }) };
    const r = proveC(raws, [babymassage()], copy as Provider[]);
    expect(judgeProof({ ...r, neighbors: [], relevant: true, today: TODAY }).ergebnis).toBe("anhaengen");
  });
});

describe("Stand, Nachbarn, Orts-hint", () => {
  it("standOf ändert sich, wenn eine Einheit dauerhaft wird, nicht bei vorübergehenden Fehlern", () => {
    const ok = raw({ [A]: unit([event()]), [B]: unit([]) });
    const flaky = raw({
      [A]: unit([event()]),
      [B]: unit([], { status: "fehler", klasse: "voruebergehend", klasseSince: NOW }),
    });
    const gone = raw({ [A]: unit([event()]), [B]: failing([], "2026-10-01T03:00:00+02:00") });
    expect(standOf(familientreff, flaky, TODAY)).toBe(standOf(familientreff, ok, TODAY));
    expect(standOf(familientreff, gone, TODAY)).not.toBe(standOf(familientreff, ok, TODAY));
  });

  it("neighborIds: andere Anbieter mit einem Ort in höchstens 100 m", () => {
    const near: Provider = {
      ...anbieter("musikschule-beispiel"),
      id: "hebamme-beispiel",
      venues: [{ ...familientreff.venues[0], id: "hebamme-beispiel-raum", geo: { lat: 49.4525, lon: 11.0768 } }],
    } as Provider;
    expect([...neighborIds(familientreff, [...catalog, near])]).toEqual(["hebamme-beispiel"]);
  });

  it("ortsHint: Hinweis „weglassen“ oder „Nur Termine an“ an einer termine-Seite", () => {
    expect(ortsHint(familientreff)).toBe(false);
    const hinted = {
      ...familientreff,
      programme: [{ ...familientreff.programme[0], hint: "Nur Termine an der Beispielstraße" }],
    } as Anbieter;
    expect(ortsHint(hinted)).toBe(true);
  });

  it("listPages: Folgelink „weiter“ oder ?page=2 → Liste blättert", () => {
    expect(listPages([{ label: "Weiter »", url: "https://example.org/a?page=2" }])).toBe(true);
    expect(listPages([{ label: "Nächste Seite", url: "https://example.org/a/2" }])).toBe(true);
    expect(listPages([{ label: "Kurse", url: "https://example.org/kurse" }])).toBe(false);
    expect(listPages([{ label: "Weiterlesen", url: "https://example.org/blog/eintrag" }])).toBe(false);
  });

  it("termineHints: Hinweise der Terminseiten, ohne Dubletten und ohne Beilagen", () => {
    const hinted = {
      ...familientreff,
      programme: [
        { ...familientreff.programme[0], hint: "nur Kurse mit Baby" },
        { url: URL_B, kind: "html", use: "termine", hint: "nur Kurse mit Baby" },
        { url: URL_C, kind: "html", use: "verfuegbarkeit", hint: "Plätze" },
      ],
    } as Anbieter;
    expect(termineHints(hinted)).toEqual(["nur Kurse mit Baby"]);
    expect(termineHints(familientreff)).toEqual([]);
  });
});

describe("Reihenfolge und Ruhezeit (E4, E5)", () => {
  it("dauerhaft vor gepflegt, nie gepflegt vorn, bei Gleichstand nach ID", () => {
    const order = careOrder(
      [
        { id: "d", durable: false },
        { id: "c", durable: false },
        { id: "b", durable: true },
        { id: "a", durable: false },
        { id: "e", durable: false },
      ],
      [
        { anbieter: "a", datum: "2026-10-01" },
        { anbieter: "b", datum: "2026-10-05" },
        { anbieter: "e", datum: "2026-09-01" },
      ],
    );
    expect(order).toEqual(["b", "c", "d", "e", "a"]);
  });

  it("drei Läufe mit Budget für je zwei von sechs Anbietern: jeder ist einmal dran", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    let state = { seiten: [] as Seite[], gepflegt: [] as Array<{ anbieter: string; datum: string }> };
    const seen: string[] = [];
    ["2026-10-07", "2026-10-14", "2026-10-21"].forEach((day) => {
      const done = careOrder(
        ids.map((id) => ({ id, durable: false })),
        state.gepflegt,
      ).slice(0, 2);
      seen.push(...done);
      state = nextState(state, { cared: done, checked: [], seen: new Map(), today: day });
    });
    expect(seen.sort()).toEqual(ids);
  });

  const seite = (over: Partial<Seite> = {}): Seite => ({
    url: URL_C,
    anbieter: P,
    geprueft: "2026-09-01",
    ergebnis: "deckungsgleich",
    stand: "s1",
    ...over,
  });

  it("Ruhezeit hält 8 Wochen, entfällt bei geändertem Stand, in Gruppe 1 und nach fehler", () => {
    expect(inRest(seite(), { stand: "s1", durable: false, today: "2026-10-26" })).toBe(true);
    expect(inRest(seite(), { stand: "s1", durable: false, today: "2026-10-27" })).toBe(false);
    expect(inRest(seite(), { stand: "s2", durable: false, today: "2026-10-01" })).toBe(false);
    expect(inRest(seite(), { stand: "s1", durable: true, today: "2026-10-01" })).toBe(false);
    expect(inRest(seite({ ergebnis: "fehler" }), { stand: "s1", durable: false, today: "2026-09-02" })).toBe(false);
    expect(inRest(undefined, { stand: "s1", durable: false, today: "2026-10-01" })).toBe(false);
  });

  it("nextState: geprüfte Seiten ersetzen alte; abgelaufene, nicht mehr gesehene eines gepflegten Anbieters entfallen", () => {
    const old = [
      seite({ url: "https://example.org/familientreff/alt", geprueft: "2026-07-01" }),
      seite({ url: "https://example.org/familientreff/gesehen", geprueft: "2026-07-01" }),
      seite({ url: "https://example.org/familientreff/ruhe", geprueft: "2026-10-01" }),
      seite({ url: "https://example.org/andere", anbieter: "musikschule-beispiel", geprueft: "2026-07-01" }),
      seite({ url: URL_C, geprueft: "2026-07-01" }),
    ];
    const checked = [seite({ url: URL_C, geprueft: TODAY, ergebnis: "ohne-ertrag" })];
    const next = nextState(
      { seiten: old, gepflegt: [{ anbieter: P, datum: "2026-07-01" }] },
      {
        cared: [P],
        checked,
        seen: new Map([[P, new Set(["https://example.org/familientreff/gesehen"])]]),
        today: TODAY,
      },
    );
    expect(next.seiten.map((s) => s.url).sort()).toEqual([
      "https://example.org/andere",
      "https://example.org/familientreff/gesehen",
      URL_C,
      "https://example.org/familientreff/ruhe",
    ]);
    expect(next.seiten.find((s) => s.url === URL_C)?.ergebnis).toBe("ohne-ertrag");
    expect(next.gepflegt).toEqual([{ anbieter: P, datum: TODAY }]);
  });

  it("abgelehnte URL nie wieder: über die Dateien aller Regionen, kanonisch verglichen", () => {
    const rejected = rejectedUrls([
      { abgelehnt: [{ url: `${URL_C}?utm_source=x`, anbieter: P, grund: "fremd", datum: "2026-10-01" }] },
      { abgelehnt: [{ host: "example.com", grund: "Vermittler", datum: "2026-10-01" }] },
    ]);
    expect(rejected(`${URL_C}/`)).toBe(true);
    expect(rejected(URL_B)).toBe(false);
  });
});

describe("pflegeReport (E5)", () => {
  it("nennt je Anbieter Abrufe, Kandidaten und Ergebnis, Hinweise, Summen und die Liste „würde anhängen“", () => {
    const md = pflegeReport({
      date: TODAY,
      modus: "trocken",
      modell: "haiku/high",
      dauerMin: 3,
      abort: undefined,
      kosten: "2 Aufrufe, 0,10 $",
      rows: [
        {
          id: P,
          fetches: 7,
          gesperrt: [],
          ersatzFuer: [URL_B],
          nurBericht: undefined,
          kandidaten: [
            {
              url: URL_C,
              kind: "html",
              browser: false,
              future: 5,
              ergebnis: "anhaengen",
              neu: [{ title: "Babymassage @team\nam Freitag", first: "2026-10-09T15:00:00+02:00" }],
              hinweise: ["Liste blättert"],
            },
            { url: URL_A, kind: "html", browser: false, future: 3, ergebnis: "ruhe", neu: [], hinweise: [] },
          ],
        },
        { id: "musikschule-beispiel", fetches: 3, gesperrt: ["https://example.org/x"], kandidaten: [] },
      ],
    });
    expect(md).toContain("# Pflege 2026-10-06 (trocken)");
    expect(md).toContain(`${P}: 7 Abrufe, 2 Kandidaten`);
    expect(md).toContain("Ersatz für https://example.org/familientreff/kurse");
    expect(md).toContain("Liste blättert");
    expect(md).toMatch(/## Würde anhängen \(1\)/);
    // fremder Text einzeilig und ohne Erwähnung
    expect(md).toContain("Babymassage (at)team am Freitag");
    expect(md).toContain("robots.txt gesperrt: https://example.org/x");
  });
});
