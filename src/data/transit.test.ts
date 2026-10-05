import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTransit, TRANSIT_TIMEOUT_MS, type TransitEnv } from "./transit.ts";

const FILE = { version: 1, places: [], lat: [], lon: [], minutes: "" };
const URL = `${import.meta.env.BASE_URL}data/wegzeit.json`;
const LOGIC = { name: "Rechenlogik" };
const logicOk = async () => LOGIC;
const never = <T>() => new Promise<T>(() => {});

function env(fields: Partial<TransitEnv> = {}): TransitEnv {
  return { fetch: vi.fn(async () => new Response(JSON.stringify(FILE), { status: 200 })), timeoutMs: 50, ...fields };
}

/** fetch, der erst auf den Abbruch reagiert, und das Signal, das er bekam */
function hangingFetch() {
  const seen: { signal?: AbortSignal } = {};
  const fetch: TransitEnv["fetch"] = (_url, init) => {
    seen.signal = init.signal;
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  };
  return { fetch, seen };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("loadTransit: Tabelle und Rechenlogik (Plan 0009, E9)", () => {
  it("lädt data/wegzeit.json vom eigenen Origin, für alle gleich, und die Rechenlogik parallel", async () => {
    const e = env();
    expect(await loadTransit(logicOk, false, e)).toEqual({ logic: LOGIC, file: FILE, chunk: "ok" });
    expect(e.fetch).toHaveBeenCalledTimes(1);
    expect(e.fetch).toHaveBeenCalledWith(URL, { signal: expect.any(AbortSignal), cache: "default" });
  });

  it("„Nochmal laden“ umgeht den HTTP-Cache: sonst käme dieselbe veraltete Datei (Arch-Review 0009, Befund 2)", async () => {
    const e = env();
    await loadTransit(logicOk, true, e);
    expect(e.fetch).toHaveBeenCalledWith(URL, { signal: expect.any(AbortSignal), cache: "reload" });
  });

  it("HTTP-Fehler, Netzfehler und kaputtes JSON: keine Tabelle, die Logik bleibt", async () => {
    const failing: TransitEnv["fetch"][] = [
      async () => new Response("weg", { status: 404 }),
      () => Promise.reject(new TypeError("Failed to fetch")),
      async () => new Response("<html>", { status: 200 }),
    ];
    for (const fetch of failing) {
      expect(await loadTransit(logicOk, false, env({ fetch }))).toEqual({ logic: LOGIC, file: undefined, chunk: "ok" });
    }
  });

  it("gescheiterter Import der Rechenlogik: keine Logik, die Tabelle bleibt", async () => {
    const result = await loadTransit(() => Promise.reject(new TypeError("dynamic import")), false, env());
    expect(result).toEqual({ logic: undefined, file: FILE, chunk: "fehler" });
  });

  it("bricht den Abruf nach dem Zeitlimit ab", async () => {
    vi.useFakeTimers();
    const { fetch, seen } = hangingFetch();
    const result = loadTransit(logicOk, false, env({ fetch, timeoutMs: TRANSIT_TIMEOUT_MS }));
    await vi.advanceTimersByTimeAsync(TRANSIT_TIMEOUT_MS);
    expect(await result).toEqual({ logic: LOGIC, file: undefined, chunk: "ok" });
    expect(seen.signal?.aborted).toBe(true);
  });

  it("dasselbe Zeitlimit gilt für den Chunk: Hängt der Import, ist nach 8 s Schluss (Arch-Review 0009, Befund 3)", async () => {
    vi.useFakeTimers();
    let settled = false;
    const result = loadTransit(never, false, env({ timeoutMs: TRANSIT_TIMEOUT_MS })).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(TRANSIT_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    // Ein Zeitlimit ist kein Fehlschlag: Der Import läuft weiter, ein neuer Versuch kann ihn noch bekommen (N1)
    expect(await result).toEqual({ logic: undefined, file: FILE, chunk: "zeitlimit" });
  });

  it("ein gemeinsames Zeitlimit, nicht je Ladeweg: Hängt beides, endet es nach 8 s", async () => {
    vi.useFakeTimers();
    const { fetch } = hangingFetch();
    const result = loadTransit(never, false, env({ fetch, timeoutMs: TRANSIT_TIMEOUT_MS }));
    await vi.advanceTimersByTimeAsync(TRANSIT_TIMEOUT_MS);
    expect(await result).toEqual({ logic: undefined, file: undefined, chunk: "zeitlimit" });
  });

  it("wartet höchstens 8 s (E9)", () => {
    expect(TRANSIT_TIMEOUT_MS).toBe(8000);
  });
});
