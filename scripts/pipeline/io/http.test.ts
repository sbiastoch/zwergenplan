import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BOT_UA,
  fetchJson,
  fetchPage,
  ROBOTS_EXEMPT_HOSTS,
  RobotsError,
  resolvePageUrl,
  setAbruf,
  UA,
} from "./http.ts";

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

// Mechanik von Weiterleitung und Zeichensatz ohne robots.txt; die Tests zu `neu` schalten selbst um (Plan 0048, N1)
beforeEach(() => setAbruf("alt"));

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

describe("fetchPage: Zeichensatz", () => {
  const bytes = (body: Uint8Array<ArrayBuffer>, contentType: string) => () =>
    new Response(body, { status: 200, headers: { "content-type": contentType } });
  const latin1 = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

  it("UTF-8 mit falscher Angabe ISO-8859-1 (Kalender-API nuernberg.de): Umlaute bleiben heil", async () => {
    const body = new TextEncoder().encode('{"T":"Erzählt für Kinder"}');
    const f = fakeFetch({ "https://a.example.net/": bytes(body, "application/json; charset=ISO-8859-1") });
    const page = await fetchPage("https://a.example.net/", { fetchImpl: f.impl });
    expect(page.body).toBe('{"T":"Erzählt für Kinder"}');
  });

  it("echtes ISO-8859-1 bleibt ISO-8859-1", async () => {
    const f = fakeFetch({
      "https://a.example.net/": bytes(latin1("Erzählt für Kinder"), "text/html; charset=ISO-8859-1"),
    });
    const page = await fetchPage("https://a.example.net/", { fetchImpl: f.impl });
    expect(page.body).toBe("Erzählt für Kinder");
  });
});

describe("Abruf neu: User-Agent und robots.txt (Plan 0048, E8)", () => {
  afterEach(() => setAbruf("alt"));
  const robots = (txt: string) => () => new Response(txt, { status: 200, headers: { "content-type": "text/plain" } });

  it("alt: Browser-UA, keine robots.txt", async () => {
    setAbruf("alt");
    const f = fakeFetch({ "https://a.example.net/kurse": ok("Kurse") });
    await fetchPage("https://a.example.net/kurse", { fetchImpl: f.impl });
    expect(f.log.map((l) => l.url)).toEqual(["https://a.example.net/kurse"]);
    expect(f.log[0]?.headers["user-agent"]).toBe(UA);
  });

  it("neu: eigener User-Agent auch für robots.txt, robots.txt einmal je Origin und Lauf", async () => {
    setAbruf("neu");
    const f = fakeFetch({
      "https://a.example.net/robots.txt": robots("User-agent: *\nDisallow: /intern/\n"),
      "https://a.example.net/kurse": ok("Kurse"),
      "https://a.example.net/termine": ok("Termine"),
    });
    await fetchPage("https://a.example.net/kurse", { fetchImpl: f.impl });
    await fetchPage("https://a.example.net/termine", { fetchImpl: f.impl });
    expect(f.log.map((l) => l.url)).toEqual([
      "https://a.example.net/robots.txt",
      "https://a.example.net/kurse",
      "https://a.example.net/termine",
    ]);
    expect(f.log.every((l) => l.headers["user-agent"] === BOT_UA)).toBe(true);
    expect(BOT_UA).toContain("zwergenplan/1.0");
  });

  it("gesperrt: RobotsError mit klasse gesperrt, ohne Abruf der Seite und ohne Wiederholung", async () => {
    setAbruf("neu");
    const f = fakeFetch({
      "https://a.example.net/robots.txt": robots("User-agent: zwergenplan\nDisallow: /intern/\n"),
    });
    const err = await fetchPage("https://a.example.net/intern/kurse?x=1", { fetchImpl: f.impl }).catch((e) => e);
    expect(err).toBeInstanceOf(RobotsError);
    expect(err).toMatchObject({ message: "robots.txt sperrt /intern/kurse?x=1", klasse: "gesperrt" });
    expect(f.log.map((l) => l.url)).toEqual(["https://a.example.net/robots.txt"]);
  });

  it("jede Station einer Weiterleitung wird geprüft, robots.txt selbst wird weitergeleitet", async () => {
    setAbruf("neu");
    const f = fakeFetch({
      "https://a.example.net/robots.txt": robots(""),
      "https://a.example.net/alt": redirect(301, "https://b.example.net/intern/neu"),
      "https://b.example.net/robots.txt": redirect(301, "https://www.b.example.net/robots.txt"),
      "https://www.b.example.net/robots.txt": robots("User-agent: *\nDisallow: /intern/\n"),
    });
    await expect(fetchPage("https://a.example.net/alt", { fetchImpl: f.impl })).rejects.toThrow(
      "robots.txt sperrt /intern/neu",
    );
    expect(f.log.map((l) => l.url)).not.toContain("https://b.example.net/intern/neu");
  });

  it("robots.txt nicht erreichbar (5xx): klasse voruebergehend; 404 erlaubt alles", async () => {
    setAbruf("neu");
    const f = fakeFetch({
      "https://a.example.net/robots.txt": () => new Response("weg", { status: 503 }),
      "https://b.example.net/robots.txt": () => new Response("fehlt", { status: 404 }),
      "https://b.example.net/kurse": ok("Kurse"),
    });
    const err = await fetchPage("https://a.example.net/kurse", { fetchImpl: f.impl, retries: 0 }).catch((e) => e);
    expect(err).toMatchObject({ klasse: "voruebergehend" });
    expect(String(err.message)).toMatch(/^robots\.txt nicht erreichbar \(HTTP 503\)/);
    await expect(fetchPage("https://b.example.net/kurse", { fetchImpl: f.impl })).resolves.toMatchObject({
      body: "Kurse",
    });
    // robots.txt ohne Wiederholung: ein Abruf je Origin
    expect(f.log.filter((l) => l.url === "https://a.example.net/robots.txt")).toHaveLength(1);
  });

  it("robots.txt mit mehr als 5 Weiterleitungen gilt als nicht vorhanden: alles erlaubt (RFC 9309, 2.3.1.2)", async () => {
    setAbruf("neu");
    const routes: Record<string, () => Response> = { "https://a.example.net/kurse": ok("Kurse") };
    routes["https://a.example.net/robots.txt"] = redirect(302, "/r0");
    for (let i = 0; i < 7; i++) routes[`https://a.example.net/r${i}`] = redirect(302, `/r${i + 1}`);
    const f = fakeFetch(routes);
    await expect(fetchPage("https://a.example.net/kurse", { fetchImpl: f.impl })).resolves.toMatchObject({
      body: "Kurse",
    });
  });

  it("Nominatim und OpenHolidays ohne robots-Prüfung", async () => {
    setAbruf("neu");
    expect(ROBOTS_EXEMPT_HOSTS).toEqual(["nominatim.openstreetmap.org", "openholidaysapi.org"]);
    const f = fakeFetch({
      "https://nominatim.openstreetmap.org/search?q=x": () => new Response("[]", { status: 200 }),
      "https://openholidaysapi.org/PublicHolidays": () => new Response("[]", { status: 200 }),
    });
    await fetchJson("https://nominatim.openstreetmap.org/search?q=x", { fetchImpl: f.impl });
    await fetchJson("https://openholidaysapi.org/PublicHolidays", { fetchImpl: f.impl });
    expect(f.log.map((l) => l.url).some((u) => u.endsWith("/robots.txt"))).toBe(false);
  });

  it("resolvePageUrl: Ziel nach Weiterleitungen, jede Station geprüft, Status egal", async () => {
    setAbruf("neu");
    const f = fakeFetch({
      "https://a.example.net/robots.txt": robots(""),
      "https://a.example.net/widget": redirect(302, "/widget/neu"),
      "https://a.example.net/widget/neu": () => new Response("Bot-Schutz", { status: 403 }),
    });
    expect(await resolvePageUrl("https://a.example.net/widget", { fetchImpl: f.impl })).toBe(
      "https://a.example.net/widget/neu",
    );
  });
});
