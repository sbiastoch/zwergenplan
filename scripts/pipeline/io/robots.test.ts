import { describe, expect, it } from "vitest";
import { robotsCache } from "./robots.ts";

describe("robotsCache (Plan 0048, E8)", () => {
  it("parallele Prüfungen eines Origins: ein Abruf", async () => {
    const cache = robotsCache();
    let calls = 0;
    const fetchTxt = async () => {
      calls++;
      return { status: 200, body: "User-agent: *\nDisallow: /intern/\n" };
    };
    const [a, b, c] = await Promise.all([
      cache.check("https://a.example/kurse", fetchTxt),
      cache.check("https://a.example/intern/x", fetchTxt),
      cache.check("http://a.example/intern/x", fetchTxt),
    ]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: false, reason: "robots.txt sperrt /intern/x", klasse: "gesperrt" });
    // anderes Schema, anderer Origin (RFC 9309, 2.3)
    expect(c).toMatchObject({ ok: false });
    expect(calls).toBe(2);
  });

  it("Netzfehler beim Abruf: voruebergehend, für den ganzen Lauf", async () => {
    const cache = robotsCache();
    let calls = 0;
    const fetchTxt = async () => {
      calls++;
      throw new Error("getaddrinfo ENOTFOUND a.example\nStack");
    };
    const r = await cache.check("https://a.example/kurse", fetchTxt);
    expect(r).toEqual({
      ok: false,
      reason: "robots.txt nicht erreichbar (getaddrinfo ENOTFOUND a.example)",
      klasse: "voruebergehend",
    });
    await cache.check("https://a.example/termine", fetchTxt);
    expect(calls).toBe(1);
  });
});
