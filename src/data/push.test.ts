import { beforeEach, describe, expect, it } from "vitest";
import { createPush, type PushEnv, PushError, type PushRegistration, type PushSub } from "./push.ts";

const WORKER = "https://push.example";
const KEY = "BPUBLIC";

interface Fake {
  env: PushEnv;
  calls: string[];
  store: Map<string, unknown>;
  requests: { method: string; url: string; body: unknown }[];
  setSub(endpoint: string | undefined): void;
  sub(): PushSub | undefined;
}

function fake(
  options: {
    registration?: boolean;
    permission?: NotificationPermission | undefined;
    answer?: NotificationPermission;
    pushManager?: boolean;
    subscribeFails?: boolean;
    fetchStatus?: number;
    fetchThrows?: boolean;
  } = {},
): Fake {
  const calls: string[] = [];
  const store = new Map<string, unknown>();
  const requests: Fake["requests"] = [];
  let current: PushSub | undefined;
  const makeSub = (endpoint: string): PushSub => ({
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: async () => {
      calls.push(`unsubscribe ${endpoint}`);
      if (current?.endpoint === endpoint) current = undefined;
      return true;
    },
  });
  const registration: PushRegistration = {
    pushManager: {
      getSubscription: async () => current ?? null,
      subscribe: async (opts) => {
        calls.push(`subscribe ${String(opts.applicationServerKey)}`);
        if (options.subscribeFails) throw new Error("abo kaputt");
        current = makeSub("https://web.push.apple.com/neu");
        return current;
      },
    },
  };
  const env: PushEnv = {
    workerUrl: WORKER,
    vapidKey: KEY,
    hasPushManager: options.pushManager ?? true,
    permission: () => ("permission" in options ? options.permission : "default"),
    requestPermission: async () => {
      calls.push("requestPermission");
      return options.answer ?? "granted";
    },
    getRegistration: async () => {
      calls.push("getRegistration");
      return options.registration === false ? undefined : registration;
    },
    ready: async () => {
      calls.push("ready");
      return registration;
    },
    fetch: async (url, init) => {
      requests.push({ method: init.method, url, body: JSON.parse(init.body) });
      if (options.fetchThrows) throw new TypeError("offline");
      return { ok: (options.fetchStatus ?? 204) < 300, status: options.fetchStatus ?? 204 };
    },
    store: {
      get: async (key) => store.get(key),
      set: async (key, value) => {
        if (value === undefined) store.delete(key);
        else store.set(key, value);
      },
      clear: async () => store.clear(),
    },
  };
  return {
    env,
    calls,
    store,
    requests,
    setSub: (endpoint) => {
      current = endpoint === undefined ? undefined : makeSub(endpoint);
    },
    sub: () => current,
  };
}

const DATA = { birthDate: "2025-08-05", searches: '["kat=musik"]', origin: "gostenhof" };

describe("support", () => {
  it("ohne Registrierung ist es „kein-sw“, ohne zu warten", async () => {
    const f = fake({ registration: false });
    expect(await createPush(f.env).support()).toBe("kein-sw");
    expect(f.calls).toEqual(["getRegistration"]);
  });

  it("ohne PushManager oder Notification ist es „kein-push“ (Safari-Tab)", async () => {
    expect(await createPush(fake({ pushManager: false }).env).support()).toBe("kein-push");
    expect(await createPush(fake({ permission: undefined }).env).support()).toBe("kein-push");
  });

  it("abgelehnt ist „verweigert“, sonst „ok“", async () => {
    expect(await createPush(fake({ permission: "denied" }).env).support()).toBe("verweigert");
    expect(await createPush(fake({ permission: "granted" }).env).support()).toBe("ok");
    expect(await createPush(fake().env).support()).toBe("ok");
  });
});

describe("enable", () => {
  it("fragt zuerst nach der Erlaubnis, wartet dann auf den aktiven Worker, abonniert und meldet nur das Abo", async () => {
    const f = fake();
    const endpoint = await createPush(f.env).enable(DATA);
    expect(endpoint).toBe("https://web.push.apple.com/neu");
    expect(f.calls.slice(0, 3)).toEqual(["requestPermission", "ready", "subscribe BPUBLIC"]);
    expect(f.requests).toEqual([
      {
        method: "POST",
        url: `${WORKER}/abo`,
        body: { endpoint: "https://web.push.apple.com/neu", keys: { p256dh: "p", auth: "a" } },
      },
    ]);
    expect(Object.fromEntries(f.store)).toEqual({
      endpoint: "https://web.push.apple.com/neu",
      birthDate: "2025-08-05",
      searches: '["kat=musik"]',
      origin: "gostenhof",
    });
  });

  it("wirft „verweigert“, wenn die Erlaubnis fehlt, und abonniert nicht", async () => {
    const f = fake({ answer: "denied" });
    await expect(createPush(f.env).enable(DATA)).rejects.toEqual(new PushError("verweigert"));
    expect(f.calls).toEqual(["requestPermission"]);
  });

  it("meldet ein schon erzeugtes Abo wieder ab, wenn der Worker scheitert", async () => {
    for (const [options, problem] of [
      [{ fetchStatus: 500 }, "server"],
      [{ fetchThrows: true }, "netz"],
    ] as const) {
      const f = fake(options);
      await expect(createPush(f.env).enable(DATA)).rejects.toEqual(new PushError(problem));
      expect(f.calls).toContain("unsubscribe https://web.push.apple.com/neu");
      expect(f.sub()).toBeUndefined();
      expect(f.store.size).toBe(0);
    }
  });

  it("scheitert der Geräte-Speicher nach der Anmeldung: abmelden, beim Worker löschen, „abo“ (Arch-Review M1)", async () => {
    const f = fake();
    f.env.store.set = async () => {
      throw new DOMException("voll", "QuotaExceededError");
    };
    await expect(createPush(f.env).enable(DATA)).rejects.toEqual(new PushError("abo"));
    expect(f.sub()).toBeUndefined();
    expect(f.requests.map((r) => r.method)).toEqual(["POST", "DELETE"]);
  });

  it("wirft „abo“, wenn das Abonnieren scheitert", async () => {
    const f = fake({ subscribeFails: true });
    await expect(createPush(f.env).enable(DATA)).rejects.toEqual(new PushError("abo"));
    expect(f.requests).toEqual([]);
  });
});

describe("disable", () => {
  it("meldet ab, löscht beim Worker und leert den Geräte-Speicher", async () => {
    const f = fake();
    const push = createPush(f.env);
    await push.enable(DATA);
    f.requests.length = 0;
    await push.disable();
    expect(f.sub()).toBeUndefined();
    expect(f.requests).toEqual([
      { method: "DELETE", url: `${WORKER}/abo`, body: { endpoint: "https://web.push.apple.com/neu" } },
    ]);
    expect(f.store.size).toBe(0);
  });

  it("räumt auch auf, wenn der Worker nicht erreichbar ist", async () => {
    const f = fake({ fetchThrows: true });
    f.setSub("https://web.push.apple.com/alt");
    f.store.set("endpoint", "https://web.push.apple.com/alt");
    await createPush(f.env).disable();
    expect(f.sub()).toBeUndefined();
    expect(f.store.size).toBe(0);
  });
});

describe("reconcile (Abgleich beim Öffnen des Kind-Sheets)", () => {
  let f: Fake;
  beforeEach(() => {
    f = fake();
  });

  it("ohne Abo ist Push aus, und der Geräte-Speicher wird geleert", async () => {
    f.store.set("endpoint", "https://web.push.apple.com/alt");
    f.store.set("birthDate", "2025-08-05");
    expect(await createPush(f.env).reconcile(DATA)).toBe(false);
    expect(f.store.size).toBe(0);
    expect(f.requests).toEqual([]);
  });

  it("mit gleichem Endpoint: kein Request, nur Spiegeln", async () => {
    f.setSub("https://web.push.apple.com/a");
    f.store.set("endpoint", "https://web.push.apple.com/a");
    expect(await createPush(f.env).reconcile(DATA)).toBe(true);
    expect(f.requests).toEqual([]);
    expect(f.store.get("origin")).toBe("gostenhof");
  });

  it("mit ausgetauschtem Endpoint: neues Abo melden, altes abmelden", async () => {
    f.setSub("https://web.push.apple.com/neu");
    f.store.set("endpoint", "https://web.push.apple.com/alt");
    expect(await createPush(f.env).reconcile(DATA)).toBe(true);
    expect(f.requests.map((r) => [r.method, (r.body as { endpoint: string }).endpoint])).toEqual([
      ["POST", "https://web.push.apple.com/neu"],
      ["DELETE", "https://web.push.apple.com/alt"],
    ]);
    expect(f.store.get("endpoint")).toBe("https://web.push.apple.com/neu");
  });

  it("scheitert das Melden, bleibt der alte Endpoint für den nächsten Versuch", async () => {
    const g = fake({ fetchThrows: true });
    g.setSub("https://web.push.apple.com/neu");
    g.store.set("endpoint", "https://web.push.apple.com/alt");
    expect(await createPush(g.env).reconcile(DATA)).toBe(true);
    expect(g.store.get("endpoint")).toBe("https://web.push.apple.com/alt");
  });
});

describe("mirror", () => {
  it("schreibt nur, was sich seit dem letzten Mal geändert hat; undefined löscht", async () => {
    const f = fake();
    const writes: string[] = [];
    const set = f.env.store.set;
    f.env.store.set = async (key, value) => {
      writes.push(key);
      await set(key, value);
    };
    const push = createPush(f.env);
    await push.mirror(DATA);
    expect(writes.sort()).toEqual(["birthDate", "origin", "searches"]);
    writes.length = 0;
    await push.mirror(DATA);
    expect(writes).toEqual([]);
    await push.mirror({ ...DATA, birthDate: undefined, origin: { source: "standort", lat: 49.452, lon: 11.077 } });
    expect(writes.sort()).toEqual(["birthDate", "origin"]);
    expect(f.store.has("birthDate")).toBe(false);
    expect(f.store.get("origin")).toEqual({ source: "standort", lat: 49.452, lon: 11.077 });
  });
});

describe("deviceId", () => {
  it("sind die ersten 8 Zeichen des SHA-256 des Endpoints (wie der Schlüssel im Worker)", async () => {
    // printf %s 'https://web.push.apple.com/a' | sha256sum
    expect(await createPush(fake().env).deviceId("https://web.push.apple.com/a")).toMatch(/^[0-9a-f]{8}$/);
    expect(await createPush(fake().env).deviceId("x")).toBe("2d711642");
  });
});
