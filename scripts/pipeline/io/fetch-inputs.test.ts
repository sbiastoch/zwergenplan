import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchInputs } from "./fetch-inputs.ts";

// fetchInputs hat keine Deps-Injektion: Netz, Browser und pdftotext sind gestubbt (Plan 0042, Tests 2 und 5)
const render = vi.fn();
const pages = new Map<string, { status: number; body: string; finalUrl?: string }>();
vi.mock("./browser.ts", () => ({ browserSession: () => ({ render, close: async () => undefined }) }));
vi.mock("./http.ts", () => ({
  fetchBytes: vi.fn(async () => ({ status: 200, bytes: new Uint8Array([37, 80, 68, 70]) })),
  fetchPage: vi.fn(async (url: string) => {
    const p = pages.get(url);
    if (!p) throw new Error(`unbekannte URL ${url}`);
    return { status: p.status, finalUrl: p.finalUrl ?? url, contentType: "text/html", body: p.body };
  }),
}));
vi.mock("node:child_process", () => ({
  execFile: (_cmd: string, _args: string[], _opts: unknown, cb: (e: null, out: string, err: string) => void) => {
    queueMicrotask(() => cb(null, "Krabbelgruppe dienstags 10 Uhr", ""));
    return { stdin: { on: () => undefined, end: () => undefined } };
  },
}));

const planOf = (page: {
  url: string;
  kind: "html" | "pdf";
  render?: "browser";
  follow?: { match: string; max: number };
}) => ({
  providers: [{ id: "beispiel", via: "seiten" as const, pages: [page] }],
  adapters: [],
  skipped: [],
});

beforeEach(() => {
  render.mockReset();
  pages.clear();
});

describe("fetchInputs: PDF vor Browser (Plan 0042, E6)", () => {
  it("ein PDF mit render: browser geht an pdftotext, artOf meldet pdf", async () => {
    const url = "https://example.org/programm.pdf";
    const r = await fetchInputs(planOf({ url, kind: "pdf", render: "browser" }), [], "2026-10-24");
    expect(render).not.toHaveBeenCalled();
    expect(r.providers["beispiel"]?.pages).toMatchObject([{ url, art: "pdf", ok: true }]);
    expect(r.texts["beispiel"]).toContain("Krabbelgruppe dienstags 10 Uhr");
  });
});

describe("fetchInputs: Folgeseiten mit follow (Plan 0042, E2, Test 2)", () => {
  const URL1 = "https://kurse.example.org/kategorie/1378";
  const next = (n: number) => `${URL1}?knr=${n}&browse=forward`;
  const html = (text: string, nextUrl?: string) =>
    `<html><body><main><p>${text}</p>${nextUrl ? `<a href="${nextUrl}">nächste Seite</a>` : ""}</main></body></html>`;
  const threePages = (second = "Kurs B") => {
    pages.set(URL1, { status: 200, body: html("Kurs A", next(1)) });
    pages.set(next(1), { status: 200, body: html(second, next(2)) });
    pages.set(next(2), { status: 200, body: html("Kurs C") });
  };
  const follow = (max: number) => ({ url: URL1, kind: "html" as const, follow: { match: "browse=forward", max } });

  it("verbindet drei Seiten in Reihenfolge; max zählt die Folgeseiten", async () => {
    threePages();
    const all = await fetchInputs(planOf(follow(5)), [], "2026-10-24");
    const text = all.texts["beispiel"] ?? "";
    expect(text.indexOf("Kurs A")).toBeLessThan(text.indexOf("--- Folgeseite 1 ---"));
    expect(text.indexOf("--- Folgeseite 1 ---")).toBeLessThan(text.indexOf("Kurs B"));
    expect(text.indexOf("Kurs B")).toBeLessThan(text.indexOf("--- Folgeseite 2 ---"));
    expect(text).toContain("Kurs C");
    expect(all.providers["beispiel"]?.pages).toMatchObject([{ url: URL1, ok: true }]);
    const two = await fetchInputs(planOf(follow(2)), [], "2026-10-24");
    expect(two.texts["beispiel"]).toContain("Kurs C");
  });

  it("max erreicht, aber noch ein Folgelink: die Programmseite scheitert mit Grund (Arch-Review S1, m1)", async () => {
    threePages();
    const r = await fetchInputs(planOf(follow(1)), [], "2026-10-24");
    expect(r.providers["beispiel"]?.status).toBe("fehler");
    expect(r.providers["beispiel"]?.pages[0]?.reason).toMatch(/mehr als 1 Folgeseiten.*max/);
  });

  it("leitet eine Folgeseite auf eine fremde Website weiter: Fehler (Arch-Review S1, m2)", async () => {
    threePages();
    pages.set(next(1), { status: 200, body: html("Login"), finalUrl: "https://login.example.net/" });
    const r = await fetchInputs(planOf(follow(5)), [], "2026-10-24");
    expect(r.providers["beispiel"]?.status).toBe("fehler");
    expect(r.providers["beispiel"]?.pages[0]?.reason).toMatch(/fremde Website/);
  });

  it("ein HTTP-Fehler auf Seite 2 lässt die ganze Programmseite fehlschlagen", async () => {
    threePages();
    pages.set(next(1), { status: 500, body: "" });
    const r = await fetchInputs(planOf(follow(5)), [], "2026-10-24");
    expect(r.providers["beispiel"]?.status).toBe("fehler");
    expect(r.providers["beispiel"]?.pages).toMatchObject([{ url: URL1, ok: false, reason: "HTTP 500" }]);
  });

  it("der Eingabe-Hash ändert sich, wenn sich Seite 2 ändert", async () => {
    threePages();
    const a = await fetchInputs(planOf(follow(5)), [], "2026-10-24");
    threePages("Kurs B, neuer Termin");
    const b = await fetchInputs(planOf(follow(5)), [], "2026-10-24");
    expect(a.providers["beispiel"]?.inputHash).toBeDefined();
    expect(a.providers["beispiel"]?.inputHash).not.toBe(b.providers["beispiel"]?.inputHash);
  });

  it("übersteigt der verbundene Text MAX_INPUT_CHARS: „Eingabe zu groß“", async () => {
    threePages("Kurs ".repeat(80_000));
    const r = await fetchInputs(planOf(follow(5)), [], "2026-10-24");
    expect(r.providers["beispiel"]?.status).toBe("fehler");
    expect(r.providers["beispiel"]?.reason).toMatch(/Eingabe zu groß/);
  });
});
