import { describe, expect, it } from "vitest";
import { fetchPage } from "./http.ts";

/** Fake-Server: Antwort je URL; protokolliert URL, Methode, Body und `redirect` jedes Aufrufs */
function fakeFetch(routes: Record<string, () => Response>) {
  const log: Array<{
    url: string;
    method: string;
    body: string | undefined;
    redirect: string | undefined;
    headers: Record<string, string>;
  }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    log.push({
      headers: Object.fromEntries(new Headers(init?.headers)),
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
      redirect: init?.redirect,
    });
    const route = routes[url];
    if (!route) throw new Error(`unerwarteter Abruf ${url}`);
    return route();
    // Cast nötig: das Fake deckt nur die von io/http.ts genutzte Signatur ab, nicht `fetch.preconnect`
  }) as typeof fetch;
  return { impl, log };
}

const redirect = (status: number, location: string) => () => new Response(null, { status, headers: { location } });
const ok = (text: string) => () => new Response(text, { status: 200, headers: { "content-type": "text/html" } });

describe("fetchPage: Weiterleitungen je Sprung", () => {
  it("folgt Sprüngen selbst (redirect: manual), finalUrl ist das letzte Ziel", async () => {
    const f = fakeFetch({
      "https://a.example.net/": redirect(301, "/neu"),
      "https://a.example.net/neu": redirect(302, "https://b.example.net/ziel"),
      "https://b.example.net/ziel": ok("Hallo"),
    });
    const page = await fetchPage("https://a.example.net/", { fetchImpl: f.impl });
    expect(page).toMatchObject({ status: 200, finalUrl: "https://b.example.net/ziel", body: "Hallo" });
    expect(f.log.map((l) => l.redirect)).toEqual(["manual", "manual", "manual"]);
  });

  it("Weiterleitung auf eine interne Adresse: Fehler ohne Wiederholung und ohne Abruf des Ziels", async () => {
    const f = fakeFetch({ "https://a.example.net/": redirect(302, "http://169.254.169.254/latest/meta-data") });
    await expect(fetchPage("https://a.example.net/", { fetchImpl: f.impl })).rejects.toThrow(/interne Adresse/);
    expect(f.log).toHaveLength(1);
  });

  it("interne Adresse schon als erstes Ziel: kein Abruf", async () => {
    const f = fakeFetch({});
    await expect(fetchPage("http://localhost:3000/", { fetchImpl: f.impl })).rejects.toThrow(/interne Adresse/);
    expect(f.log).toEqual([]);
  });

  it("mehr als 5 Sprünge: Fehler", async () => {
    const routes: Record<string, () => Response> = {};
    for (let i = 0; i < 7; i++) routes[`https://a.example.net/${i}`] = redirect(302, `/${i + 1}`);
    const f = fakeFetch(routes);
    await expect(fetchPage("https://a.example.net/0", { fetchImpl: f.impl })).rejects.toThrow(/mehr als 5/);
    expect(f.log).toHaveLength(6);
  });

  it("POST: 307 behält Methode und Body, 303 macht ein GET daraus", async () => {
    const f = fakeFetch({
      "https://a.example.net/api": redirect(307, "/api2"),
      "https://a.example.net/api2": redirect(303, "/ergebnis"),
      "https://a.example.net/ergebnis": ok("{}"),
    });
    await fetchPage("https://a.example.net/api", { fetchImpl: f.impl, post: '{"a":1}' });
    expect(f.log.map((l) => [l.method, l.body])).toEqual([
      ["POST", '{"a":1}'],
      ["POST", '{"a":1}'],
      ["GET", undefined],
    ]);
  });

  it("finalUrl normalisiert wie früher res.url (Schrägstrich, ohne Fragment)", async () => {
    const f = fakeFetch({ "https://a.example.net/": ok("x") });
    const page = await fetchPage("https://A.example.net#oben", { fetchImpl: f.impl });
    expect(page.finalUrl).toBe("https://a.example.net/");
  });

  it("302 bei POST: GET ohne Body und ohne Body-Header; anderer Origin ohne Authorization", async () => {
    const f = fakeFetch({
      "https://a.example.net/api": redirect(302, "https://b.example.net/x"),
      "https://b.example.net/x": ok("{}"),
    });
    await fetchPage("https://a.example.net/api", {
      fetchImpl: f.impl,
      post: "{}",
      headers: { "Content-Type": "application/json", Authorization: "Bearer x" },
    });
    expect(f.log[1]).toMatchObject({ method: "GET", body: undefined });
    expect(f.log[1]?.headers["content-type"]).toBeUndefined();
    expect(f.log[1]?.headers["authorization"]).toBeUndefined();
    expect(f.log[0]?.headers["authorization"]).toBe("Bearer x");
  });

  it("3xx ohne Location gilt als Antwort", async () => {
    const f = fakeFetch({ "https://a.example.net/": () => new Response(null, { status: 302 }) });
    expect((await fetchPage("https://a.example.net/", { fetchImpl: f.impl })).status).toBe(302);
  });

  it("Netzfehler in einem späteren Sprung wird wiederholt, ab der Startadresse", async () => {
    let n = 0;
    const f = fakeFetch({
      "https://a.example.net/": redirect(302, "/b"),
      "https://a.example.net/b": () => {
        if (n++ === 0) throw new TypeError("fetch failed");
        return ok("da")();
      },
    });
    const page = await fetchPage("https://a.example.net/", { fetchImpl: f.impl, retries: 1 });
    expect(page.body).toBe("da");
    expect(f.log.map((l) => l.url)).toEqual([
      "https://a.example.net/",
      "https://a.example.net/b",
      "https://a.example.net/",
      "https://a.example.net/b",
    ]);
    // eigenes Zeitlimit: die Wiederholung wartet 2 s (io/http.ts), unter Last reißt sonst die Standardgrenze
  }, 10_000);

  it("ohne Weiterleitung wie bisher; 5xx wird wiederholt", async () => {
    let n = 0;
    const f = fakeFetch({
      "https://a.example.net/": () => (n++ === 0 ? new Response("weg", { status: 503 }) : ok("da")()),
    });
    const page = await fetchPage("https://a.example.net/", { fetchImpl: f.impl, retries: 1 });
    expect(page).toMatchObject({ status: 200, finalUrl: "https://a.example.net/", body: "da" });
    // eigenes Zeitlimit: die Wiederholung nach 5xx wartet 2 s (io/http.ts), unter Last reißt sonst die Standardgrenze
  }, 10_000);
});
