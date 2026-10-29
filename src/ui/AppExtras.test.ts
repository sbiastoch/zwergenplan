import { describe, expect, it, vi } from "vitest";
import { type BellEnv, type BellModule, bellPushWith } from "./AppExtras.tsx";

function problem(kind: string): Error {
  return Object.assign(new Error(kind), { problem: kind });
}

/** Umgebung mit Protokoll der Aufrufe in Reihenfolge */
function env(
  options: {
    permission?: NotificationPermission | undefined;
    answer?: NotificationPermission;
    loaded?: boolean;
    loadFails?: boolean;
    state?: "an" | "aus" | "nein";
    enableFails?: Error;
  } = {},
) {
  const calls: string[] = [];
  const module: BellModule = {
    syncPushMirror: vi.fn(async () => {
      calls.push("sync");
      return options.state ?? "aus";
    }),
    enablePush: vi.fn(async () => {
      calls.push("enable");
      if (options.enableFails) throw options.enableFails;
      return "endpoint";
    }),
  };
  const e: BellEnv = {
    permission: () => ("permission" in options ? options.permission : "granted"),
    ask: async () => {
      calls.push("ask");
      return options.answer ?? "granted";
    },
    loaded: () => (options.loaded ? module : undefined),
    load: async () => {
      calls.push("load");
      if (options.loadFails) throw new TypeError("offline");
      return module;
    },
  };
  return { e, calls };
}

describe("bellPushWith (Plan 0054, E4, E5)", () => {
  it("Erlaubnis offen, Modul geladen: enablePush als erster Aufruf, ohne Laden", async () => {
    const { e, calls } = env({ permission: "default", loaded: true });
    expect(await bellPushWith(true, e)).toBe("eingeschaltet");
    expect(calls).toEqual(["enable"]);
  });

  it("Erlaubnis offen, Modul nicht geladen: erst fragen, dann laden und einschalten", async () => {
    const { e, calls } = env({ permission: "default" });
    expect(await bellPushWith(true, e)).toBe("eingeschaltet");
    expect(calls).toEqual(["ask", "load", "enable"]);
  });

  it("Erlaubnis offen, abgelehnt: „verweigert“, nichts geladen", async () => {
    const { e, calls } = env({ permission: "default", answer: "denied" });
    expect(await bellPushWith(true, e)).toBe("verweigert");
    expect(calls).toEqual(["ask"]);
  });

  it("Push an: nur spiegeln", async () => {
    const { e, calls } = env({ state: "an" });
    expect(await bellPushWith(true, e)).toBe("an");
    expect(calls).toEqual(["load", "sync"]);
  });

  it("Push aus, Erlaubnis erteilt: nach dem Spiegeln einschalten", async () => {
    const { e, calls } = env({ state: "aus", permission: "granted" });
    expect(await bellPushWith(true, e)).toBe("eingeschaltet");
    expect(calls).toEqual(["load", "sync", "enable"]);
  });

  it("Push aus, Erlaubnis blockiert: „verweigert“, kein Einschalten", async () => {
    const { e, calls } = env({ state: "aus", permission: "denied" });
    expect(await bellPushWith(true, e)).toBe("verweigert");
    expect(calls).toEqual(["load", "sync"]);
  });

  it("Abo beenden schaltet nie etwas ein, auch bei offener Erlaubnis", async () => {
    for (const permission of ["default", "granted"] as const) {
      const { e, calls } = env({ state: "aus", permission, loaded: true });
      expect(await bellPushWith(false, e)).toBe("aus");
      expect(calls).toEqual(["load", "sync"]);
    }
  });

  it("kein Push möglich: „nein“ vom Spiegeln, keine Abfrage", async () => {
    const { e, calls } = env({ state: "nein", permission: undefined });
    expect(await bellPushWith(true, e)).toBe("nein");
    expect(calls).toEqual(["load", "sync"]);
  });

  it("Einschalten scheitert: das Problem aus dem PushError, sonst „abo“", async () => {
    expect(await bellPushWith(true, env({ enableFails: problem("netz") }).e)).toBe("netz");
    expect(await bellPushWith(true, env({ enableFails: problem("server") }).e)).toBe("server");
    expect(await bellPushWith(true, env({ enableFails: new Error("kaputt") }).e)).toBe("abo");
  });

  it("Chunk nicht ladbar: undefined", async () => {
    expect(await bellPushWith(true, env({ loadFails: true }).e)).toBeUndefined();
    expect(await bellPushWith(true, env({ loadFails: true, permission: "default" }).e)).toBeUndefined();
  });
});
