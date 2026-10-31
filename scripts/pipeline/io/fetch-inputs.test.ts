import { describe, expect, it } from "vitest";
import type { Anbieter } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import type { PageOutcome } from "../lib/fetch.ts";
import { proofInput, unitInputs } from "./fetch-inputs.ts";

const base = loadFixtures().providers.find((p) => p.id === "familientreff-beispiel");
if (base?.role !== "anbieter") throw new Error("Fixture fehlt");
const A = "https://example.org/a";
const B = "https://example.org/b";
const PLAETZE = "https://example.org/plaetze";
const INFO = "https://example.org/info";
const owner: Anbieter = {
  ...base,
  programme: [
    { url: A, kind: "html", use: "termine" },
    { url: INFO, kind: "html", use: "info" },
    { url: PLAETZE, kind: "html", use: "verfuegbarkeit", render: "browser" },
    { url: B, kind: "html", use: "termine" },
  ],
};
const ok = (url: string): PageOutcome => ({ url, art: "html", ok: true, text: `Text ${url}`, ms: 1 });
const down = (url: string, klasse: "dauerhaft" | "voruebergehend"): PageOutcome => ({
  url,
  art: "html",
  ok: false,
  reason: klasse === "dauerhaft" ? "HTTP 404" : "Bot-Schutz (Cloudflare)",
  ms: 1,
  klasse,
});

describe("unitInputs (Plan 0048, E1, E2)", () => {
  it("je Terminseite eine Einheit mit der Beilage dahinter, kandidaten zuletzt", () => {
    const r = unitInputs(owner, [ok(A), ok(PLAETZE), ok(B)], []);
    expect(r.units.map((u) => [u.id, u.status, u.pages.map((p) => p.url)])).toEqual([
      [`seite:${A}`, "ok", [A, PLAETZE]],
      [`seite:${B}`, "ok", [B, PLAETZE]],
      ["kandidaten", "leer", []],
    ]);
    expect(r.units[0]?.text).toMatch(new RegExp(`^## Seite 1: ${A} \\(html\\)\\nText ${A}\\n## Seite 2: ${PLAETZE}`));
    expect(r.beilagen).toEqual({ [`seite:${PLAETZE}`]: { ok: true } });
  });

  it("gescheiterte Beilage: jede Einheit ohne sie, der Fehler steht nur in beilagen", () => {
    const r = unitInputs(owner, [ok(A), down(PLAETZE, "voruebergehend"), ok(B)], []);
    expect(r.units.slice(0, 2).map((u) => [u.status, u.pages.map((p) => p.url)])).toEqual([
      ["ok", [A]],
      ["ok", [B]],
    ]);
    expect(r.beilagen).toEqual({
      [`seite:${PLAETZE}`]: { ok: false, reason: "Bot-Schutz (Cloudflare)", klasse: "voruebergehend" },
    });
  });

  it("eigene Seite gescheitert: nur diese Einheit fehler, mit Fehlerklasse", () => {
    const r = unitInputs(owner, [ok(A), ok(PLAETZE), down(B, "dauerhaft")], []);
    expect(r.units[0]).toMatchObject({ status: "ok" });
    expect(r.units[1]).toMatchObject({ id: `seite:${B}`, status: "fehler", klasse: "dauerhaft" });
    expect(r.units[1]?.reason).toContain("HTTP 404");
  });

  it("coveredBy oder skipCrawl: keine Abrufe trotz Terminseite, nur kandidaten (Arch-Review 2, B1)", () => {
    for (const over of [
      { coveredBy: "et-dekanat-nuernberg" },
      { skipCrawl: { reason: "nur Sammelkalender", since: "2026-10-01" } },
    ]) {
      const r = unitInputs({ ...owner, ...over }, [], []);
      expect(r.units.map((u) => u.id)).toEqual(["kandidaten"]);
      expect(r.beilagen).toEqual({});
    }
  });

  it("passt die Zahl der Abrufe nicht zu den Seiten im Katalog, scheitert es laut", () => {
    expect(() => unitInputs(owner, [ok(A), ok(B)], [])).toThrow(/2 Abrufe für 3 Seiten/);
  });
});

describe("proofInput (Plan 0049, E2, M1)", () => {
  const C = "https://example.org/neu";
  const entry: Anbieter = { ...owner, programme: [...owner.programme, { url: C, kind: "html", use: "termine" }] };
  const idx = (url: string) => entry.programme.findIndex((g) => g.url === url);

  it("nur die Einheit des Kandidaten mit ihren Beilagen; andere Seiten gelten als nicht abgerufen", () => {
    const r = proofInput(
      entry,
      `seite:${C}`,
      new Map([
        [idx(PLAETZE), ok(PLAETZE)],
        [idx(C), ok(C)],
      ]),
    );
    expect(r.units.map((u) => u.id)).toEqual([`seite:${C}`]);
    expect(r.units[0]?.pages.map((p) => p.url)).toEqual([C, PLAETZE]);
    expect(r).toMatchObject({ status: "ok", via: "seiten", beilagen: { [`seite:${PLAETZE}`]: { ok: true } } });
    expect(r.text).not.toContain(`Text ${A}`);
  });

  it("unbekannte Einheit: Fehler", () => {
    expect(() => proofInput(entry, "seite:https://example.org/fremd", new Map())).toThrow(/fehlt/);
  });
});
