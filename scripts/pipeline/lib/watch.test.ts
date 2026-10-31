import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DiscoverState } from "./discover-state.ts";
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
const find = (raws: Record<string, ProviderRaw>) =>
  watchFindings({ raws, catalog: catalogOf(raws), discover: [], today });

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
      { subject: "a", kind: "seite", page: B, reason: "Bot-Schutz (HTTP 403)", since: "2026-10-26T03:00:00+01:00" },
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
      { subject: "a", kind: "gesperrt", page: B, reason: "robots.txt sperrt", since: "2026-10-27T03:00:00+01:00" },
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
        subject: "a",
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
      { subject: "a", kind: "einbruch", page: A, reason: "zurückgehalten: 0 statt 1 Events" },
    ]);
  });

  it("ids: vom ID-Gate gehaltene Einheit mit Zahl und IDs, Grund nach held.reason (ADR 0041, Punkt 6)", () => {
    const held = (reason: "unklar" | "grenze", lost: string[]) =>
      ok({
        held: { inputHash: "neu", model: "haiku", events: [ev], since: "2026-10-26T03:00:00+01:00", reason, lost },
      });
    expect(
      find({ a: v2({ [A]: held("unklar", ["ab12cd34", "ef56gh78"]), [B]: held("grenze", ["xy12ab34"]) }) }),
    ).toEqual([
      {
        subject: "a",
        kind: "ids",
        page: B,
        reason: "1 ID: Richter nicht gelaufen (Grenze), nächste Nacht erneut (xy12ab34)",
        since: "2026-10-26T03:00:00+01:00",
      },
      {
        subject: "a",
        kind: "ids",
        page: A,
        reason: "2 IDs: Urteil unklar, Einheit gehalten (ab12cd34, ef56gh78)",
        since: "2026-10-26T03:00:00+01:00",
      },
    ]);
  });

  it("leer nur, wenn keine Einheit künftige Events hat, und 14 Tage lang", () => {
    const empty = (since: string) => ok({ emptySince: since });
    // eine Einheit hat noch künftige Events
    expect(find({ a: v2({ [A]: empty("2026-10-20T03:00:00+02:00"), [B]: ok() }) })).toEqual([]);
    // keine mehr; die zweite Einheit hatte nie Events
    const none = ok({ events: [], status: "keine-termine" });
    expect(find({ a: v2({ [A]: empty("2026-10-20T03:00:00+02:00"), [B]: none }) })).toEqual([
      { subject: "a", kind: "leer", reason: "keine künftigen Angebote", since: "2026-10-20T03:00:00+02:00" },
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
        subject: "a",
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
      { subject: "b", kind: "umstellung", reason: "Rohdatei noch im alten Format (V1)" },
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
      { subject: "a", kind: "seite", page: B, reason: "Beilage: HTTP 404", since: "2026-10-26T03:00:00+01:00" },
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
    expect(watchFindings({ raws, catalog, discover: [], today }).map((f) => f.subject)).toEqual(["a"]);
  });

  it("sortiert nach Anbieter, Art und Seite", () => {
    const r = find({
      z: v2({ [A]: failing("2026-10-20T03:00:00+02:00"), [B]: ok() }),
      a: v2({
        [B]: failing("2026-10-20T03:00:00+02:00"),
        [A]: ok({ pending: { inputHash: "x", model: "opus", events: [] } }),
      }),
    });
    expect(r.map((f) => `${f.subject}:${f.kind}`)).toEqual(["a:einbruch", "a:seite", "z:seite"]);
  });
});

describe("Klärfälle im Wächter (Plan 0050, S2b)", () => {
  const k = (over: Partial<DiscoverState["klaerfaelle"][number]> = {}): DiscoverState["klaerfaelle"][number] => ({
    url: "https://www.beispiel-familie.de/kurse/?utm_source=x",
    name: "Familienzentrum Beispiel",
    grund: "mögliche Dublette von familientreff-beispiel",
    seit: "2026-09-01",
    zuletzt: "2026-10-01",
    anzahl: 2,
    ...over,
  });
  const withStates = (discover: Pick<DiscoverState, "region" | "klaerfaelle">[]) =>
    watchFindings({ raws: {}, catalog: [], discover, today });

  it("meldet einen Klärfall ab anzahl 2 mit Name, Region, Grund und Fund-URL", () => {
    const r = withStates([
      { region: "fuerth", klaerfaelle: [k(), k({ url: "https://example.org/neu", name: "Neu", anzahl: 1 })] },
    ]);
    expect(r).toEqual([
      {
        subject: "Familienzentrum Beispiel",
        kind: "klaerfall",
        page: "https://www.beispiel-familie.de/kurse/?utm_source=x",
        reason: "Fürth: mögliche Dublette von familientreff-beispiel",
        since: "2026-09-01",
      },
    ]);
  });

  it("ohne Namen steht der Host als Gegenstand", () => {
    const r = withStates([{ region: "nuernberg", klaerfaelle: [k({ name: " " })] }]);
    expect(r[0]?.subject).toBe("beispiel-familie.de");
    expect(r[0]?.reason).toMatch(/^Nürnberg: /);
  });

  it("Schlüssel klaerfall#hash8 der normalisierten URL, passt zum Marker", () => {
    const [f] = withStates([{ region: "fuerth", klaerfaelle: [k()] }]);
    if (!f) throw new Error("kein Befund");
    expect(watchKey(f)).toBe(`klaerfall#${hash8("beispiel-familie.de/kurse")}`);
    // Schreibweisen derselben Seite geben denselben Schlüssel
    expect(watchKey({ ...f, page: "http://beispiel-familie.de/kurse" })).toBe(watchKey(f));
    const text = watchIssue([f], today);
    expect(text.match(WATCH_MARKER)?.[1]).toBe(`klaerfall#${hash8("beispiel-familie.de/kurse")}:klaerfall`);
    expect(text).toContain(
      "- `Familienzentrum Beispiel` · klaerfall · `https://www.beispiel-familie.de/kurse/?utm_source=x` · `Fürth: mögliche Dublette von familientreff-beispiel` · seit 01.09.2026",
    );
  });

  it("Klärfälle stehen neben den Befunden des Nachtlaufs", () => {
    const r = watchFindings({
      raws: { a: v2({ [B]: failing("2026-10-20T03:00:00+02:00"), [A]: ok() }) },
      catalog: [{ id: "a", role: "anbieter" }],
      discover: [{ region: "fuerth", klaerfaelle: [k()] }],
      today,
    });
    expect(r.map((f) => `${f.subject}:${f.kind}`)).toEqual(["Familienzentrum Beispiel:klaerfall", "a:seite"]);
  });
});

describe("watchKey und Marker", () => {
  it("Anbieter-ID, bei Befunden einer Seite id#hash8 der Kennung", () => {
    expect(watchKey({ subject: "a", kind: "leer", reason: "" })).toBe("a");
    expect(watchKey({ subject: "a", kind: "seite", page: B, reason: "" })).toBe(`a#${hash8(B)}`);
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
    subject: "a",
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
      [f(), f({ subject: "b", kind: "umstellung", page: undefined, reason: "V1", since: undefined })],
      today,
    );
    const lines = text.split("\n");
    expect(lines[0]).toContain("27.10.2026");
    expect(lines).toContain(`- \`a\` · seite · \`${B}\` · \`HTTP 503\` · seit 25.10.2026`);
    expect(lines).toContain("- `b` · umstellung · `V1`");
    expect(lines.at(-1)).toBe(`<!-- waechter: a#${hash8(B)}:seite,b:umstellung -->`);
    expect(lines.at(-1)).toMatch(WATCH_MARKER);
  });

  it("Hinweis zum Hinnehmen nur, wenn ein Befund ids dabei ist", () => {
    const hint = /hinnehmen: Eintrag in data\/id-hinnehmen\.yaml \(Anbieter, Grund, Datum\); oder Zuordnung verbessern/;
    expect(watchIssue([f()], today)).not.toMatch(hint);
    const text = watchIssue(
      [f(), f({ kind: "ids", reason: "1 ID: Urteil unklar, Einheit gehalten (ab12cd34)" })],
      today,
    );
    expect(text).toMatch(hint);
    expect(text.split("\n").at(-1)).toBe(`<!-- waechter: a#${hash8(B)}:seite,a#${hash8(B)}:ids -->`);
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
      Array.from({ length: 1000 }, (_, i) => ({ ...long, subject: `anbieter-${i}` })),
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
    expect(() => watchIssue([f({ subject: "A B" })], today)).toThrow(/Marker/);
  });
});
