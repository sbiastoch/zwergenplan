import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type ProviderRaw, type ProviderRawV1, type ProviderRawV2, RawEvent, type UnitState } from "./raw.ts";
import { WATCH_MARKER, type WatchFinding, watchFindings, watchIssue, watchKey } from "./watch.ts";

const today = "2026-10-27";
const A = "seite:https://example.org/familientreff/programm";
const B = "seite:https://example.org/familientreff/kurse";
const hash8 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);

const ev = RawEvent.parse({
  providerId: "familientreff-beispiel",
  venueId: "familientreff-beispiel-haus",
  title: "Offener Krabbeltreff",
  summary: "Spielen und Austausch für Familien mit Babys.",
  topics: ["krabbelgruppe"],
  format: "regelmaessig",
  registration: "ohne-anmeldung",
  cost: "kostenlos",
  url: "https://example.org/familientreff/krabbeltreff",
  sourceUrl: "https://example.org/familientreff/programm",
  availability: { status: "ohne-anmeldung" },
  schedule: { kind: "weekly", weekdays: ["WE"], start: "10:00", end: "11:30", from: "2026-10-07", skipHolidays: true },
});

/** Einheit mit künftigen Events, zuletzt in der Nacht von `today` geprüft */
const ok = (over: Partial<UnitState> = {}): UnitState => ({
  events: [ev],
  inputHash: "h",
  model: "opus",
  status: "ok",
  checkedAt: "2026-10-27T03:00:00+01:00",
  changedAt: "2026-10-20T03:00:00+02:00",
  ...over,
});
/** Einheit im Fehler seit `since` */
const failing = (since: string, over: Partial<UnitState> = {}): UnitState =>
  ok({ status: "fehler", reason: "HTTP 503", failingSince: since, ...over });
const v2 = (units: Record<string, UnitState>, beilagen?: ProviderRawV2["beilagen"]): ProviderRawV2 => ({
  version: 2,
  units,
  ...(beilagen ? { beilagen } : {}),
});
const catalogOf = (raws: Record<string, ProviderRaw>) => Object.keys(raws).map((id) => ({ id, role: "anbieter" }));
const find = (raws: Record<string, ProviderRaw>) => watchFindings({ raws, catalog: catalogOf(raws), today });

describe("watchFindings (Plan 0048, E10)", () => {
  it("nichts offen → keine Befunde", () => {
    expect(find({ a: v2({ [A]: ok(), [B]: ok() }) })).toEqual([]);
  });

  it("seite erst ab dem zweiten Kalendertag, auch bei Bot-Schutz", () => {
    const firstNight = failing("2026-10-27T03:00:00+01:00", {
      klasse: "voruebergehend",
      klasseSince: "2026-10-27T03:00:00+01:00",
    });
    expect(find({ a: v2({ [A]: ok(), [B]: firstNight }) })).toEqual([]);
    const second = failing("2026-10-26T03:00:00+01:00", {
      reason: "Bot-Schutz (HTTP 403)",
      klasse: "voruebergehend",
      klasseSince: "2026-10-26T03:00:00+01:00",
    });
    expect(find({ a: v2({ [A]: ok(), [B]: second }) })).toEqual([
      { providerId: "a", kind: "seite", page: B, reason: "Bot-Schutz (HTTP 403)", since: "2026-10-26T03:00:00+01:00" },
    ]);
  });

  it("Tage nach Europe/Berlin: 23:30 UTC am Vortag ist in Berlin schon heute", () => {
    // 2026-10-26T23:30Z = 27.10. 00:30 in Berlin: erst die erste Nacht
    expect(find({ a: v2({ [A]: ok(), [B]: failing("2026-10-26T23:30:00Z") }) })).toEqual([]);
    expect(find({ a: v2({ [A]: ok(), [B]: failing("2026-10-26T22:30:00Z") }) })).toHaveLength(1);
  });

  it("gesperrt sofort, nicht zusätzlich als seite", () => {
    const blocked = failing("2026-10-20T03:00:00+02:00", {
      reason: "robots.txt sperrt",
      klasse: "gesperrt",
      klasseSince: "2026-10-27T03:00:00+01:00",
    });
    expect(find({ a: v2({ [A]: ok(), [B]: blocked }) })).toEqual([
      { providerId: "a", kind: "gesperrt", page: B, reason: "robots.txt sperrt", since: "2026-10-27T03:00:00+01:00" },
    ]);
  });

  it("entfernt, nicht zusätzlich als seite", () => {
    const {
      inputHash: _h,
      model: _m,
      changedAt: _c,
      ...rest
    } = failing("2026-10-06T03:00:00+02:00", {
      reason: "entfernt: HTTP 404 seit 2026-10-06",
      klasse: "dauerhaft",
      klasseSince: "2026-10-06T03:00:00+02:00",
      removedAt: "2026-10-21T03:00:00+02:00",
    });
    expect(find({ a: v2({ [A]: ok(), [B]: { ...rest, events: [] } }) })).toEqual([
      {
        providerId: "a",
        kind: "entfernt",
        page: B,
        reason: "entfernt: HTTP 404 seit 2026-10-06",
        since: "2026-10-21T03:00:00+02:00",
      },
    ]);
  });

  it("einbruch: zurückgehaltene Antwort mit Zahl der Events", () => {
    const held = ok({ pending: { inputHash: "neu", model: "opus", events: [] } });
    expect(find({ a: v2({ [A]: held }) })).toEqual([
      { providerId: "a", kind: "einbruch", page: A, reason: "zurückgehalten: 0 statt 1 Events" },
    ]);
  });

  it("leer nur, wenn keine Einheit künftige Events hat, und 14 Tage lang", () => {
    const empty = (since: string) => ok({ emptySince: since });
    // eine Einheit hat noch künftige Events
    expect(find({ a: v2({ [A]: empty("2026-10-20T03:00:00+02:00"), [B]: ok() }) })).toEqual([]);
    // keine mehr; die zweite Einheit hatte nie Events
    const none = ok({ events: [], status: "keine-termine" });
    expect(find({ a: v2({ [A]: empty("2026-10-20T03:00:00+02:00"), [B]: none }) })).toEqual([
      { providerId: "a", kind: "leer", reason: "keine künftigen Angebote", since: "2026-10-20T03:00:00+02:00" },
    ]);
    // das späteste emptySince zählt; 14 Tage zurück noch gemeldet, 15 nicht mehr
    const both = (a: string, b: string) => find({ a: v2({ [A]: empty(a), [B]: empty(b) }) });
    expect(both("2026-10-01T03:00:00+02:00", "2026-10-13T03:00:00+02:00")[0]?.since).toBe("2026-10-13T03:00:00+02:00");
    expect(both("2026-10-01T03:00:00+02:00", "2026-10-12T03:00:00+02:00")).toEqual([]);
    // ohne emptySince (nie Events gehabt) kein Befund
    expect(find({ a: v2({ [A]: none }) })).toEqual([]);
  });

  it("anbieter statt je Seite, wenn alle Einheiten seit mindestens einem Tag scheitern", () => {
    const r = find({
      a: v2({
        [A]: failing("2026-10-24T03:00:00+02:00"),
        [B]: failing("2026-10-25T03:00:00+01:00", { reason: "HTTP 500" }),
      }),
    });
    expect(r).toEqual([
      {
        providerId: "a",
        kind: "anbieter",
        reason: `alle 2 Seiten scheitern (${A}: HTTP 503; ${B}: HTTP 500)`,
        since: "2026-10-24T03:00:00+02:00",
      },
    ]);
    // eine Einheit erst seit heute: je Seite
    const mixed = find({
      a: v2({ [A]: failing("2026-10-24T03:00:00+02:00"), [B]: failing("2026-10-27T03:00:00+01:00") }),
    });
    expect(mixed.map((f) => f.kind)).toEqual(["seite"]);
  });

  it("umstellung je V1-Datei", () => {
    const v1: ProviderRawV1 = {
      events: [ev],
      inputHash: "h",
      model: "haiku",
      status: "ok",
      checkedAt: "2026-10-27T03:00:00+01:00",
      changedAt: "2026-10-20T03:00:00+02:00",
      sources: [],
    };
    expect(find({ b: v1, a: v2({ [A]: ok() }) })).toEqual([
      { providerId: "b", kind: "umstellung", reason: "Rohdatei noch im alten Format (V1)" },
    ]);
  });

  it("gescheiterte Beilage ab dem zweiten Tag", () => {
    const beilage = (since: string) => ({
      [B]: {
        status: "fehler" as const,
        reason: "HTTP 404",
        checkedAt: "2026-10-27T03:00:00+01:00",
        failingSince: since,
      },
    });
    expect(find({ a: v2({ [A]: ok() }, beilage("2026-10-27T03:00:00+01:00")) })).toEqual([]);
    expect(find({ a: v2({ [A]: ok() }, beilage("2026-10-26T03:00:00+01:00")) })).toEqual([
      { providerId: "a", kind: "seite", page: B, reason: "Beilage: HTTP 404", since: "2026-10-26T03:00:00+01:00" },
    ]);
  });

  it("nur Anbieter des Katalogs, die der Nachtlauf abruft (Arch-Review S2, M1)", () => {
    const broken = v2({ [A]: failing("2026-10-20T03:00:00+02:00") });
    const raws = { a: broken, b: broken, c: broken, d: broken };
    const catalog = [
      { id: "a", role: "anbieter" },
      { id: "b", role: "anbieter", skipCrawl: { reason: "ruht", since: "2026-10-01" } },
      { id: "c", role: "aggregator" },
    ];
    expect(watchFindings({ raws, catalog, today }).map((f) => f.providerId)).toEqual(["a"]);
  });

  it("sortiert nach Anbieter, Art und Seite", () => {
    const r = find({
      z: v2({ [A]: failing("2026-10-20T03:00:00+02:00"), [B]: ok() }),
      a: v2({
        [B]: failing("2026-10-20T03:00:00+02:00"),
        [A]: ok({ pending: { inputHash: "x", model: "opus", events: [] } }),
      }),
    });
    expect(r.map((f) => `${f.providerId}:${f.kind}`)).toEqual(["a:einbruch", "a:seite", "z:seite"]);
  });
});

describe("watchKey und Marker", () => {
  it("Anbieter-ID, bei Befunden einer Seite id#hash8 der Kennung", () => {
    expect(watchKey({ providerId: "a", kind: "leer", reason: "" })).toBe("a");
    expect(watchKey({ providerId: "a", kind: "seite", page: B, reason: "" })).toBe(`a#${hash8(B)}`);
  });

  it("fällt eine zweite Seite desselben Anbieters aus, entsteht ein neues Paar", () => {
    const one = watchIssue(find({ a: v2({ [A]: ok(), [B]: failing("2026-10-20T03:00:00+02:00") }) }), today);
    const two = watchIssue(
      find({
        a: v2({
          [A]: failing("2026-10-25T03:00:00+01:00"),
          [B]: failing("2026-10-20T03:00:00+02:00"),
          "seite:https://example.org/c": ok(),
        }),
      }),
      today,
    );
    const pairs = (t: string) => t.match(WATCH_MARKER)?.[1]?.split(",") ?? [];
    expect(pairs(one)).toEqual([`a#${hash8(B)}:seite`]);
    // sortiert nach Seite: …/kurse (B) vor …/programm (A)
    expect(pairs(two)).toEqual([`a#${hash8(B)}:seite`, `a#${hash8(A)}:seite`]);
  });
});

describe("watchIssue (Plan 0048, E10)", () => {
  const f = (over: Partial<WatchFinding> = {}): WatchFinding => ({
    providerId: "a",
    kind: "seite",
    page: B,
    reason: "HTTP 503",
    since: "2026-10-25T03:00:00+01:00",
    ...over,
  });

  it("leere Befunde → leerer Text", () => {
    expect(watchIssue([], today)).toBe("");
  });

  it("Liste mit Anbieter, Art, Seite, Grund, seit; letzte Zeile der Marker", () => {
    const text = watchIssue(
      [f(), f({ providerId: "b", kind: "umstellung", page: undefined, reason: "V1", since: undefined })],
      today,
    );
    const lines = text.split("\n");
    expect(lines[0]).toContain("27.10.2026");
    expect(lines).toContain(`- \`a\` · seite · \`${B}\` · \`HTTP 503\` · seit 25.10.2026`);
    expect(lines).toContain("- `b` · umstellung · `V1`");
    expect(lines.at(-1)).toBe(`<!-- waechter: a#${hash8(B)}:seite,b:umstellung -->`);
    expect(lines.at(-1)).toMatch(WATCH_MARKER);
  });

  it("fremder Text nur in Code-Spans, ohne Backticks, Zeilenumbrüche und @", () => {
    const text = watchIssue([f({ reason: "böse `code`\nzweite Zeile @someone" })], today);
    const line = text.split("\n").find((l) => l.startsWith("- "));
    expect(line).toBe(`- \`a\` · seite · \`${B}\` · \`böse 'code' zweite Zeile (at)someone\` · seit 25.10.2026`);
    expect(text).not.toContain("@");
  });

  it("je Zeile höchstens 200 Zeichen, gesamt unter 60 000", () => {
    const long = f({ page: `seite:https://example.org/${"x".repeat(300)}`, reason: "y".repeat(500) });
    const text = watchIssue(
      Array.from({ length: 1000 }, (_, i) => ({ ...long, providerId: `anbieter-${i}` })),
      today,
    );
    const lines = text.split("\n");
    for (const l of lines.slice(0, -1)) expect(l.length).toBeLessThanOrEqual(200);
    expect(text.length).toBeLessThan(60_000);
    expect(lines.find((l) => l.startsWith("- "))).toMatch(
      /^- `anbieter-0` · seite · `seite:https:\/\/example\.org\/x+…` · `y+…` · seit 25\.10\.2026$/,
    );
    expect(text).toMatch(/weitere Befunde/);
    // der Marker trägt alle Paare, auch die nicht gelisteten
    expect(text.match(WATCH_MARKER)?.[1]?.split(",")).toHaveLength(1000);
  });

  it("Marker geprüft: unerlaubte Zeichen in der Anbieter-ID werfen", () => {
    expect(() => watchIssue([f({ providerId: "A B" })], today)).toThrow(/Marker/);
  });
});
