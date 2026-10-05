import { describe, expect, it, vi } from "vitest";
import { loadTransitTable, TRANSIT_TIMEOUT_MS, type TransitEnv } from "./transit.ts";

const FILE = { version: 1, places: [], lat: [], lon: [], minutes: "" };
const URL = `${import.meta.env.BASE_URL}data/wegzeit.json`;

function env(fields: Partial<TransitEnv> = {}): TransitEnv {
  return { fetch: vi.fn(async () => new Response(JSON.stringify(FILE), { status: 200 })), timeoutMs: 50, ...fields };
}

describe("loadTransitTable (Plan 0009, E9)", () => {
  it("lädt data/wegzeit.json vom eigenen Origin, für alle gleich", async () => {
    const e = env();
    expect(await loadTransitTable(e)).toEqual(FILE);
    expect(e.fetch).toHaveBeenCalledTimes(1);
    expect(e.fetch).toHaveBeenCalledWith(URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("wirft bei einem HTTP-Fehler", async () => {
    const e = env({ fetch: async () => new Response("weg", { status: 404 }) });
    await expect(loadTransitTable(e)).rejects.toThrow("HTTP 404");
  });

  it("wirft, wenn das Netz scheitert oder die Antwort kein JSON ist", async () => {
    await expect(
      loadTransitTable(env({ fetch: () => Promise.reject(new TypeError("Failed to fetch")) })),
    ).rejects.toThrow("Failed to fetch");
    await expect(
      loadTransitTable(env({ fetch: async () => new Response("<html>", { status: 200 }) })),
    ).rejects.toThrow();
  });

  it("bricht nach dem Zeitlimit ab", async () => {
    let signal: AbortSignal | undefined;
    const hanging: TransitEnv["fetch"] = (_url, init) => {
      signal = init.signal;
      return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
    };
    await expect(loadTransitTable(env({ fetch: hanging, timeoutMs: 10 }))).rejects.toThrow("Zeitlimit");
    expect(signal?.aborted).toBe(true);
  });

  it("wartet höchstens 8 s (E9)", () => {
    expect(TRANSIT_TIMEOUT_MS).toBe(8000);
  });
});
