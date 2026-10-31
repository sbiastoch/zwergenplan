import { describe, expect, it } from "vitest";
import type { CallRecord } from "./extract.ts";
import { CATEGORY_CONFLICT, ProviderRaw, RawEvent } from "./raw.ts";
import {
  assessRun,
  changedProviders,
  type LiveStatus,
  liveLag,
  NightlyReport,
  nightlyCommitMessage,
  parseCommitLog,
  renderStatus,
} from "./report.ts";

const NOW = new Date("2026-10-12T03:00:00+02:00");

const call = (providerId: string, over: Partial<CallRecord> = {}): CallRecord => ({
  step: "extract",
  providerId,
  model: "haiku",
  inputTokens: 1000,
  outputTokens: 500,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  webSearchRequests: 0,
  turns: 2,
  durationMs: 4000,
  costUsd: 0.005,
  result: "ok",
  ...over,
});

function report(over: Partial<NightlyReport> = {}): NightlyReport {
  return NightlyReport.parse({
    date: "2026-10-12",
    durationMs: 600_000,
    results: { a: "extrahiert", b: "unveraendert", c: "unveraendert", d: "unveraendert", e: "unveraendert" },
    calls: [call("a")],
    warnings: {},
    cached: 4,
    budgetHit: false,
    removed: [],
    adapters: { "evangelische-termine": { status: "ok", candidates: 10, matched: 4, warnings: [] } },
    build: { offers: 330, sessions: 2100, errors: [], notes: [], written: "data/offers.json" },
    previous: { offers: 325, sessions: 2050 },
    ...over,
  });
}

const live: LiveStatus = { kind: "aktuell", commit: "abc1234" };

const raw = (over: Partial<ProviderRaw>): ProviderRaw =>
  ProviderRaw.parse({
    events: [],
    inputHash: "h0",
    model: "haiku",
    changedAt: "2026-10-01T02:00:00+02:00",
    status: "ok",
    checkedAt: "2026-10-12T02:00:00+02:00",
    sources: [],
    ...over,
  });

describe("assessRun (E6: Ampel)", () => {
  it("grün ohne Befund", () => {
    expect(assessRun(report(), { live })).toEqual({ light: "gruen", red: [], yellow: [] });
  });

  it("rot bei Abbruch, Bremse oder Zeitbudget", () => {
    expect(assessRun(report({ abort: "limit" }), { live }).red).toEqual(["Abbruch: limit (Auth oder Nutzungslimit)"]);
    expect(assessRun(report({ brake: "tokens" }), { live }).red).toEqual(["Bremse erreicht: tokens (E8)"]);
    expect(assessRun(report({ budgetHit: true }), { live }).light).toBe("rot");
  });

  it("rot, wenn mehr als 20 % der Anbieter des Laufs fehler sind (fehler und ausgefallen); 20 % genau ist gelb", () => {
    const five = { a: "fehler", b: "unveraendert", c: "unveraendert", d: "unveraendert", e: "extrahiert" } as const;
    expect(assessRun(report({ results: five }), { live }).light).toBe("gelb");
    const two = { ...five, b: "ausgefallen" } as const;
    expect(assessRun(report({ results: two }), { live }).red).toEqual([
      "2 von 5 Anbietern mit Fehler (40 %, Grenze 20 %)",
    ]);
  });

  it("ein zurückgehaltener Einbruch ist kein Fehler des Laufs (auch mit status fehler im ersten Lauf), nur gelb", () => {
    const results = { a: "einbruch", b: "einbruch", c: "unveraendert", d: "unveraendert" } as const;
    const v = assessRun(report({ results }), { live });
    expect(v.red).toEqual([]);
    expect(v.yellow).toEqual(["2 Einbrüche zurückgehalten"]);
  });

  it("rot bei roten Gates, gescheitertem Push oder fehlendem Build", () => {
    expect(assessRun(report(), { live, gates: "failure" }).red).toEqual(["Gates rot (data:validate, check:fast)"]);
    expect(assessRun(report(), { live, push: "failure" }).red).toEqual(["Push gescheitert (Konflikt oder Prüfung)"]);
    const noBuild = report({ build: { offers: 0, sessions: 0, errors: ["kaputt"], notes: [] } });
    expect(assessRun(noBuild, { live }).red).toEqual(["Build abgebrochen: kaputt"]);
  });

  it("ohne Bericht rot", () => {
    expect(assessRun(undefined, { live }).red).toEqual(["kein Bericht (nightly.json fehlt)"]);
  });

  it("Live-Stand: mehr als einen Tag hinter main ist rot, unbekannt gelb", () => {
    const behind: LiveStatus = { kind: "hinter", commit: "abc1234", head: "def5678", hours: 30, commits: 2 };
    expect(assessRun(report(), { live: behind }).red).toEqual(["Live-Stand 30 Std. hinter main (abc1234 → def5678)"]);
    expect(assessRun(report(), { live: { ...behind, hours: 5 } }).light).toBe("gruen");
    expect(assessRun(report(), { live: { kind: "unbekannt", reason: "offline" } }).yellow).toEqual([
      "Live-Stand unbekannt: offline",
    ]);
  });

  it("gelb bei fehlerhaften Anbietern unter der Grenze, offenen oder abgebrochenen Anbietern und Warnungen", () => {
    const results = { a: "fehler", b: "offen", c: "unveraendert", d: "unveraendert", e: "unveraendert" } as const;
    expect(assessRun(report({ results }), { live }).yellow).toEqual([
      "1 Anbieter mit Fehler",
      "1 Anbieter nicht bearbeitet (offen oder abgebrochen)",
    ]);
  });
});

describe("liveLag (E6: Live-Stand gegen main)", () => {
  const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

  it("aktuell, wenn der live ausgelieferte Commit main ist", () => {
    expect(liveLag({ liveCommit: "abc1234", head: "abc1234ffff", missing: [], now: NOW })).toEqual({
      kind: "aktuell",
      commit: "abc1234",
    });
  });

  it("zählt ab dem ältesten fehlenden Commit, der nicht nur Doku ist (Doku-Pfad deployt nicht, ADR 0021)", () => {
    const missing = [
      { sha: "n3", at: at(2), docOnly: false },
      { sha: "n2", at: at(40), docOnly: true },
      { sha: "n1", at: at(26), docOnly: false },
    ];
    expect(liveLag({ liveCommit: "abc1234", head: "n3", missing, now: NOW })).toEqual({
      kind: "hinter",
      commit: "abc1234",
      head: "n3",
      hours: 26,
      commits: 2,
    });
    const docs = [{ sha: "n2", at: at(40), docOnly: true }];
    expect(liveLag({ liveCommit: "abc1234", head: "n2", missing: docs, now: NOW }).kind).toBe("aktuell");
  });

  it("unbekannt ohne Live-Commit oder wenn er nicht in main liegt", () => {
    expect(liveLag({ liveCommit: undefined, head: "x", missing: [], now: NOW, reason: "HTTP 500" })).toEqual({
      kind: "unbekannt",
      reason: "HTTP 500",
    });
    expect(liveLag({ liveCommit: "abc1234", head: "x", missing: undefined, now: NOW }).kind).toBe("unbekannt");
  });
});

describe("renderStatus (E10)", () => {
  const r = report({
    results: { a: "extrahiert", b: "fehler", c: "einbruch", d: "unveraendert" },
    calls: [call("a"), call("a", { step: "fallback", model: "sonnet", costUsd: 0.05 })],
    warnings: { a: ["Kurs ist schon vorbei – entfällt"] },
    adapters: {
      "evangelische-termine": { status: "fehler", reason: "HTTP 502", candidates: 0, matched: 0, warnings: [] },
    },
  });
  const md = renderStatus({
    report: r,
    verdict: assessRun(r, { live }),
    live,
    raws: {
      b: raw({ status: "fehler", reason: "HTTP 404", failingSince: "2026-10-09T02:00:00+02:00" }),
      c: raw({
        status: "ok",
        pending: { inputHash: "h", model: "haiku", events: [] },
      }),
    },
    stock: { c: 7 },
    fetchReport: "# Abruf 2026-10-12\n\n- Anbieter: 4",
  });

  it("Ampel und Gründe oben", () => {
    expect(md).toMatch(/^# Nachtlauf 2026-10-12 – Ampel: rot/);
    expect(md).toContain("- **rot:** 1 von 4 Anbietern mit Fehler (25 %, Grenze 20 %)");
    expect(md).toContain("- 1 Einbruch zurückgehalten");
  });

  it("Angebote und Termine gegen den Vorstand", () => {
    expect(md).toContain("| Angebote | 325 | 330 | +5 |");
    expect(md).toContain("| Termine | 2.050 | 2.100 | +50 |");
  });

  it("jede Quelle mit fehler samt Grund und failingSince, auch Sammelkalender", () => {
    expect(md).toContain("| b | HTTP 404 | 09.10.2026 |");
    expect(md).toContain("| evangelische-termine (Sammelkalender) | HTTP 502 | – |");
  });

  it("zurückgehaltene Einbrüche mit Bestand und neuer Zahl", () => {
    expect(md).toContain("| c | 7 | 0 |");
  });

  it("Warnungen je Anbieter", () => {
    expect(md).toContain("a: Kurs ist schon vorbei – entfällt");
  });

  it("Kosten als Schätzung des API-Gegenwerts beschriftet, je Schritt und Modell, Cache", () => {
    expect(md).toContain("Schätzung API-Gegenwert, nicht Abo-Preis");
    expect(md).toContain("| extract | haiku | 1 |");
    expect(md).toContain("| fallback | sonnet | 1 |");
    expect(md).toContain("durch den Cache gespart: 4");
  });

  it("Live-Stand und Abruf-Bericht", () => {
    expect(md).toContain("Live-Stand: aktuell (abc1234)");
    expect(md).toContain("<details><summary>Abruf</summary>");
    expect(md).toContain("# Abruf 2026-10-12");
  });

  it("ohne Bericht nur die Ampel", () => {
    const none = renderStatus({
      report: undefined,
      verdict: assessRun(undefined, { live }),
      live,
      raws: {},
      stock: {},
    });
    expect(none).toContain("Ampel: rot");
    expect(none).toContain("kein Bericht");
  });
});

describe("nightlyCommitMessage (Commit des Nachtlaufs)", () => {
  it("Betreff mit Datum, Angeboten und geänderten Anbietern; Text mit Kurzbericht", () => {
    const r = report({ results: { a: "extrahiert", b: "fehler", c: "pending-uebernommen", d: "unveraendert" } });
    const msg = nightlyCommitMessage(r, {
      b: raw({ status: "fehler", reason: "HTTP 404", failingSince: "2026-10-09T02:00:00+02:00" }),
    });
    const [subject, empty, ...body] = msg.split("\n");
    expect(subject).toBe("data: Nachtlauf 2026-10-12 (330 Angebote, 2 Anbieter geändert)");
    expect(empty).toBe("");
    expect(body).toContain("Angebote 330 (vorher 325), Termine 2.100 (vorher 2.050)");
    expect(body).toContain("Fehler: b (HTTP 404)");
    expect(body.join("\n")).toContain("Schätzung API-Gegenwert");
  });

  it("ID-Gate: Summenzeile, je Hinnehmen eine Zeile und je weggefallener ID eine Zeile (Arch-Review B, M4)", () => {
    const long = "x".repeat(200);
    const r = report({
      idGate: [
        {
          provider: "fz",
          unit: "",
          outcome: "uebernommen",
          ids: [
            { id: "fz-aaa", title: "PEKiP", kind: "gleich", reason: "derselbe Kurs" },
            { id: "fz-bbb", title: "Babymassage", kind: "entfallen", reason: "nicht mehr im Programm" },
            { id: "fz-ccc", title: "Krabbeln", kind: "fehlerhaft", reason: long },
          ],
        },
        {
          provider: "kita",
          unit: "kurse",
          outcome: "hingenommen",
          ids: [
            { id: "kita-1", title: "Turnen" },
            { id: "kita-2", title: "Singen" },
          ],
          note: "Seite neu aufgebaut",
        },
        {
          provider: "fbs",
          unit: "",
          outcome: "gehalten",
          held: "unklar",
          ids: [{ id: "fbs-1", title: "Spielgruppe" }],
        },
      ],
    });
    const body = nightlyCommitMessage(r, {}).split("\n");
    expect(body).toContain("ID-Gate: 1 geerbt, 4 weggefallen, 1 gehalten (ADR 0041)");
    expect(body).toContain("Hingenommen kita kurse: kita-1, kita-2 (Seite neu aufgebaut)");
    expect(body).toContain("Weggefallen fz: fz-bbb „Babymassage“ (entfallen: nicht mehr im Programm)");
    expect(body).toContain(`Weggefallen fz: fz-ccc „Krabbeln“ (fehlerhaft: ${"x".repeat(80)})`);
    expect(body.filter((l) => l.startsWith("Weggefallen"))).toHaveLength(2);
    expect(body.join("\n")).not.toContain("fbs-1");
  });

  it("changedProviders zählt übernommene neue Stände", () => {
    expect(changedProviders(report({ results: { a: "extrahiert", b: "pending-uebernommen", c: "einbruch" } }))).toBe(2);
  });
});

describe("parseCommitLog (Commits mit Dateien, für den Live-Stand)", () => {
  it("liest Commits mit Zeit und geänderten Dateien; neueste zuerst", () => {
    const text =
      "\u0000aaa1111\t2026-10-12T01:00:00+00:00\n\ndocs/plans/x.md\n" +
      "\u0000bbb2222\t2026-10-11T01:00:00+00:00\n\ndata/offers.json\nREADME.md\n";
    expect(parseCommitLog(text)).toEqual([
      { sha: "aaa1111", at: "2026-10-12T01:00:00+00:00", files: ["docs/plans/x.md"] },
      { sha: "bbb2222", at: "2026-10-11T01:00:00+00:00", files: ["data/offers.json", "README.md"] },
    ]);
    expect(parseCommitLog("")).toEqual([]);
  });
});

describe("Übergang Plan 0037: abgeleitete Kategorien und Widersprüche (E2, E5)", () => {
  const LINE = "Kategorie aus Themen abgeleitet: 3 Angebote (Übergang Plan 0037)";
  const withBuild = (derivedCategories?: number) =>
    report({
      build: {
        offers: 330,
        sessions: 2100,
        errors: [],
        notes: [],
        written: "data/offers.json",
        ...(derivedCategories === undefined ? {} : { derivedCategories }),
      },
    });

  it("Zeile „Kategorie aus Themen abgeleitet“ nur bei N > 0, im Commit-Text und im Bericht", () => {
    expect(nightlyCommitMessage(withBuild(3), {})).toContain(LINE);
    expect(nightlyCommitMessage(withBuild(0), {})).not.toContain("Kategorie aus Themen abgeleitet");
    expect(nightlyCommitMessage(withBuild(), {})).not.toContain("Kategorie aus Themen abgeleitet");
    const r = withBuild(3);
    expect(renderStatus({ report: r, verdict: assessRun(r, { live }), live, raws: {}, stock: {} })).toContain(LINE);
  });

  it("NightlyReport liest einen alten Bericht ohne derivedCategories", () => {
    expect(withBuild().build.derivedCategories).toBeUndefined();
  });

  const event = (i: number) =>
    RawEvent.parse({
      providerId: "a",
      venueId: "a-haus",
      title: `Treff ${i}`,
      summary: "Spielen und Austausch.",
      topics: ["krabbelgruppe"],
      format: "regelmaessig",
      registration: "ohne-anmeldung",
      cost: "kostenlos",
      url: "https://example.org/a",
      sourceUrl: "https://example.org/a",
      availability: { status: "ohne-anmeldung" },
      schedule: { kind: "weekly", weekdays: ["WE"], start: "10:00", from: "2026-10-07", skipHolidays: true },
    });
  const events = (n: number) => Array.from({ length: n }, (_, i) => event(i));
  const conflict = `events.0 („Treff 0“).category: musik ${CATEGORY_CONFLICT} (krabbelgruppe)`;
  const raws = {
    a: raw({ events: events(12) }),
    b: raw({ events: events(8) }),
    c: raw({ events: events(5) }),
  };

  it("zählt Widersprüche gegen die Events der frisch extrahierten Anbieter", () => {
    const r = report({
      results: { a: "extrahiert", b: "pending-uebernommen", c: "einbruch" },
      // b läuft ohne Modellaufruf, c ist nicht übernommen: ihre Warnungen und Events zählen nicht
      warnings: { a: [conflict, "Kurs ist schon vorbei – entfällt"], c: [conflict] },
    });
    const line = "Kategorie passt zu keinem Thema: 1 von 12 neuen Events (8 %)";
    expect(nightlyCommitMessage(r, raws)).toContain(line);
    expect(renderStatus({ report: r, verdict: assessRun(r, { live }), live, raws, stock: {} })).toContain(line);
  });

  it("ohne Widerspruch keine Zeile", () => {
    const r = report({ results: { a: "extrahiert", b: "pending-uebernommen" }, warnings: { a: ["anderes"] } });
    expect(nightlyCommitMessage(r, raws)).not.toContain("Kategorie passt zu keinem Thema");
    expect(renderStatus({ report: r, verdict: assessRun(r, { live }), live, raws, stock: {} })).not.toContain(
      "Kategorie passt zu keinem Thema",
    );
  });
});

describe("Bericht je Einheit (Plan 0048, E10)", () => {
  const T = "2026-10-12T02:00:00+02:00";
  const v2 = ProviderRaw.parse({
    version: 2,
    units: {
      "seite:https://a.de/1": {
        events: [],
        status: "fehler",
        reason: "HTTP 404",
        failingSince: "2026-10-09T02:00:00+02:00",
        checkedAt: T,
      },
      "seite:https://a.de/2": {
        events: [],
        inputHash: "h",
        model: "opus/xhigh",
        changedAt: T,
        status: "keine-termine",
        checkedAt: T,
        pending: { inputHash: "h2", model: "opus/xhigh", events: [] },
      },
    },
  });

  it("teilausfall und umstellung-ausstehend machen gelb, nicht rot, und zählen nicht zur 20-%-Regel", () => {
    const r = report({
      results: { a: "teilausfall", b: "teilausfall", c: "umstellung-ausstehend", d: "unveraendert" },
    });
    const v = assessRun(r, { live });
    expect(v.light).toBe("gelb");
    expect(v.red).toEqual([]);
    expect(v.yellow).toEqual(
      expect.arrayContaining([
        "2 Anbieter mit einzelnen Seiten im Fehler",
        "1 Anbieter noch nicht umgestellt (Plan 0048, E7)",
      ]),
    );
  });

  it("renderStatus nennt Fehler und Einbrüche je Einheit mit Kennung", () => {
    const r = report({ results: { a: "teilausfall" } });
    const md = renderStatus({ report: r, verdict: assessRun(r, { live }), live, raws: { a: v2 }, stock: { a: 3 } });
    expect(md).toContain("| a seite:https://a.de/1 | HTTP 404 | 09.10.2026 |");
    expect(md).toContain("| a seite:https://a.de/2 | 0 | 0 |");
  });

  it("nightlyCommitMessage nennt Anbieter mit einzelnen Seiten im Fehler", () => {
    const msg = nightlyCommitMessage(report({ results: { a: "teilausfall" } }), { a: v2 });
    expect(msg).toContain("Fehler: a (seite:https://a.de/1: HTTP 404)");
    expect(msg).toContain("teilausfall 1");
  });
});

describe("Lücken je Einheit (Plan 0048, E13)", () => {
  it("ein Bericht ohne gaps wird weiter gelesen", () => {
    expect(NightlyReport.parse(report()).gaps).toBeUndefined();
  });

  it("renderStatus zählt die Einheiten mit Lücke und wie viele der zweite Versuch schloss", () => {
    const r = report({
      gaps: {
        a: { "seite:https://a.de/1": { before: 2, after: 0, chosen: "second" }, "seite:https://a.de/2": { before: 1 } },
        b: { "seite:https://b.de": { before: 1, after: 1, chosen: "first" } },
      },
    });
    const md = renderStatus({ report: r, verdict: assessRun(r, { live }), live, raws: {}, stock: {} });
    expect(md).toContain("- Lücken gegen die Vornacht (E13): 3 Einheiten, 1 im zweiten Versuch geschlossen");
  });
});
