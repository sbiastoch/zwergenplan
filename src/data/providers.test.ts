import { describe, expect, it, vi } from "vitest";
import type { ProviderDirectoryData } from "../domain/site-data.ts";
import { ensureFresh, type FetchFn, loadProviderDirectory } from "./providers.ts";

const URL = `${import.meta.env.BASE_URL}data/anbieter.json`;

const directory = (generatedAt: string): ProviderDirectoryData => ({
  generatedAt,
  providers: [{ id: "theater-beispiel", name: "Kleines Theater", url: "https://example.org/", venues: [] }],
});

/** fetch-Stub: liefert die Antworten der Reihe nach, die letzte wiederholt */
function fetchReturning(...responses: Array<() => Response>) {
  let call = 0;
  return vi.fn<FetchFn>(async () => {
    const make = responses[Math.min(call, responses.length - 1)];
    call++;
    if (!make) throw new Error("keine Antwort");
    return make();
  });
}

const ok = (data: ProviderDirectoryData) => () => new Response(JSON.stringify(data), { status: 200 });
const status = (code: number) => () => new Response("weg", { status: code });

describe("loadProviderDirectory (Plan 0010, E6)", () => {
  it("lädt data/anbieter.json vom eigenen Origin, ohne Kenntnis von site.json", async () => {
    const fetch = fetchReturning(ok(directory("A")));
    expect(loadProviderDirectory.length).toBe(0);
    expect(await loadProviderDirectory(fetch)).toEqual(directory("A"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(URL, undefined);
  });

  it("wirft bei HTTP-Fehler, der nächste Aufruf fragt neu an", async () => {
    const fetch = fetchReturning(status(503), ok(directory("A")));
    await expect(loadProviderDirectory(fetch)).rejects.toThrow("HTTP 503");
    expect(await loadProviderDirectory(fetch)).toEqual(directory("A"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("ensureFresh (Plan 0010, E6, M4)", () => {
  it("gleicher Datenstand: dieselben Daten, kein Request", async () => {
    const fetch = fetchReturning(ok(directory("neu")));
    const data = directory("gleich");
    expect(await ensureFresh(data, "gleich", fetch)).toBe(data);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("abweichender Datenstand: genau ein Request am HTTP-Cache vorbei, auch für Liste und Sheet zusammen", async () => {
    const fetch = fetchReturning(ok(directory("stand-1")));
    const stale = directory("alt");
    const [list, sheet] = await Promise.all([
      ensureFresh(stale, "stand-1", fetch),
      ensureFresh(stale, "stand-1", fetch),
    ]);
    expect(list).toEqual(directory("stand-1"));
    expect(sheet).toBe(list);
    expect(await ensureFresh(stale, "stand-1", fetch)).toBe(list);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(URL, { cache: "reload" });
  });

  it("weicht der Stand nach dem Reload weiter ab, gilt die neue Datei trotzdem, ohne weiteren Request", async () => {
    const fetch = fetchReturning(ok(directory("immer-noch-alt")));
    const reloaded = await ensureFresh(directory("alt"), "stand-2", fetch);
    expect(reloaded.generatedAt).toBe("immer-noch-alt");
    expect(await ensureFresh(reloaded, "stand-2", fetch)).toBe(reloaded);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("scheitert der Reload, bleibt die geladene Datei, ohne weiteren Request", async () => {
    const fetch = fetchReturning(status(503));
    const stale = directory("alt");
    expect(await ensureFresh(stale, "stand-3", fetch)).toBe(stale);
    expect(await ensureFresh(stale, "stand-3", fetch)).toBe(stale);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
