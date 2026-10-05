import { describe, expect, it } from "vitest";
import { type RetireScope, retire } from "./retire.ts";

/** Fake-Scope: protokolliert die Schritte in Reihenfolge */
function scope(names: string[], windows: string[], failing: string[] = []) {
  const calls: string[] = [];
  const fake: RetireScope = {
    cacheNames: async () => names,
    deleteCache: async (name) => {
      calls.push(`lösche ${name}`);
      return true;
    },
    unregister: async () => {
      calls.push("abmelden");
      return true;
    },
    windows: async () =>
      windows.map((url) => ({
        url,
        navigate: async (to: string) => {
          if (failing.includes(to)) throw new TypeError("navigate abgelehnt");
          calls.push(`neu laden ${to}`);
        },
      })),
  };
  return { fake, calls };
}

describe("Notausgang: Service Worker meldet sich selbst ab (Arch-Review Stufe 1, H3; README)", () => {
  it("löscht die eigenen Caches, meldet sich ab und lädt jedes Fenster neu, in dieser Reihenfolge", async () => {
    const { fake, calls } = scope(["zp-shell-abc", "zp-assets", "zp-data", "fremd"], ["https://zwergenplan.app/?a"]);
    await retire(fake);
    expect(calls).toEqual([
      "lösche zp-shell-abc",
      "lösche zp-assets",
      "lösche zp-data",
      "abmelden",
      "neu laden https://zwergenplan.app/?a",
    ]);
  });

  it("ein Fenster, das nicht navigieren darf, hält die anderen nicht auf", async () => {
    const { fake, calls } = scope(
      [],
      ["https://zwergenplan.app/x", "https://zwergenplan.app/y"],
      ["https://zwergenplan.app/x"],
    );
    await retire(fake);
    expect(calls).toEqual(["abmelden", "neu laden https://zwergenplan.app/y"]);
  });
});
