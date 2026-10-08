import { describe, expect, it, vi } from "vitest";
import { absoluteUrl, type ShareApi, shareLink } from "./share.ts";

const data = { title: "Offener Krabbeltreff", url: "https://zwergenplan.app/angebot/a--b--c/" };
const fail = (name: string) => () => Promise.reject(new DOMException("nein", name));

function api(share: ShareApi["share"], writeText: ShareApi["writeText"] = vi.fn(() => Promise.resolve())) {
  return { share, writeText };
}

describe("Teilen und Kopieren (Plan 0026, E6)", () => {
  it("System-Teilen ohne Text: geteilt", async () => {
    const share = vi.fn(() => Promise.resolve());
    const a = api(share);
    await expect(shareLink(data, a)).resolves.toBe("geteilt");
    expect(share).toHaveBeenCalledWith({ title: data.title, url: data.url });
    expect(a.writeText).not.toHaveBeenCalled();
  });

  it("Abbruch und offenes Teilen-Menü: still, ohne Kopieren", async () => {
    for (const name of ["AbortError", "InvalidStateError"]) {
      const a = api(vi.fn(fail(name)));
      await expect(shareLink(data, a)).resolves.toBe("abgebrochen");
      expect(a.writeText).not.toHaveBeenCalled();
    }
  });

  it("verweigert oder ohne Teilen: kopiert", async () => {
    for (const share of [vi.fn(fail("NotAllowedError")), vi.fn(() => Promise.reject(new TypeError("x"))), undefined]) {
      const a = api(share);
      await expect(shareLink(data, a)).resolves.toBe("kopiert");
      expect(a.writeText).toHaveBeenCalledWith(data.url);
    }
  });

  it("beides scheitert oder fehlt: fehler", async () => {
    await expect(shareLink(data, api(vi.fn(fail("NotAllowedError")), vi.fn(fail("NotAllowedError"))))).resolves.toBe(
      "fehler",
    );
    await expect(shareLink(data, { share: undefined, writeText: undefined })).resolves.toBe("fehler");
  });

  it("absolute URL aus Origin und Basis", () => {
    expect(absoluteUrl("angebot/a--b--c/", "http://localhost:4173")).toBe("http://localhost:4173/angebot/a--b--c/");
  });
});
