import { afterEach, describe, expect, it, vi } from "vitest";
import { lastSiteLoad, loadSiteData, onSiteLoad, type SiteEnv, SiteLoadError } from "./site.ts";

const DATA = { generatedAt: "2026-10-05T06:00:00+02:00", offers: [] };

const URL = `${import.meta.env.BASE_URL}data/site.json`;

const ok = () => new Response(JSON.stringify(DATA), { status: 200 });
const failed = () => Promise.reject(new TypeError("Failed to fetch"));

/** Umgebung ohne Browser: frühe Anfrage, fetch und Online-Status als Stubs */
function env(fields: Partial<SiteEnv> = {}) {
  return { fetch: vi.fn(async (_url: string) => ok()), online: () => true, now: () => 1000, ...fields };
}

/** Fängt den Fehler von `loadSiteData`; schlägt fehl, wenn sie nicht oder etwas anderes wirft. */
async function failure(promise: Promise<unknown>): Promise<SiteLoadError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(error instanceof SiteLoadError)) throw new Error(`kein SiteLoadError: ${String(error)}`);
  return error;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("frühe Anfrage aus index.html (Plan 0008, E4)", () => {
  it("übernimmt sie beim ersten Aufruf, ohne fetch zu rufen", async () => {
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal("__zpSite", Promise.resolve(ok()));
    vi.stubGlobal("fetch", fetch);
    expect(await loadSiteData()).toEqual(DATA);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("übernimmt sie nur einmal: der zweite Aufruf lädt neu („Nochmal versuchen“)", async () => {
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal("__zpSite", Promise.resolve(ok()));
    vi.stubGlobal("fetch", fetch);
    await loadSiteData();
    expect(await loadSiteData()).toEqual(DATA);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.__zpSite).toBeUndefined();
  });

  it("lädt ohne frühe Anfrage selbst, vom Pfad der Seite", async () => {
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal("__zpSite", undefined);
    vi.stubGlobal("fetch", fetch);
    expect(await loadSiteData()).toEqual(DATA);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(URL);
  });

  it("dieselben Fälle über die injizierte Umgebung", async () => {
    const early = env({ early: Promise.resolve(ok()) });
    expect(await loadSiteData(early)).toEqual(DATA);
    expect(early.fetch).not.toHaveBeenCalled();

    const late = env();
    expect(await loadSiteData(late)).toEqual(DATA);
    expect(late.fetch).toHaveBeenCalledExactlyOnceWith(URL);
  });
});

describe("Fehlerarten (Plan 0008, E5)", () => {
  it("offline: der Abruf scheitert, und das Gerät ist offline", async () => {
    const error = await failure(loadSiteData(env({ fetch: vi.fn(failed), online: () => false })));
    expect(error.reason).toBe("offline");
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it("netz: der Abruf scheitert trotz Netz (Failed to fetch, Load failed, Abbruch)", async () => {
    const error = await failure(loadSiteData(env({ fetch: vi.fn(failed) })));
    expect(error.reason).toBe("netz");
    expect(error.cause).toEqual(new TypeError("Failed to fetch"));
  });

  it("netz: auch wenn die frühe Anfrage scheitert", async () => {
    const early = failed();
    const error = await failure(loadSiteData(env({ early })));
    expect(error.reason).toBe("netz");
  });

  it("netz: auch wenn fetch synchron wirft", async () => {
    const throwing = vi.fn(() => {
      throw new TypeError("Load failed");
    });
    expect((await failure(loadSiteData(env({ fetch: throwing })))).reason).toBe("netz");
  });

  it("server: HTTP ≠ 2xx", async () => {
    const error = await failure(loadSiteData(env({ fetch: vi.fn(async () => new Response("", { status: 503 })) })));
    expect(error.reason).toBe("server");
    expect(String(error.cause)).toContain("503");
  });

  it("server: Antwort ist kein JSON", async () => {
    const error = await failure(
      loadSiteData(env({ fetch: vi.fn(async () => new Response("<html>", { status: 200 })) })),
    );
    expect(error.reason).toBe("server");
    expect(error.cause).toBeInstanceOf(SyntaxError);
  });

  it("die Meldung trägt nie den Rohtext des Browsers", async () => {
    const error = await failure(loadSiteData(env({ fetch: vi.fn(failed) })));
    expect(error.message).not.toMatch(/fetch|load/i);
    expect(error.name).toBe("SiteLoadError");
  });
});

describe("Offline-Stand aus dem Service Worker (Plan 0011, E4)", () => {
  const cached = () => new Response(JSON.stringify(DATA), { status: 200, headers: { "X-Zp-Cache": "offline" } });

  const STAND = DATA.generatedAt;

  it("Antwort mit X-Zp-Cache: offline → stale, die Daten bleiben dieselben", async () => {
    expect(await loadSiteData(env({ fetch: vi.fn(async () => cached()) }))).toEqual(DATA);
    expect(lastSiteLoad()).toEqual({ at: 1000, stale: true, generatedAt: STAND });
  });

  it("auch über die frühe Anfrage aus index.html", async () => {
    await loadSiteData(env({ early: Promise.resolve(cached()) }));
    expect(lastSiteLoad()?.stale).toBe(true);
  });

  it("anderer Wert des Headers: nicht stale", async () => {
    const other = new Response(JSON.stringify(DATA), { headers: { "X-Zp-Cache": "anders" } });
    await loadSiteData(env({ fetch: vi.fn(async () => other) }));
    expect(lastSiteLoad()?.stale).toBe(false);
  });
});

describe("letzter erfolgreicher Abruf (Plan 0011, E4a)", () => {
  it("merkt Zeitpunkt und Art, ein Fehlschlag ändert nichts", async () => {
    await loadSiteData(env({ now: () => 5000 }));
    expect(lastSiteLoad()).toEqual({ at: 5000, stale: false, generatedAt: DATA.generatedAt });
    await failure(loadSiteData(env({ fetch: vi.fn(failed), now: () => 9000 })));
    expect(lastSiteLoad()?.at).toBe(5000);
    const cached = new Response(JSON.stringify(DATA), { headers: { "X-Zp-Cache": "offline" } });
    await loadSiteData(env({ fetch: vi.fn(async () => cached), now: () => 7000 }));
    expect(lastSiteLoad()).toEqual({ at: 7000, stale: true, generatedAt: DATA.generatedAt });
  });
});

describe("Rückruf nach jedem Laden (Plan 0011, Browser-Review live B1)", () => {
  it("meldet jeden erfolgreichen Abruf, nach dem Setzen von lastSiteLoad; ein Fehlschlag meldet nichts", async () => {
    const seen: Array<boolean | undefined> = [];
    onSiteLoad(() => seen.push(lastSiteLoad()?.stale));
    const cached = new Response(JSON.stringify(DATA), { headers: { "X-Zp-Cache": "offline" } });
    await loadSiteData(env({ fetch: vi.fn(async () => cached) }));
    await failure(loadSiteData(env({ fetch: vi.fn(failed) })));
    await loadSiteData(env());
    expect(seen).toEqual([true, false]);
  });
});
