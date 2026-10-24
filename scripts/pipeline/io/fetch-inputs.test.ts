import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchInputs } from "./fetch-inputs.ts";

// fetchInputs hat keine Deps-Injektion: Netz, Browser und pdftotext sind gestubbt (Plan 0042, Test 5)
const render = vi.fn();
vi.mock("./browser.ts", () => ({ browserSession: () => ({ render, close: async () => undefined }) }));
vi.mock("./http.ts", () => ({
  fetchBytes: vi.fn(async () => ({ status: 200, bytes: new Uint8Array([37, 80, 68, 70]) })),
  fetchPage: vi.fn(),
}));
vi.mock("node:child_process", () => ({
  execFile: (_cmd: string, _args: string[], _opts: unknown, cb: (e: null, out: string, err: string) => void) => {
    queueMicrotask(() => cb(null, "Krabbelgruppe dienstags 10 Uhr", ""));
    return { stdin: { on: () => undefined, end: () => undefined } };
  },
}));

describe("fetchInputs: PDF vor Browser (Plan 0042, E6)", () => {
  beforeEach(() => render.mockReset());

  it("ein PDF mit render: browser geht an pdftotext, artOf meldet pdf", async () => {
    const url = "https://example.org/programm.pdf";
    const plan = {
      providers: [
        { id: "beispiel", via: "seiten" as const, pages: [{ url, kind: "pdf" as const, render: "browser" as const }] },
      ],
      adapters: [],
      skipped: [],
    };
    const r = await fetchInputs(plan, [], "2026-10-24");
    expect(render).not.toHaveBeenCalled();
    expect(r.providers["beispiel"]?.pages).toMatchObject([{ url, art: "pdf", ok: true }]);
    expect(r.texts["beispiel"]).toContain("Krabbelgruppe dienstags 10 Uhr");
  });
});
