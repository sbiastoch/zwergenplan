import { describe, expect, it } from "vitest";
import { parseRobots, ROBOTS_MAX_BYTES, robotsAllows, robotsFromResponse } from "./robots.ts";

const allows = (txt: string, path: string) => robotsAllows(parseRobots(txt), path);

describe("parseRobots und robotsAllows (Plan 0048, E8; RFC 9309)", () => {
  it("leere Datei und Datei ohne Regeln erlauben alles", () => {
    expect(allows("", "/kurse")).toBe(true);
    expect(allows("# nur ein Kommentar\nSitemap: https://example.org/sitemap.xml\n", "/kurse")).toBe(true);
    // eine Website, die statt robots.txt ihre Startseite liefert
    expect(allows("<!doctype html><html><body>Willkommen</body></html>", "/kurse")).toBe(true);
  });

  it("die Gruppe zwergenplan ersetzt *, Groß- und Kleinschreibung egal", () => {
    const txt = "User-agent: *\nDisallow: /\n\nuser-agent: Zwergenplan\nDisallow: /intern/\n";
    expect(allows(txt, "/kurse")).toBe(true);
    expect(allows(txt, "/intern/x")).toBe(false);
    expect(allows("User-agent: *\nDisallow: /\n", "/kurse")).toBe(false);
    // fremde Gruppe gilt nicht
    expect(allows("User-agent: Googlebot\nDisallow: /\n", "/kurse")).toBe(true);
  });

  it("gleiche Gruppen werden zusammengeführt, mehrere User-agent-Zeilen teilen eine Gruppe", () => {
    const txt = [
      "User-agent: zwergenplan",
      "Disallow: /a/",
      "",
      "User-agent: googlebot",
      "User-agent: zwergenplan",
      "Disallow: /b/",
      "",
      "User-agent: zwergenplan",
      "Disallow: /c/",
    ].join("\n");
    expect(allows(txt, "/a/1")).toBe(false);
    expect(allows(txt, "/b/1")).toBe(false);
    expect(allows(txt, "/c/1")).toBe(false);
    expect(allows(txt, "/d/1")).toBe(true);
  });

  it("die längste passende Regel gilt, bei Gleichstand Allow", () => {
    const txt = "User-agent: *\nDisallow: /kurse\nAllow: /kurse/baby\nAllow: /x\nDisallow: /x\n";
    expect(allows(txt, "/kurse/yoga")).toBe(false);
    expect(allows(txt, "/kurse/baby/1")).toBe(true);
    expect(allows(txt, "/x")).toBe(true);
  });

  it("leeres Disallow ist keine Regel", () => {
    expect(allows("User-agent: *\nDisallow:\n", "/alles")).toBe(true);
  });

  it("Muster mit * und $", () => {
    const txt = "User-agent: *\nDisallow: /*.pdf$\nDisallow: /suche*?q=\n";
    expect(allows(txt, "/programm.pdf")).toBe(false);
    expect(allows(txt, "/programm.pdf?v=2")).toBe(true);
    expect(allows(txt, "/suche/ergebnis?q=baby")).toBe(false);
    expect(allows(txt, "/suche/ergebnis")).toBe(true);
  });

  it("$ ohne *, * am Ende und viele * ohne Hänger (Arch-Review S3, m1)", () => {
    expect(allows("User-agent: *\nDisallow: /kurse$\n", "/kurse")).toBe(false);
    expect(allows("User-agent: *\nDisallow: /kurse$\n", "/kurse/1")).toBe(true);
    expect(allows("User-agent: *\nDisallow: /a*\n", "/a/b")).toBe(false);
    expect(allows("User-agent: *\nDisallow: /*b*b$\n", "/xbyb")).toBe(false);
    expect(allows("User-agent: *\nDisallow: /*ab*b$\n", "/ab")).toBe(true);
    const evil = `User-agent: *\nDisallow: /${"*a".repeat(40)}*b\n`;
    const started = performance.now();
    expect(allows(evil, `/${"a".repeat(5000)}`)).toBe(true);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("Pfad mit Query und Prozent-Kodierung", () => {
    const txt = "User-agent: *\nDisallow: /index.php?id=12\nDisallow: /kurse/größe\nDisallow: /a%2fb\n";
    expect(allows(txt, "/index.php?id=12&x=1")).toBe(false);
    expect(allows(txt, "/index.php?id=13")).toBe(true);
    // Umlaut im Muster gegen die kodierte Form aus der URL
    expect(allows(txt, "/kurse/gr%C3%B6%C3%9Fe")).toBe(false);
    // Hex-Ziffern ohne Rücksicht auf Groß- und Kleinschreibung
    expect(allows(txt, "/a%2Fb")).toBe(false);
  });

  it("Kommentare und Leerraum werden ignoriert, /robots.txt ist immer erlaubt", () => {
    const txt = "User-agent: * # alle\n  Disallow: /  # alles\n";
    expect(allows(txt, "/kurse")).toBe(false);
    expect(allows(txt, "/robots.txt")).toBe(true);
  });

  it("liest höchstens 500 KiB", () => {
    const txt = `User-agent: *\n${"# füll\n".repeat(ROBOTS_MAX_BYTES / 7)}Disallow: /\n`;
    expect(allows(txt, "/kurse")).toBe(true);
  });
});

describe("robotsFromResponse (Plan 0048, E8)", () => {
  it("2xx: Regeln der Datei", () => {
    const r = robotsFromResponse(200, "User-agent: *\nDisallow: /\n");
    expect(r.kind).toBe("regeln");
  });

  it("4xx erlaubt alles, auch 401 und 403", () => {
    for (const status of [401, 403, 404, 410]) expect(robotsFromResponse(status, "").kind).toBe("alles");
  });

  it("5xx und 429 sperren alles für diesen Lauf", () => {
    for (const status of [429, 500, 503]) {
      const r = robotsFromResponse(status, "");
      expect(r).toEqual({ kind: "unerreichbar", reason: `robots.txt nicht erreichbar (HTTP ${status})` });
    }
  });
});
