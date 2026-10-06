import { describe, expect, it } from "vitest";
import type { SiteOffer } from "../../src/domain/site-data.ts";
import { FIXTURE_NOW, fixtureKey, fixtureSiteOffers } from "../../src/domain/test-fixtures.ts";
import { parseWeeklyArgs, runWeekly, type WeeklyDeps } from "./push-weekly-core.ts";

const offers = fixtureSiteOffers();

const SATURDAY = new Date("2026-10-10T10:07:00+02:00");
const SITE = "https://zwergenplan.app/";
const sub = (n: number) => ({
  hash: `h${n}abcdef`,
  subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: "p", auth: "a" } },
});

function deps(overrides: Partial<WeeklyDeps> = {}) {
  const sent: { endpoint: string; payload: unknown }[] = [];
  const removed: string[][] = [];
  const marks: string[] = [];
  const lines: string[] = [];
  const warnings: string[] = [];
  const d: WeeklyDeps = {
    now: SATURDAY,
    siteUrl: SITE,
    current: offers,
    // neu: Krabbeltreff und PEKiP (beide mit Terminen nach dem 10.10.)
    previousIds: async () =>
      offers.filter((o) => !["krabbeltreff", "pekip-herbst"].includes(fixtureKey(o) ?? "")).map((o) => o.id),
    worker: {
      list: async () => [sub(1), sub(2), sub(3)],
      mark: async (day) => {
        marks.push(day);
        return "neu";
      },
      remove: async (hashes) => {
        removed.push(hashes);
      },
    },
    send: async (subscription, payload) => {
      sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
      return subscription.endpoint.endsWith("/2") ? 410 : 201;
    },
    log: (line) => lines.push(line),
    warn: (line) => warnings.push(line),
    ...overrides,
  };
  return { d, sent, removed, marks, lines, warnings };
}

describe("parseWeeklyArgs", () => {
  it("ohne Argumente: Zeitplan-Lauf", () => {
    expect(parseWeeklyArgs([])).toEqual({ force: false, dryRun: false });
  });

  it("Testversand braucht --only, außer beim Trockenlauf", () => {
    expect(parseWeeklyArgs(["--force", "--only=ab12cd34"])).toEqual({ force: true, dryRun: false, only: "ab12cd34" });
    expect(parseWeeklyArgs(["--force", "--dry-run"])).toEqual({ force: true, dryRun: true });
    expect(() => parseWeeklyArgs(["--force"])).toThrow(/--only/);
    expect(() => parseWeeklyArgs(["--force", "--only="])).toThrow(/--only/);
    expect(() => parseWeeklyArgs(["--bunt"])).toThrow(/unbekannt/);
    // kurzer Präfix träfe viele Geräte (Arch-Review N11)
    expect(() => parseWeeklyArgs(["--force", "--only=a"])).toThrow(/Geräte-Kennung/);
    expect(() => parseWeeklyArgs(["--force", "--only=ab12cd3"])).toThrow(/Geräte-Kennung/);
  });
});

describe("runWeekly", () => {
  it("Samstag: zählt neu gegen den Stand vor 7 Tagen, setzt die Marke, sendet und räumt 410 auf", async () => {
    const { d, sent, removed, marks, lines } = deps();
    const result = await runWeekly(d, { force: false, dryRun: false });
    // Woche ab 10.10., 10:07: PEKiP (13.10.), Krabbeltreff (14.10.), Babymassage (17.10., 10:00)
    expect(result).toEqual({ status: "gesendet", news: 2, week: 3, sent: 2, removed: 1, failed: 0 });
    expect(marks).toEqual(["2026-10-10"]);
    expect(sent).toHaveLength(3);
    expect(sent[0]?.payload).toMatchObject({
      notification: {
        body: "2 neue Angebote seit letztem Samstag",
        navigate: SITE,
        data: { sentAt: "2026-10-10T10:07:00+02:00" },
      },
    });
    expect(removed).toEqual([["h2abcdef"]]);
    // Ausgabe nur als Zahlen, keine Endpoints
    expect(lines.join("\n")).not.toContain("fcm.googleapis.com");
  });

  it("die Woche zählt ab dem Lauf (Fixture-Jetzt: Krabbeltreff und Krabbelreime)", async () => {
    const { d } = deps({ now: FIXTURE_NOW });
    const result = await runWeekly(d, { force: true, dryRun: true });
    expect(result).toMatchObject({ week: 2 });
    expect(
      offers.filter((o: SiteOffer) => ["krabbeltreff", "krabbelreime"].includes(fixtureKey(o) ?? "")),
    ).toHaveLength(2);
  });

  it("außerhalb von Samstag 10–14 Uhr: kein Versand, keine Marke", async () => {
    const { d, sent, marks } = deps({ now: new Date("2026-10-12T10:07:00+02:00") });
    expect(await runWeekly(d, { force: false, dryRun: false })).toEqual({ status: "ausserhalb" });
    expect(sent).toEqual([]);
    expect(marks).toEqual([]);
  });

  it("Marke schon gesetzt (Re-run am selben Samstag): kein Versand", async () => {
    const { d, sent } = deps();
    d.worker.mark = async () => "schon";
    expect(await runWeekly(d, { force: false, dryRun: false })).toMatchObject({ status: "schon-gesendet" });
    expect(sent).toEqual([]);
  });

  it("erst die Abos lesen, dann die Marke: Ein Lesefehler kostet die Woche nicht", async () => {
    const { d, marks } = deps();
    d.worker.list = async () => {
      throw new Error("Worker weg");
    };
    await expect(runWeekly(d, { force: false, dryRun: false })).rejects.toThrow("Worker weg");
    expect(marks).toEqual([]);
  });

  it("fehlt der alte Stand: neu = 0 mit Warnung", async () => {
    const { d, sent, warnings } = deps({ previousIds: async () => undefined });
    const result = await runWeekly(d, { force: false, dryRun: false });
    expect(result).toMatchObject({ news: 0 });
    expect(warnings.join(" ")).toMatch(/alte Stand/);
    expect(sent[0]?.payload).toMatchObject({
      notification: { body: "Diese Woche nichts Neues. 3 Angebote in den nächsten 7 Tagen." },
    });
  });

  it("Testversand: ohne Wächter und Marke, nur an --only, mit data.test", async () => {
    const { d, sent, marks } = deps({ now: new Date("2026-10-12T15:00:00+02:00") });
    const result = await runWeekly(d, { force: true, dryRun: false, only: "h3" });
    expect(result).toMatchObject({ status: "gesendet", sent: 1 });
    expect(marks).toEqual([]);
    expect(sent.map((s) => s.endpoint)).toEqual(["https://fcm.googleapis.com/fcm/send/3"]);
    expect(sent[0]?.payload).toMatchObject({ notification: { data: { test: true } } });
  });

  it("Trockenlauf: zählt nur Abos", async () => {
    const { d, sent, lines } = deps();
    expect(await runWeekly(d, { force: true, dryRun: true })).toMatchObject({ status: "trocken", subscriptions: 3 });
    expect(sent).toEqual([]);
    expect(lines.join(" ")).toMatch(/3 Abos/);
  });

  it("Fehler beim Senden sind Warnungen, kein Abbruch", async () => {
    const { d, warnings } = deps();
    d.send = async () => {
      throw new Error("Netz");
    };
    expect(await runWeekly(d, { force: false, dryRun: false })).toMatchObject({ sent: 0, failed: 3 });
    expect(warnings).toHaveLength(3);
  });
});
