import { describe, expect, it } from "vitest";
import { blockedUrl, MAX_REDIRECTS, nextHop } from "./redirect.ts";

const base = { url: "https://a.example.net/x", method: "GET" as const, hops: 0 };

describe("blockedUrl", () => {
  it("erlaubt öffentliche http(s)-Adressen, sperrt IP-Literale, localhost und andere Schemata", () => {
    expect(blockedUrl("https://a.example.net/")).toBeUndefined();
    expect(blockedUrl("http://127.0.0.1/")).toMatch(/interne Adresse/);
    expect(blockedUrl("http://169.254.169.254/latest")).toMatch(/interne Adresse/);
    expect(blockedUrl("http://[::1]/")).toMatch(/interne Adresse/);
    expect(blockedUrl("http://localhost:8080/")).toMatch(/interne Adresse/);
    expect(blockedUrl("http://drucker.local/")).toMatch(/interne Adresse/);
    expect(blockedUrl("file:///etc/passwd")).toMatch(/kein http/);
  });
});

describe("nextHop (Weiterleitung je Sprung)", () => {
  it("keine Weiterleitung: fertig", () => {
    expect(nextHop({ ...base, status: 200, location: null })).toEqual({ kind: "fertig" });
    expect(nextHop({ ...base, status: 302, location: null })).toEqual({ kind: "fertig" });
  });

  it("relative Ziele gegen die aktuelle Adresse", () => {
    expect(nextHop({ ...base, status: 301, location: "/neu?a=1" })).toEqual({
      kind: "weiter",
      url: "https://a.example.net/neu?a=1",
      method: "GET",
      body: false,
    });
  });

  it("Methode wie fetch: 303 und 301/302 machen aus POST ein GET, 307/308 behalten POST samt Body", () => {
    const post = { ...base, method: "POST" as const };
    expect(nextHop({ ...post, status: 303, location: "/a" })).toMatchObject({ method: "GET", body: false });
    expect(nextHop({ ...post, status: 302, location: "/a" })).toMatchObject({ method: "GET", body: false });
    expect(nextHop({ ...post, status: 307, location: "/a" })).toMatchObject({ method: "POST", body: true });
    expect(nextHop({ ...post, status: 308, location: "/a" })).toMatchObject({ method: "POST", body: true });
  });

  it("Ziel intern oder kein http(s): Fehler", () => {
    expect(nextHop({ ...base, status: 302, location: "http://127.0.0.1/admin" })).toEqual({
      kind: "fehler",
      reason: "Weiterleitung abgelehnt (interne Adresse: 127.0.0.1)",
    });
    expect(nextHop({ ...base, status: 302, location: "ftp://a.example.net/" }).kind).toBe("fehler");
  });

  it(`höchstens ${MAX_REDIRECTS} Sprünge`, () => {
    expect(nextHop({ ...base, status: 302, location: "/a", hops: MAX_REDIRECTS - 1 }).kind).toBe("weiter");
    expect(nextHop({ ...base, status: 302, location: "/a", hops: MAX_REDIRECTS })).toEqual({
      kind: "fehler",
      reason: `mehr als ${MAX_REDIRECTS} Weiterleitungen`,
    });
  });
});
