import { describe, expect, it } from "vitest";
import type { Anbieter, OffersFile } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import type { Candidate } from "./candidate.ts";
import type { CallRecord, ExtractOutcome } from "./extract.ts";
import { catalogExcerpt, extractKey, ICAL_HEADING } from "./normalize.ts";
import { RawEvent, UnitState } from "./raw.ts";
import {
  afterStrongRetry,
  applyOutcome,
  assignVia,
  type FetchedProvider,
  type FetchedUnit,
  hasFuture,
  migrate,
  NO_INPUT_MODEL,
  needsStrongRetry,
  offerUnits,
  planRefresh,
  type RefreshContext,
  summarize,
  unconfirmedCollapse,
} from "./refresh.ts";
import { KANDIDATEN } from "./units.ts";

const { providers } = loadFixtures();
const provider: Anbieter = (() => {
  const p = providers.find((x) => x.id === "familientreff-beispiel");
  if (p?.role !== "anbieter") throw new Error("Fixture familientreff-beispiel fehlt");
  return p;
})();
const PAGE_UNIT = "seite:https://example.org/familientreff/programm";
const KEY_PARTS = { prompt: "Prompt v1", schema: "{}", model: "haiku" };
const NOW = "2026-10-12T03:00:00+02:00";
const TODAY = "2026-10-12";
const YESTERDAY = "2026-10-11T03:00:00+02:00";
const LAST_WEEK = "2026-10-05T03:00:00+02:00";

const ev = (title: string, over: Partial<RawEvent> = {}): RawEvent =>
  RawEvent.parse({
    providerId: "familientreff-beispiel",
    venueId: "familientreff-beispiel-haus",
    title,
    summary: "Spielen und Austausch für Familien mit Babys.",
    topics: ["krabbelgruppe"],
    format: "regelmaessig",
    registration: "ohne-anmeldung",
    cost: "kostenlos",
    url: "https://example.org/familientreff/krabbeltreff",
    sourceUrl: "https://example.org/familientreff/programm",
    availability: { status: "ohne-anmeldung" },
    schedule: {
      kind: "weekly",
      weekdays: ["WE"],
      start: "10:00",
      end: "11:30",
      from: "2026-10-07",
      skipHolidays: true,
    },
    ...over,
  });
const events = (n: number, prefix = "Treff") => Array.from({ length: n }, (_, i) => ev(`${prefix} ${i + 1}`));

/** Abruf einer Einheit samt der Felder des Anbieters, die die Regel braucht (Sammelkalender) */
type Fetched = FetchedUnit &
  Pick<FetchedProvider, "via" | "adapterIssues"> & { ownAdapter?: FetchedProvider["ownAdapter"] };
const fetched = (over: Partial<Fetched> = {}): Fetched => ({
  id: PAGE_UNIT,
  status: "ok",
  pages: [{ url: "https://example.org/familientreff/programm", text: "Krabbeltreff mittwochs 10 Uhr" }],
  candidates: [],
  text: "## Seite 1\nKrabbeltreff mittwochs 10 Uhr",
  allowedUrls: ["https://example.org/familientreff/programm"],
  via: "seiten",
  adapterIssues: {},
  ...over,
});
const keyOf = (f: FetchedUnit, model = KEY_PARTS.model) =>
  extractKey(
    { pages: f.pages, candidates: f.candidates },
    { ...KEY_PARTS, model, catalog: catalogExcerpt(provider) },
    { today: TODAY },
  ).hash;

const raw = (over: Partial<UnitState> = {}): UnitState =>
  UnitState.parse({
    events: events(4),
    inputHash: keyOf(fetched()),
    model: "haiku",
    status: "ok",
    checkedAt: YESTERDAY,
    changedAt: LAST_WEEK,
    ...over,
  });

/** Kontext einer Einheit; `fetched` ist der Abruf der Einheit, `baseline` die Prüfmenge einer neuen Einheit */
const ctx = ({
  fetched: f = fetched(),
  ...over
}: Partial<Omit<RefreshContext, "unit" | "fetched">> & { fetched?: Fetched } = {}): RefreshContext => ({
  provider,
  excerpt: provider,
  unit: f,
  fetched: { via: f.via, adapterIssues: f.adapterIssues, ...(f.ownAdapter ? { ownAdapter: f.ownAdapter } : {}) },
  prev: raw(),
  keyParts: KEY_PARTS,
  today: TODAY,
  now: NOW,
  freeDays: {},
  ...over,
});
const changed = fetched({ pages: [{ url: "https://example.org/familientreff/programm", text: "Neues Programm" }] });
const ok = (evs: RawEvent[], model = "haiku"): ExtractOutcome => ({ kind: "ok", events: evs, model });

/** Plan → (Extraktion) → neuer Zustand; das Ergebnis ist immer schema-gültig. */
function run(c: RefreshContext, outcome?: ExtractOutcome) {
  const plan = planRefresh(c);
  if (plan.kind === "keep") return { called: false, ...plan };
  if (!outcome) throw new Error("Test erwartet keinen Aufruf");
  const r = applyOutcome(c, plan.key, outcome);
  return { called: true, ...r };
}
const nextOf = (r: ReturnType<typeof run>) => {
  if (r.kind === "abort") throw new Error("abort unerwartet");
  return UnitState.parse(r.next);
};

describe("refresh: Regeln aus Plan 0032, E5", () => {
  it("Hash gleich, kein pending: alte Events, kein Aufruf, checkedAt auf Abrufzeit", () => {
    const r = run(ctx());
    expect(r.called).toBe(false);
    expect(r.kind).toBe("keep");
    const next = nextOf(r);
    expect(next.events).toEqual(raw().events);
    expect(next.checkedAt).toBe(NOW);
    expect(next.changedAt).toBe(LAST_WEEK);
    expect(r.kind === "keep" && r.result).toBe("unveraendert");
  });

  it("Hash gleich nach einem Ausfall: Status wieder ok, failingSince und reason gelöscht", () => {
    const prev = raw({ status: "fehler", reason: "HTTP 503", failingSince: YESTERDAY });
    const next = nextOf(run(ctx({ prev })));
    expect(next.status).toBe("ok");
    expect(next.failingSince).toBeUndefined();
    expect(next.reason).toBeUndefined();
  });

  it("Hash gleich, pending mit diesem Hash: pending wird ohne Modellaufruf übernommen", () => {
    const prev = raw({ pending: { inputHash: keyOf(changed), model: "haiku", events: events(1, "Neu") } });
    const r = run(ctx({ prev, fetched: changed }));
    expect(r.called).toBe(false);
    expect(r.kind === "keep" && r.result).toBe("pending-uebernommen");
    const next = nextOf(r);
    expect(next.events.map((e) => e.title)).toEqual(["Neu 1"]);
    expect(next.inputHash).toBe(keyOf(changed));
    expect(next.pending).toBeUndefined();
    expect(next.changedAt).toBe(NOW);
    expect(next.checkedAt).toBe(NOW);
  });

  it("Seite zurück auf den alten Stand bei offenem pending: alte Events, pending verworfen", () => {
    const prev = raw({ pending: { inputHash: keyOf(changed), model: "haiku", events: events(1, "Neu") } });
    const next = nextOf(run(ctx({ prev })));
    expect(next.events).toEqual(raw().events);
    expect(next.pending).toBeUndefined();
  });

  it("Seite oder Adapter ausgefallen (auch teilweise): alte Events, fehler mit Grund, failingSince gesetzt", () => {
    const r = run(ctx({ fetched: fetched({ status: "fehler", reason: "https://x: HTTP 404" }) }));
    expect(r.called).toBe(false);
    expect(r.kind === "keep" && r.result).toBe("ausgefallen");
    const next = nextOf(r);
    expect(next.events).toEqual(raw().events);
    expect(next).toMatchObject({ status: "fehler", reason: "https://x: HTTP 404", failingSince: NOW });
    expect(next.checkedAt).toBe(YESTERDAY); // nicht bestätigt
    expect(next.inputHash).toBe(raw().inputHash);
  });

  it("Ausfall in Folge: failingSince bleibt der Beginn der Serie", () => {
    const prev = raw({ status: "fehler", reason: "alt", failingSince: LAST_WEEK });
    const next = nextOf(run(ctx({ prev, fetched: fetched({ status: "fehler", reason: "neu" }) })));
    expect(next).toMatchObject({ reason: "neu", failingSince: LAST_WEEK });
  });

  it("Ausfall ohne Raw-Datei: fehler ohne Events und ohne inputHash (build nimmt den Vorstand)", () => {
    const next = nextOf(run(ctx({ prev: undefined, fetched: fetched({ status: "fehler", reason: "Bot-Schutz" }) })));
    expect(next).toMatchObject({ events: [], status: "fehler", reason: "Bot-Schutz", failingSince: NOW });
    expect(next.inputHash).toBeUndefined();
  });

  it("Antwort nach Wiederholung und Fallback ungültig oder abgeschnitten: alte Events, fehler, alter Hash", () => {
    const r = run(ctx({ fetched: changed }), { kind: "fehler", reason: "Antwort abgeschnitten" });
    expect(r.called).toBe(true);
    expect(r.kind === "write" && r.result).toBe("fehler");
    const next = nextOf(r);
    expect(next.events).toEqual(raw().events);
    expect(next).toMatchObject({ status: "fehler", reason: "Antwort abgeschnitten", failingSince: NOW });
    // alter Hash: die nächste Nacht versucht es erneut, statt den Fehler zu cachen
    expect(next.inputHash).toBe(raw().inputHash);
    expect(planRefresh(ctx({ prev: next, fetched: changed })).kind).toBe("extract");
  });

  it("Einbruch: alt ≥ 3, neu leer → alte Events bleiben, neue als pending mit ihrem Hash", () => {
    const r = run(ctx({ fetched: changed }), ok([]));
    expect(r.kind === "write" && r.result).toBe("einbruch");
    const next = nextOf(r);
    expect(next.events).toEqual(raw().events);
    expect(next.pending).toEqual({ inputHash: keyOf(changed), model: "haiku", events: [] });
    expect(next.inputHash).toBe(raw().inputHash);
    expect(next.status).toBe("ok");
    expect(next.checkedAt).toBe(YESTERDAY);
  });

  it("Einbruch: neu < Hälfte von alt; genau die Hälfte und alt < 3 sind kein Einbruch", () => {
    const six = raw({ events: events(6) });
    expect(nextOf(run(ctx({ prev: six, fetched: changed }), ok(events(2, "N")))).pending).toBeDefined();
    expect(nextOf(run(ctx({ prev: six, fetched: changed }), ok(events(3, "N")))).pending).toBeUndefined();
    const two = raw({ events: events(2) });
    expect(nextOf(run(ctx({ prev: two, fetched: changed }), ok(events(1, "N")))).pending).toBeUndefined();
  });

  it("Einbruch zählt wie offers.json: Einzeltermine je Datum, sonst je Event", () => {
    const dates = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ start: `2026-11-${String(i + 10).padStart(2, "0")}T15:00` }));
    const kino = (n: number) => ev("Babykino", { format: "einmalig", schedule: { kind: "dates", dates: dates(n) } });
    // ein Event mit 6 Terminen = 6 Angebote; neu 2 Termine → Einbruch
    expect(
      nextOf(run(ctx({ prev: raw({ events: [kino(6)] }), fetched: changed }), ok([kino(2)]))).pending,
    ).toBeDefined();
    expect(
      nextOf(run(ctx({ prev: raw({ events: [kino(6)] }), fetched: changed }), ok([kino(3)]))).pending,
    ).toBeUndefined();
    // neue Einheit: 6 Einzeltermin-Angebote verwaister Einheiten gegen ein Event mit 5 Terminen → kein Einbruch
    const first = nextOf(run(ctx({ prev: undefined, baseline: 6, fetched: changed }), ok([kino(5)])));
    expect(first.status).toBe("ok");
  });

  it("neue Einheit nach geänderter URL: alt = künftige Angebote der verwaisten Einheiten (Plan 0048, E1)", () => {
    const r = run(ctx({ prev: undefined, baseline: 8, fetched: changed }), ok(events(3, "N")));
    expect(r.kind === "write" && r.result).toBe("einbruch");
    const next = nextOf(r);
    // ohne Vorzustand gibt es keine alten Events: fehler ohne inputHash; die verwaisten Einheiten bleiben im Build
    expect(next).toMatchObject({ events: [], status: "fehler", failingSince: NOW });
    expect(next.reason).toContain("Einbruch");
    expect(next.inputHash).toBeUndefined();
    expect(next.pending?.events).toHaveLength(3);
    // erster Lauf ohne Einbruch
    const fine = nextOf(run(ctx({ prev: undefined, baseline: 4, fetched: changed }), ok(events(3, "N"))));
    expect(fine).toMatchObject({ status: "ok", inputHash: keyOf(changed), changedAt: NOW });
  });

  it("pending über zwei Läufe: gleicher Hash übernimmt, anderer Hash extrahiert neu und bewertet neu", () => {
    const first = nextOf(run(ctx({ prev: undefined, baseline: 8, fetched: changed }), ok([])));
    // zweite Nacht, gleiche Eingabe: übernommen, ohne Aufruf
    const same = run(ctx({ prev: first, baseline: 8, fetched: changed }));
    expect(same.called).toBe(false);
    expect(nextOf(same)).toMatchObject({ events: [], status: "keine-termine", inputHash: keyOf(changed) });
    expect(nextOf(same).failingSince).toBeUndefined();
    // zweite Nacht, andere Eingabe: neu extrahiert; wieder Einbruch → neues pending, sonst übernommen
    const other = fetched({ pages: [{ url: "https://example.org/familientreff/programm", text: "Noch anders" }] });
    const again = nextOf(run(ctx({ prev: first, baseline: 8, fetched: other }), ok(events(1, "N"))));
    expect(again.pending?.inputHash).toBe(keyOf(other));
    const recovered = nextOf(run(ctx({ prev: first, baseline: 8, fetched: other }), ok(events(8, "N"))));
    expect(recovered).toMatchObject({ status: "ok", inputHash: keyOf(other) });
    expect(recovered.pending).toBeUndefined();
  });

  it("sonst: neue Events, ok bzw. keine-termine, failingSince und pending gelöscht", () => {
    const prev = raw({
      events: events(2),
      status: "fehler",
      reason: "alt",
      failingSince: LAST_WEEK,
      pending: { inputHash: "f".repeat(64), model: "haiku", events: [] },
    });
    const r = run(ctx({ prev, fetched: changed }), ok(events(3, "N"), "sonnet"));
    expect(r.kind === "write" && r.result).toBe("extrahiert");
    const next = nextOf(r);
    expect(next).toMatchObject({ status: "ok", model: "sonnet", inputHash: keyOf(changed), checkedAt: NOW });
    expect(next.changedAt).toBe(NOW);
    expect(next.failingSince).toBeUndefined();
    expect(next.reason).toBeUndefined();
    expect(next.pending).toBeUndefined();
    const none = nextOf(run(ctx({ prev: raw({ events: [] }), fetched: changed }), ok([])));
    expect(none.status).toBe("keine-termine");
  });

  it("gleiche Events nach neuer Extraktion: changedAt bleibt", () => {
    const next = nextOf(run(ctx({ fetched: changed }), ok(raw().events)));
    expect(next.changedAt).toBe(LAST_WEEK);
    expect(next.checkedAt).toBe(NOW);
  });

  it("Modellwechsel ändert den Schlüssel: einmal neu extrahieren (N3)", () => {
    expect(planRefresh(ctx({ keyParts: { ...KEY_PARTS, model: "sonnet" } })).kind).toBe("extract");
  });

  it("leere Eingabe (weder Seiten noch Kandidaten): kein Aufruf, wie eine leere Antwort bewertet", () => {
    const empty = fetched({ status: "leer", pages: [], text: "" });
    const r = run(ctx({ prev: raw({ events: [] }), fetched: empty }));
    expect(r.called).toBe(false);
    expect(r.kind === "keep" && r.result).toBe("leer");
    expect(nextOf(r)).toMatchObject({ status: "keine-termine", model: NO_INPUT_MODEL, inputHash: keyOf(empty) });
    // auch hier schützt der Einbruchschutz
    expect(nextOf(run(ctx({ fetched: empty }))).pending).toBeDefined();
  });

  it("abort (Auth oder Limit): kein neuer Zustand, der Lauf soll enden", () => {
    const r = run(ctx({ fetched: changed }), { kind: "abort", abort: "limit" });
    expect(r).toMatchObject({ kind: "abort", abort: "limit" });
    expect("next" in r).toBe(false);
  });
});

describe("refresh: vergangene Termine ändern den Schlüssel nicht (Plan 0032, Kostenhebel)", () => {
  const FEED = "https://example.org/familientreff/termine.ics";
  const termin = (day: string, summary = "Babymassage") => ({
    SUMMARY: summary,
    DTSTART: `${day.replaceAll("-", "")}T093000`,
  });
  const feed = (...events: object[]) =>
    fetched({ pages: [{ url: FEED, text: ICAL_HEADING + JSON.stringify(events, null, 1) }] });
  const keyAt = (f: FetchedUnit, today: string) =>
    extractKey(
      { pages: f.pages, candidates: f.candidates },
      { ...KEY_PARTS, catalog: catalogExcerpt(provider) },
      { today },
    );
  // Stand der Vornacht (11.): Termine am 10., 11. und 20.; der Lauf ist die direkt folgende Nacht (12.)
  const vornacht = feed(termin("2026-10-10"), termin("2026-10-11"), termin("2026-10-20"));
  const k0 = keyAt(vornacht, "2026-10-11");
  const prev = raw({ inputHash: k0.hash, dated: k0.dated });

  it("Feed verliert über Nacht nur Vergangenes: unverändert ohne Aufruf, dated ohne vergangene Tage", () => {
    const r = run(ctx({ prev, fetched: feed(termin("2026-10-20")) }));
    expect(r.called).toBe(false);
    expect(r.kind === "keep" && r.result).toBe("unveraendert");
    expect(nextOf(r).dated).toEqual({ "2026-10-20": k0.dated["2026-10-20"] });
  });

  it("geänderter künftiger Termin: Aufruf; gespeichert wird der neue Schlüssel ab heute", () => {
    const f = feed(termin("2026-10-20", "Babymassage entfällt"));
    const r = run(ctx({ prev, fetched: f }), ok(events(4)));
    expect(r.called).toBe(true);
    const k = keyAt(f, TODAY);
    expect(nextOf(r)).toMatchObject({ inputHash: k.hash, dated: k.dated });
  });

  it("pending mit derselben künftigen Eingabe wird übernommen", () => {
    const withPending = raw({
      pending: { inputHash: k0.hash, dated: k0.dated, model: "haiku", events: events(1, "Neu") },
    });
    const r = run(ctx({ prev: { ...withPending, inputHash: "alt" }, fetched: feed(termin("2026-10-20")) }));
    expect(r.kind === "keep" && r.result).toBe("pending-uebernommen");
    expect(nextOf(r).dated).toEqual({ "2026-10-20": k0.dated["2026-10-20"] });
  });

  it("Zustand von vor dem Umbau (Hash über alles, ohne dated): einmal neu extrahiert", () => {
    const old = raw({ inputHash: keyOf(feed(termin("2026-10-20"))) });
    expect(run(ctx({ prev: old, fetched: feed(termin("2026-10-20")) }), ok(events(4))).called).toBe(true);
  });

  it("Einbruchschutz zählt nur künftige Termine: gealterte Einzeltermine sind kein Einbruch", () => {
    const einzeln = (day: string) =>
      ev(`Termin ${day}`, { format: "einmalig", schedule: { kind: "dates", dates: [{ start: `${day}T10:00` }] } });
    const old = [
      ...["01", "02", "03", "04", "05", "06", "07", "08"].map((d) => einzeln(`2026-10-${d}`)),
      einzeln("2026-10-20"),
      einzeln("2026-10-27"),
      einzeln("2026-11-03"),
      einzeln("2026-11-10"),
    ];
    const fresh = [einzeln("2026-10-20"), einzeln("2026-10-27"), einzeln("2026-11-03")];
    const r = run(ctx({ prev: raw({ events: old }), fetched: changed }), ok(fresh));
    expect(r.kind === "write" && r.result).toBe("extrahiert");
    const collapse = run(ctx({ prev: raw({ events: old }), fetched: changed }), ok([]));
    expect(collapse.kind === "write" && collapse.result).toBe("einbruch");
  });
});

describe("refresh: Einbruch → ein Versuch mit dem Fallback-Modell (Plan 0032)", () => {
  const call = (step: CallRecord["step"], model: string): CallRecord => ({
    step,
    providerId: provider.id,
    model,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    webSearchRequests: 0,
    turns: 1,
    durationMs: 1,
    costUsd: null,
    result: "ok",
  });
  const c = () => ctx({ fetched: changed });
  const key = () => {
    const plan = planRefresh(c());
    if (plan.kind !== "extract") throw new Error("Aufruf erwartet");
    return plan.key;
  };
  const collapse = () => applyOutcome(c(), key(), ok([]));

  it("nur bei Einbruch und nur, wenn das Fallback-Modell nicht beteiligt war", () => {
    expect(collapse()).toMatchObject({ kind: "write", result: "einbruch" });
    expect(needsStrongRetry(collapse(), [call("extract", "haiku")])).toBe(true);
    expect(needsStrongRetry(collapse(), [call("extract", "haiku"), call("fallback", "sonnet")])).toBe(false);
    expect(needsStrongRetry(applyOutcome(c(), key(), ok(events(4))), [call("extract", "haiku")])).toBe(false);
    expect(needsStrongRetry({ kind: "abort", abort: "limit" }, [])).toBe(false);
  });

  it("der zweite Versuch gilt; fehler heißt unbestätigt: Bestand ohne pending (Plan-Review B1); Abbruch geht durch", () => {
    const full = applyOutcome(c(), key(), ok(events(4), "sonnet"));
    expect(afterStrongRetry(c(), full)).toBe(full);
    const again = applyOutcome(c(), key(), ok([], "sonnet"));
    expect(afterStrongRetry(c(), again)).toBe(again);
    const failed = afterStrongRetry(c(), applyOutcome(c(), key(), { kind: "fehler", reason: "Zeitüberschreitung" }));
    expect(failed).toMatchObject({ kind: "write", result: "einbruch" });
    const next = failed.kind === "write" ? UnitState.parse(failed.next) : undefined;
    expect(next?.pending).toBeUndefined();
    expect(next?.events).toHaveLength(4);
    expect(next?.reason).toBe("Einbruch nicht bestätigt (Fallback-Modell: Zeitüberschreitung), Bestand bleibt");
    expect(afterStrongRetry(c(), { kind: "abort", abort: "auth" })).toEqual({ kind: "abort", abort: "auth" });
  });

  it("unbestätigt entfernt auch ein älteres pending (Arch-Review M1)", () => {
    const prev = raw({ pending: { inputHash: "K1", model: "haiku", events: events(1, "Alt") } });
    const held = unconfirmedCollapse(ctx({ fetched: changed, prev }), "Bremse");
    expect(held.kind === "write" && held.next.pending).toBeUndefined();
  });

  it("unbestätigt: die nächste Nacht mit gleicher Eingabe extrahiert neu statt zu übernehmen", () => {
    const held = unconfirmedCollapse(c(), "Bremse");
    if (held.kind !== "write") throw new Error("write erwartet");
    expect(planRefresh(ctx({ fetched: changed, prev: UnitState.parse(held.next) })).kind).toBe("extract");
  });
});

describe("refresh: Ausfall eines Sammelkalenders (E5, Arch-Review S2 B1)", () => {
  const down = { evtermine: "HTTP 500" } as const;

  it("Anbieter mit Seiten, dessen Quelle der Vornacht ausfiel: alte Events, fehler", () => {
    const prev = raw({ sources: ["evtermine"] });
    const r = run(ctx({ prev, fetched: fetched({ id: KANDIDATEN, adapterIssues: down }) }));
    expect(r.called).toBe(false);
    expect(r.kind === "keep" && r.result).toBe("ausgefallen");
    expect(nextOf(r)).toMatchObject({ status: "fehler", reason: "evtermine: HTTP 500", events: raw().events });
  });

  it("Ausfall eines fremden Sammelkalenders zählt nicht", () => {
    const prev = raw({ sources: ["stadt-vk"] });
    expect(nextOf(run(ctx({ prev, fetched: fetched({ id: KANDIDATEN, adapterIssues: down }) }))).status).toBe("ok");
  });

  it("eine Seite hängt nie am Sammelkalender (Plan 0048, E1)", () => {
    const prev = raw({ sources: ["evtermine"] });
    expect(nextOf(run(ctx({ prev, fetched: fetched({ adapterIssues: down }) }))).status).toBe("ok");
  });

  it("nur Kandidaten: der eigene Adapter (coveredBy) zählt; ohne bekannte Quellen jeder", () => {
    const viaOwn = fetched({
      id: KANDIDATEN,
      via: "kandidaten",
      ownAdapter: "evtermine",
      adapterIssues: down,
      pages: [],
    });
    expect(nextOf(run(ctx({ prev: undefined, fetched: viaOwn }))).status).toBe("fehler");
    const other = fetched({
      id: KANDIDATEN,
      via: "kandidaten",
      ownAdapter: "stadt-vk",
      adapterIssues: down,
      pages: [],
    });
    expect(planRefresh(ctx({ prev: undefined, fetched: other })).kind).toBe("extract");
    const unknown = fetched({ id: KANDIDATEN, via: "kandidaten", adapterIssues: down, pages: [] });
    expect(nextOf(run(ctx({ prev: undefined, fetched: unknown }))).status).toBe("fehler");
  });
});

describe("assignVia: via setzt der Code (E4)", () => {
  const candidate = (source: Candidate["source"], detailUrl: string): Candidate => ({
    source,
    sourceId: "1",
    title: "Treff",
    description: "",
    detailUrl,
    cancelled: false,
    soldOut: false,
    waitlist: false,
    weekly: false,
    occurrences: [{ start: "2026-10-20T10:00" }],
  });

  it("via nur über sourceUrl = detailUrl; ein Link (url) auf eine Kandidatenseite zählt nicht, Angaben des Modells auch nicht", () => {
    const cands = [candidate("evtermine", "https://ev.de/1"), candidate("stadt-vk", "https://stadt.de/2")];
    const out = assignVia(
      [
        ev("A", { sourceUrl: "https://ev.de/1" }),
        ev("B", { url: "https://stadt.de/2", sourceUrl: "https://example.org/x" }),
        ev("C", { via: "frankenkids" }),
      ],
      cands,
    );
    expect(out.map((e) => e.via)).toEqual(["evtermine", undefined, undefined]);
    expect("via" in (out[2] ?? {})).toBe(false);
  });

  it("sources: Sammelkalender mit Kandidaten, sortiert und ohne Dubletten", () => {
    const c = ctx({
      prev: raw({ events: [] }),
      fetched: fetched({
        id: KANDIDATEN,
        candidates: [
          candidate("stadt-vk", "https://s/1"),
          candidate("evtermine", "https://e/1"),
          candidate("stadt-vk", "https://s/2"),
        ],
      }),
    });
    const r = run(c, ok([]));
    expect(nextOf(r).sources).toEqual(["evtermine", "stadt-vk"]);
  });
});

describe("offerUnits", () => {
  it("zählt die Angebote eines Anbieters", () => {
    const { file } = loadFixtures();
    const offers: OffersFile["offers"] = file.offers;
    expect(offerUnits(offers, "familientreff-beispiel")).toBe(4);
    expect(offerUnits(offers, "gibt-es-nicht")).toBe(0);
  });
});

describe("refresh je Einheit (Plan 0048, E5)", () => {
  const at = (day: string) => `${day}T03:00:00+02:00`;
  const gone = (klasse: "dauerhaft" | "voruebergehend") =>
    fetched({ status: "fehler", reason: "https://example.org/familientreff/programm: HTTP 404", klasse });
  /** Nacht `day` mit Abruf `f` auf den Zustand `prev` */
  const night = (prev: UnitState | undefined, f: Fetched, day: string, outcome?: ExtractOutcome) =>
    nextOf(run(ctx({ prev, fetched: f, today: day, now: at(day) }), outcome));

  it("Einbruch 1 → 0: eine leere Antwort auf einer kleinen Seite hält zurück", () => {
    const r = run(ctx({ prev: raw({ events: events(1) }), fetched: changed }), ok([]));
    expect(r.kind === "write" && r.result).toBe("einbruch");
    expect(nextOf(r).events).toHaveLength(1);
  });

  it("neue Einheit ohne Prüfmenge: keine Einbruchprüfung", () => {
    const r = run(ctx({ prev: undefined, fetched: changed }), ok([]));
    expect(r.kind === "write" && r.result).toBe("extrahiert");
  });

  it("Fehlerklasse: gleiche Klasse behält klasseSince, ein Wechsel beginnt neu; failingSince zählt die Serie", () => {
    const d1 = night(raw(), gone("voruebergehend"), "2026-10-12");
    const d2 = night(d1, gone("voruebergehend"), "2026-10-13");
    expect(d2).toMatchObject({
      klasse: "voruebergehend",
      klasseSince: at("2026-10-12"),
      failingSince: at("2026-10-12"),
    });
    const d3 = night(d2, gone("dauerhaft"), "2026-10-14");
    expect(d3).toMatchObject({ klasse: "dauerhaft", klasseSince: at("2026-10-14"), failingSince: at("2026-10-12") });
  });

  it("10 Tage HTTP 500, dann 404: an Tag 14 der Serie nicht entfernt", () => {
    let s: UnitState = night(raw(), gone("voruebergehend"), "2026-10-01");
    for (let d = 2; d <= 10; d++) s = night(s, gone("voruebergehend"), `2026-10-${String(d).padStart(2, "0")}`);
    for (let d = 11; d <= 14; d++) s = night(s, gone("dauerhaft"), `2026-10-${d}`);
    expect(s.events).toHaveLength(4);
    expect(s.reason).not.toMatch(/^entfernt/);
  });

  it("14 Tage 404: entfernt, Events und Schlüssel weg; Rückkehr mit gleichem Inhalt wird extrahiert", () => {
    const first = night(raw(), gone("dauerhaft"), "2026-10-01");
    const r = run(ctx({ prev: first, fetched: gone("dauerhaft"), today: "2026-10-15", now: at("2026-10-15") }));
    expect(r.kind === "keep" && r.result).toBe("entfernt");
    const removed = nextOf(r);
    expect(removed).toMatchObject({ events: [], status: "fehler", klasse: "dauerhaft" });
    expect(removed.reason).toBe("entfernt: https://example.org/familientreff/programm: HTTP 404 seit 2026-10-01");
    expect(removed.inputHash).toBeUndefined();
    // Tag 13: noch nicht
    expect(night(first, gone("dauerhaft"), "2026-10-14").events).toHaveLength(4);
    // die Seite kehrt mit unverändertem Inhalt zurück: kein „unverändert“, sondern neu extrahiert
    expect(planRefresh(ctx({ prev: removed, today: "2026-10-16", now: at("2026-10-16") })).kind).toBe("extract");
  });

  describe("emptySince", () => {
    const until = (day: string) =>
      ev("Kurs", {
        schedule: {
          kind: "weekly",
          weekdays: ["WE"],
          start: "10:00",
          from: "2026-09-02",
          until: day,
          skipHolidays: false,
        },
      });

    it("gesetzt bei „unverändert“, wenn die Kurse ablaufen (wöchentliche Regel mit abgelaufenem until)", () => {
      const prev = raw({ events: [until("2026-10-07")] });
      const r = run(ctx({ prev }));
      expect(r.kind === "keep" && r.result).toBe("unveraendert");
      expect(nextOf(r).emptySince).toBe(NOW);
    });

    it("bleibt über die Nächte und wird gelöscht, sobald es wieder künftige Termine gibt", () => {
      const prev = raw({ events: [until("2026-10-07")], emptySince: YESTERDAY });
      expect(nextOf(run(ctx({ prev }))).emptySince).toBe(YESTERDAY);
      expect(nextOf(run(ctx({ prev, fetched: changed }), ok(events(1, "N")))).emptySince).toBeUndefined();
    });

    it("gesetzt nach übernommenem Einbruch auf []", () => {
      const prev = raw({ pending: { inputHash: keyOf(changed), model: "haiku", events: [] } });
      const r = run(ctx({ prev, fetched: changed }));
      expect(r.kind === "keep" && r.result).toBe("pending-uebernommen");
      expect(nextOf(r).emptySince).toBe(NOW);
    });

    it("nicht gesetzt bei einer Einheit, die nie Events hatte", () => {
      expect(nextOf(run(ctx({ prev: raw({ events: [] }), fetched: changed }), ok([]))).emptySince).toBeUndefined();
    });

    it("hasFuture zählt nur Termine ab heute", () => {
      expect(hasFuture([until("2026-10-07")], TODAY, {})).toBe(false);
      expect(hasFuture([until("2026-10-21")], TODAY, {})).toBe(true);
    });
  });

  it("summarize: ein Anbieter scheitert nur ganz, einzelne Seiten sind teilausfall", () => {
    expect(summarize(["ausgefallen", "ausgefallen"])).toBe("ausgefallen");
    expect(summarize(["ausgefallen", "entfernt"])).toBe("fehler");
    expect(summarize(["ausgefallen", "extrahiert"])).toBe("teilausfall");
    expect(summarize(["unveraendert", "einbruch", "extrahiert"])).toBe("einbruch");
    expect(summarize(["unveraendert", "pending-uebernommen"])).toBe("pending-uebernommen");
    expect(summarize(["unveraendert", "offen"])).toBe("offen");
    expect(summarize(["unveraendert"])).toBe("unveraendert");
  });

  it("migrate: nur, wenn alle Einheiten ein Ergebnis haben und kein Einbruch vorliegt (E7)", () => {
    const u = (id: string, result: "extrahiert" | "leer" | "ausgefallen", n: number) => ({
      id,
      result,
      events: events(n),
    });
    const old = 6;
    expect(migrate({ old, units: [u("a", "extrahiert", 3), u("b", "leer", 0)], today: TODAY })).toEqual({
      ok: true,
    });
    expect(migrate({ old, units: [u("a", "extrahiert", 4), u("b", "ausgefallen", 0)], today: TODAY })).toEqual({
      ok: false,
      reason: "ohne gültiges Ergebnis: b (ausgefallen)",
    });
    expect(migrate({ old, units: [u("a", "extrahiert", 2)], today: TODAY })).toEqual({
      ok: false,
      reason: "Einbruch (6 → 2 Angebote)",
    });
  });
});
