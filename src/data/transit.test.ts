import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTransit, TRANSIT_TIMEOUT_MS, type TransitEnv } from "./transit.ts";

const FILE = { version: 2, id: "0badc0de", places: [], lat: [], lon: [], minutes: "" };
const LINES = { version: 1, table: "0badc0de", lines: [], first: "", second: "" };
const URL = `${import.meta.env.BASE_URL}data/wegzeit.json`;
const LINES_URL = `${import.meta.env.BASE_URL}data/linien.json`;
const LOGIC = { name: "Rechenlogik" };
const logicOk = async () => LOGIC;
const never = <T>() => new Promise<T>(() => {});

/** Antwortet je URL: Tabelle oder Linien */
const okFetch = async (url: string) => new Response(JSON.stringify(url === URL ? FILE : LINES), { status: 200 });

function env(fields: Partial<TransitEnv> = {}): TransitEnv {
  return { fetch: vi.fn(okFetch), timeoutMs: 50, ...fields };
}

/** Ergebnis ohne das Versprechen der Linien (für `toEqual`) */
const core = async <L>(p: Promise<{ logic: L | undefined; file: unknown; chunk: string; lines: Promise<unknown> }>) => {
  const { lines: _lines, ...rest } = await p;
  return rest;
};

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
    const result = await loadTransit(logicOk, false, e);
    expect(await core(Promise.resolve(result))).toEqual({ logic: LOGIC, file: FILE, chunk: "ok" });
    expect(e.fetch).toHaveBeenCalledWith(URL, { signal: expect.any(AbortSignal), cache: "default" });
    expect(await result.lines).toEqual(LINES);
    expect(e.fetch).toHaveBeenCalledTimes(2);
  });

  it("„Nochmal laden“ umgeht den HTTP-Cache: sonst käme dieselbe veraltete Datei (Arch-Review 0009, Befund 2)", async () => {
    const e = env();
    await (await loadTransit(logicOk, true, e)).lines;
    expect(e.fetch).toHaveBeenCalledWith(URL, { signal: expect.any(AbortSignal), cache: "reload" });
    // Plan 0012, E9: beide Dateien ohne Cache
    expect(e.fetch).toHaveBeenCalledWith(LINES_URL, {
      signal: expect.any(AbortSignal),
      cache: "reload",
      priority: "low",
    });
  });

  it("HTTP-Fehler, Netzfehler und kaputtes JSON: keine Tabelle, die Logik bleibt", async () => {
    const failing: TransitEnv["fetch"][] = [
      async () => new Response("weg", { status: 404 }),
      () => Promise.reject(new TypeError("Failed to fetch")),
      async () => new Response("<html>", { status: 200 }),
    ];
    for (const fetch of failing) {
      expect(await core(loadTransit(logicOk, false, env({ fetch })))).toEqual({
        logic: LOGIC,
        file: undefined,
        chunk: "ok",
      });
    }
  });

  it("gescheiterter Import der Rechenlogik: keine Logik, die Tabelle bleibt", async () => {
    const result = await core(loadTransit(() => Promise.reject(new TypeError("dynamic import")), false, env()));
    expect(result).toEqual({ logic: undefined, file: FILE, chunk: "fehler" });
  });

  it("bricht den Abruf nach dem Zeitlimit ab", async () => {
    vi.useFakeTimers();
    const { fetch, seen } = hangingFetch();
    const result = loadTransit(logicOk, false, env({ fetch, timeoutMs: TRANSIT_TIMEOUT_MS }));
    await vi.advanceTimersByTimeAsync(TRANSIT_TIMEOUT_MS);
    expect(await core(result)).toEqual({ logic: LOGIC, file: undefined, chunk: "ok" });
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
    expect(await core(result)).toEqual({ logic: undefined, file: FILE, chunk: "zeitlimit" });
  });

  it("ein gemeinsames Zeitlimit, nicht je Ladeweg: Hängt beides, endet es nach 8 s", async () => {
    vi.useFakeTimers();
    const { fetch } = hangingFetch();
    const result = loadTransit(never, false, env({ fetch, timeoutMs: TRANSIT_TIMEOUT_MS }));
    await vi.advanceTimersByTimeAsync(TRANSIT_TIMEOUT_MS);
    expect(await core(result)).toEqual({ logic: undefined, file: undefined, chunk: "zeitlimit" });
  });

  it("wartet höchstens 8 s (E9)", () => {
    expect(TRANSIT_TIMEOUT_MS).toBe(8000);
  });
});

describe("loadTransit: Linien (Plan 0012, E9, S1)", () => {
  const linesCalls = (e: TransitEnv) => vi.mocked(e.fetch).mock.calls.filter(([url]) => url === LINES_URL);

  it("fordert linien.json erst nach der Antwort der Tabelle und dem Chunk an, mit niedriger Priorität", async () => {
    const order: string[] = [];
    let releaseLogic = () => {};
    const logic = new Promise<typeof LOGIC>((resolve) => {
      releaseLogic = () => {
        order.push("chunk");
        resolve(LOGIC);
      };
    });
    const e = env({
      fetch: vi.fn(async (url: string) => {
        order.push(url === URL ? "tabelle" : "linien");
        return okFetch(url);
      }),
    });
    const pending = loadTransit(() => logic, false, e);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(["tabelle"]);
    releaseLogic();
    const result = await pending;
    expect(await result.lines).toEqual(LINES);
    expect(order).toEqual(["tabelle", "chunk", "linien"]);
    expect(linesCalls(e)).toEqual([
      [LINES_URL, { signal: expect.any(AbortSignal), cache: "default", priority: "low" }],
    ]);
  });

  it("ohne Tabelle oder ohne Logik keine Anfrage", async () => {
    const noTable = env({
      fetch: vi.fn(async (url: string) => (url === URL ? new Response("x", { status: 500 }) : okFetch(url))),
    });
    expect(await (await loadTransit(logicOk, false, noTable)).lines).toBeUndefined();
    expect(linesCalls(noTable)).toEqual([]);
    const noLogic = env();
    expect(await (await loadTransit(() => Promise.reject(new Error("chunk")), false, noLogic)).lines).toBeUndefined();
    expect(linesCalls(noLogic)).toEqual([]);
  });

  it("HTTP 500, Abbruch und kaputtes JSON ergeben undefined, die Tabelle bleibt", async () => {
    const failing: ((url: string) => Promise<Response>)[] = [
      async () => new Response("x", { status: 500 }),
      () => Promise.reject(new DOMException("abgebrochen", "AbortError")),
      async () => new Response("<html>", { status: 200 }),
    ];
    for (const lines of failing) {
      const e = env({ fetch: vi.fn(async (url: string) => (url === URL ? okFetch(url) : lines(url))) });
      const result = await loadTransit(logicOk, false, e);
      expect(result.file).toEqual(FILE);
      expect(await result.lines).toBeUndefined();
    }
  });

  it("löst auf, auch wenn die Linien noch hängen; ihr eigenes Zeitlimit läuft nach dem Ende von loadTransit weiter", async () => {
    vi.useFakeTimers();
    const seen: { signal?: AbortSignal } = {};
    const e = env({
      timeoutMs: TRANSIT_TIMEOUT_MS,
      fetch: vi.fn((url: string, init: { signal: AbortSignal }) => {
        if (url === URL) return okFetch(url);
        seen.signal = init.signal;
        return new Promise<Response>((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(init.signal.reason)),
        );
      }),
    });
    const result = await loadTransit(logicOk, false, e);
    expect(result.file).toEqual(FILE);
    let done = false;
    const lines = result.lines.then((v) => {
      done = true;
      return v;
    });
    await vi.advanceTimersByTimeAsync(TRANSIT_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    expect(seen.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen.signal?.aborted).toBe(true);
    expect(await lines).toBeUndefined();
  });
});
