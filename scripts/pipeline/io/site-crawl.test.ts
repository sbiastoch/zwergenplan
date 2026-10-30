import { afterEach, describe, expect, it } from "vitest";
import type { Provider } from "../../../src/domain/schema.ts";
import { crawlScope, exploreSite } from "../lib/site-crawl.ts";
import { setAbruf } from "./http.ts";
import { type Clock, crawlFetcher, HOST_GAP_MS, hostQueue } from "./site-crawl.ts";

/** Fake-Uhr: `sleep` springt sofort vor, protokolliert die Zeitpunkte */
function fakeClock(): Clock & { t: number } {
  const c = {
    t: 0,
    now: () => c.t,
    sleep: async (ms: number) => {
      c.t += ms;
    },
  };
  return c;
}

const provider = (id: string, url: string): Provider =>
  // Cast: Testfixtur mit den Feldern, die der Seitenfinder liest
  ({
    id,
    role: "anbieter",
    url,
    name: id,
    programme: [],
    venues: [],
  }) as unknown as Provider;

function fakeFetch(routes: Record<string, () => Response>) {
  const log: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    log.push(url);
    const r = routes[url];
    return r ? r() : new Response("fehlt", { status: 404 });
    // Cast: das Fake deckt nur die genutzte Signatur ab
  }) as typeof fetch;
  return { impl, log };
}
const html = (body: string) => () =>
  new Response(`<html><body>${body}</body></html>`, { status: 200, headers: { "content-type": "text/html" } });

afterEach(() => setAbruf("alt"));

describe("hostQueue (Plan 0049, Ziel 4)", () => {
  it("höchstens ein Abruf je Sekunde und Host, über zwei Anbieter hinweg; andere Hosts warten nicht", async () => {
    const clock = fakeClock();
    const q = hostQueue(clock);
    const at: Array<[string, number]> = [];
    const job = (url: string) => q(url, async () => void at.push([url, clock.t]));
    await Promise.all([job("https://a.de/1"), job("https://a.de/2"), job("https://www.a.de/3"), job("https://b.de/1")]);
    const aTimes = at.filter(([u]) => u.includes("a.de")).map(([, t]) => t);
    expect(aTimes).toEqual([0, HOST_GAP_MS, 2 * HOST_GAP_MS]);
    expect(at.find(([u]) => u.startsWith("https://b.de"))?.[1]).toBe(0);
  });
});

describe("crawlFetcher", () => {
  const browser = (calls: string[]) => ({
    render: async (url: string) => {
      calls.push(url);
      return {
        status: 200,
        finalUrl: url,
        contentType: "text/html",
        body: "<html><body>Kurse im Browser</body></html>",
      };
    },
  });

  it("robots.txt sperrt: gesperrt, die Seite wird nicht abgerufen", async () => {
    setAbruf("neu");
    const f = fakeFetch({
      "https://s.de/robots.txt": () => new Response("User-agent: *\nDisallow: /intern/\n", { status: 200 }),
      "https://s.de/": html('<a href="/intern/kurse">Kurse</a>'),
    });
    const p = provider("s", "https://s.de/");
    const scope = crawlScope(p, [p]);
    const r = await exploreSite(
      scope,
      crawlFetcher(scope, { queue: hostQueue(fakeClock()), browser: browser([]), fetchImpl: f.impl }),
    );
    expect(r.gesperrt).toEqual(["https://s.de/intern/kurse"]);
    expect(f.log).not.toContain("https://s.de/intern/kurse");
  });

  it("ohne robots.txt (setAbruf alt): Fehler", () => {
    const p = provider("s", "https://s.de/");
    expect(() => crawlFetcher(crawlScope(p, [p]), { queue: hostQueue(fakeClock()), browser: browser([]) })).toThrow(
      /robots/,
    );
  });

  it("PDF über pdftotext, Bot-Schutz auf der eigenen Website ohne Browser, Browser nur mit Restbudget", async () => {
    setAbruf("neu");
    const f = fakeFetch({
      "https://s.de/robots.txt": () => new Response("", { status: 404 }),
      "https://s.de/p.pdf": () => new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } }),
      "https://s.de/wall": html("Just a moment..."),
      "https://www.eversports.de/robots.txt": () => new Response("", { status: 404 }),
      "https://www.eversports.de/w": () =>
        new Response("nein", { status: 403, headers: { "content-type": "text/html" } }),
    });
    const p = provider("s", "https://s.de/");
    const calls: string[] = [];
    const fetchOne = crawlFetcher(crawlScope(p, [p]), {
      queue: hostQueue(fakeClock()),
      browser: browser(calls),
      fetchImpl: f.impl,
      pdfText: async () => "Babykurs am 04.11.",
    });
    expect(await fetchOne("https://s.de/p.pdf")).toMatchObject({
      ok: true,
      cost: 1,
      page: { text: "Babykurs am 04.11." },
    });
    expect(await fetchOne("https://s.de/wall")).toMatchObject({ ok: false, reason: "Bot-Schutz", cost: 1 });
    expect(await fetchOne("https://www.eversports.de/w", 1)).toMatchObject({
      ok: false,
      reason: "Budget: Browser ausgelassen",
      cost: 1,
    });
    expect(calls).toEqual([]);
  });

  it("403 auf einem Plattform-Widget: einmal Browser, zählt zu den Abrufen; Weiterleitung zählt mit", async () => {
    setAbruf("neu");
    const calls: string[] = [];
    const f = fakeFetch({
      "https://s.de/": html('<iframe src="https://www.eversports.de/w/s"></iframe><a href="/alt">Kurse</a>'),
      "https://www.eversports.de/w/s": () =>
        new Response("nein", { status: 403, headers: { "content-type": "text/html" } }),
      "https://s.de/alt": () => new Response(null, { status: 301, headers: { location: "https://s.de/neu" } }),
      "https://s.de/neu": html("Kurse"),
    });
    const p = provider("s", "https://s.de/");
    const scope = crawlScope(p, [p]);
    const r = await exploreSite(
      scope,
      crawlFetcher(scope, { queue: hostQueue(fakeClock()), browser: browser(calls), fetchImpl: f.impl }),
    );
    expect(calls).toEqual(["https://www.eversports.de/w/s"]);
    // Startseite 1, Widget 1 + Browser 1, Weiterleitung 1 + 1
    expect(r.fetches).toBe(5);
    expect(r.pages.find((x) => x.url === "https://www.eversports.de/w/s")?.result).toMatchObject({
      ok: true,
      browser: true,
    });
  });
});
