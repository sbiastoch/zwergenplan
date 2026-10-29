import { beforeEach, describe, expect, it } from "vitest";
import {
  createPush,
  type MirrorData,
  type PushEnv,
  PushError,
  type PushRegistration,
  type PushSub,
  pushCapability,
} from "./push.ts";

const WORKER = "https://push.example";
const KEY = "BPUBLIC";

interface Fake {
  env: PushEnv;
  calls: string[];
  store: Map<string, unknown>;
  requests: { method: string; url: string; body: unknown }[];
  setSub(endpoint: string | undefined): void;
  sub(): PushSub | undefined;
  /** `data-sw="aus"`: `start()` endet ohne Registrierung */
  giveUp(): void;
  /** Signale, mit denen `enable` `swGivenUp` aufrief */
  watching: (AbortSignal | undefined)[];
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
    serviceWorker?: boolean;
    /** `ready` löst nie auf (keine Registrierung, etwa Notausgang oder blockiert) */
    readyNever?: boolean;
    /** `data-sw="aus"` steht schon beim Aufruf */
    gaveUp?: boolean;
  } = {},
): Fake {
  const calls: string[] = [];
  const store = new Map<string, unknown>();
  const requests: Fake["requests"] = [];
  const watching: (AbortSignal | undefined)[] = [];
  let current: PushSub | undefined;
  let giveUp = () => {};
  const gaveUp = new Promise<void>((resolve) => {
    giveUp = resolve;
  });
  if (options.gaveUp) giveUp();
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
    hasServiceWorker: options.serviceWorker ?? true,
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
    ready: () => {
      calls.push("ready");
      return options.readyNever ? new Promise<PushRegistration>(() => {}) : Promise.resolve(registration);
    },
    swGivenUp: (signal) => {
      watching.push(signal);
      return gaveUp;
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
    giveUp: () => giveUp(),
    watching,
  };
}

const DATA: MirrorData = { birthDate: "2025-08-05", searches: '["kat=musik"]', origin: "gostenhof", providers: [] };

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

describe("pushCapability (Plan 0033, E8): ohne Blick auf die Registrierung", () => {
  it("ohne Service Worker, PushManager oder Notification: nein", () => {
    expect(pushCapability(fake({ serviceWorker: false }).env)).toBe("nein");
    expect(pushCapability(fake({ pushManager: false }).env)).toBe("nein");
    expect(pushCapability(fake({ permission: undefined }).env)).toBe("nein");
  });

  it("abgelehnt: verweigert; sonst ja, auch ohne Registrierung (Erstbesuch vor load)", () => {
    expect(pushCapability(fake({ permission: "denied" }).env)).toBe("verweigert");
    expect(pushCapability(fake({ permission: "granted" }).env)).toBe("ja");
    const f = fake({ registration: false });
    expect(pushCapability(f.env)).toBe("ja");
    expect(f.calls).toEqual([]);
  });
});

describe("enable wartet auf ready oder auf data-sw=aus (Plan 0033, E8)", () => {
  /** Ist das Versprechen nach allen Mikro-Tasks noch offen? */
  const pending = async (p: Promise<unknown>) => {
    let done = false;
    p.then(
      () => (done = true),
      () => (done = true),
    );
    for (let i = 0; i < 20; i++) await Promise.resolve();
    return !done;
  };

  it("(a) ready löst auf: Abo", async () => {
    const f = fake();
    await expect(createPush(f.env).enable(DATA)).resolves.toBe("https://web.push.apple.com/neu");
  });

  it("(b) data-sw=aus steht schon: sofort „abo“, ohne Abo und ohne Request", async () => {
    const f = fake({ readyNever: true, gaveUp: true });
    await expect(createPush(f.env).enable(DATA)).rejects.toEqual(new PushError("abo"));
    expect(f.requests).toEqual([]);
  });

  it("(c) data-sw=aus kommt später: dann „abo“", async () => {
    const f = fake({ readyNever: true });
    const result = createPush(f.env).enable(DATA);
    expect(await pending(result)).toBe(true);
    f.giveUp();
    await expect(result).rejects.toEqual(new PushError("abo"));
  });

  it("(d) keins von beiden: bleibt offen, kein Zeitlimit", async () => {
    const f = fake({ readyNever: true });
    expect(await pending(createPush(f.env).enable(DATA))).toBe(true);
    expect(f.calls).toEqual(["requestPermission", "ready"]);
  });

  it("ready gewinnt: das Beobachten von data-sw endet (Abbruch-Signal)", async () => {
    const f = fake();
    await createPush(f.env).enable(DATA);
    expect(f.watching).toHaveLength(1);
    expect(f.watching[0]?.aborted).toBe(true);
  });

  it("(d) solange keins von beiden kommt, läuft das Beobachten weiter", async () => {
    const f = fake({ readyNever: true });
    void createPush(f.env).enable(DATA);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(f.watching[0]?.aborted).toBe(false);
  });

  it("ready gewinnt, data-sw=aus kommt danach: kein unbehandelter Fehler", async () => {
    const f = fake();
    await expect(createPush(f.env).enable(DATA)).resolves.toBe("https://web.push.apple.com/neu");
    f.giveUp();
    for (let i = 0; i < 5; i++) await Promise.resolve();
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
    f.setSub("https://web.push.apple.com/a");
    f.store.set("endpoint", "https://web.push.apple.com/a");
    const push = createPush(f.env);
    await push.reconcile({ birthDate: undefined, searches: null, origin: undefined, providers: [] });
    writes.length = 0;
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

describe("mirrorIfSubscribed (Plan 0035, E9): einmal am Ende des Onboardings, ohne Request", () => {
  /** zählt Schreibvorgänge in den Geräte-Speicher */
  function counted(f: Fake) {
    const writes: string[] = [];
    const set = f.env.store.set;
    f.env.store.set = async (key, value) => {
      writes.push(key);
      await set(key, value);
    };
    return writes;
  }

  it("ohne PushManager: fragt nicht einmal nach der Registrierung, schreibt nichts", async () => {
    const f = fake({ pushManager: false });
    const writes = counted(f);
    await createPush(f.env).mirrorIfSubscribed(DATA);
    expect(f.calls).toEqual([]);
    expect(writes).toEqual([]);
    expect(f.requests).toEqual([]);
  });

  it("ohne Abo: Geräte-Speicher bleibt unberührt, kein Request", async () => {
    const f = fake();
    f.store.set("birthDate", "2024-01-01");
    const writes = counted(f);
    await createPush(f.env).mirrorIfSubscribed(DATA);
    expect(writes).toEqual([]);
    expect([...f.store]).toEqual([["birthDate", "2024-01-01"]]);
    expect(f.requests).toEqual([]);
  });

  it("mit Abo: schreibt Geburtsdatum, Such-Abos und Startpunkt, kein Request; gleiche Daten erneut: nichts", async () => {
    const f = fake();
    f.setSub("https://web.push.apple.com/a");
    f.store.set("endpoint", "https://web.push.apple.com/a");
    const writes = counted(f);
    const push = createPush(f.env);
    await push.mirrorIfSubscribed(DATA);
    expect(writes.sort()).toEqual(["birthDate", "origin", "providers", "searches"]);
    expect(f.store.get("birthDate")).toBe("2025-08-05");
    expect(f.store.get("searches")).toBe('["kat=musik"]');
    expect(f.store.get("origin")).toBe("gostenhof");
    expect(f.store.get("endpoint")).toBe("https://web.push.apple.com/a");
    writes.length = 0;
    await push.mirrorIfSubscribed(DATA);
    expect(writes).toEqual([]);
    expect(f.requests).toEqual([]);
  });
});

describe("mirror nach dem Ausschalten (E6: geleert heißt geleert)", () => {
  it("schreibt nichts, solange kein Abgleich oder Einschalten Push als an bestätigt hat", async () => {
    const f = fake();
    await createPush(f.env).mirror(DATA);
    expect(f.store.size).toBe(0);
  });

  it("ein Spiegeln, das während des Leerens startet, füllt den Speicher nicht wieder", async () => {
    const f = fake();
    const push = createPush(f.env);
    await push.enable(DATA);
    const clear = f.env.store.clear;
    let late: Promise<void> | undefined;
    f.env.store.clear = async () => {
      // Ein Rendern mit noch eingeschaltetem Schalter, während das Leeren läuft (CI-Lauf 37765545767)
      late = push.mirror({ ...DATA, origin: "st-johannis" });
      await clear();
    };
    await push.disable();
    await late;
    expect(f.store.size).toBe(0);
  });

  it("ein Spiegeln, das vor dem Ausschalten begann, schreibt danach keine weiteren Schlüssel", async () => {
    const f = fake();
    const push = createPush(f.env);
    await push.enable(DATA);
    const set = f.env.store.set;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // wie IndexedDB: Der Auftrag steht sofort in der Reihe, die Bestätigung kommt erst nach dem Leeren
    f.env.store.set = async (key, value) => {
      await set(key, value);
      await gate;
    };
    const clear = f.env.store.clear;
    f.env.store.clear = async () => {
      await clear();
      release();
    };
    const inFlight = push.mirror({
      birthDate: undefined,
      searches: '["kat=natur"]',
      origin: "st-johannis",
      providers: [],
    });
    await push.disable();
    await inFlight;
    expect(f.store.size).toBe(0);
  });

  it("nach erneutem Einschalten spiegelt es wieder", async () => {
    const f = fake();
    const push = createPush(f.env);
    await push.enable(DATA);
    await push.disable();
    await push.mirror(DATA);
    expect(f.store.size).toBe(0);
    await push.enable(DATA);
    await push.mirror({ ...DATA, origin: "st-johannis" });
    expect(f.store.get("origin")).toBe("st-johannis");
  });
});

describe("deviceId", () => {
  it("sind die ersten 8 Zeichen des SHA-256 des Endpoints (wie der Schlüssel im Worker)", async () => {
    // printf %s 'https://web.push.apple.com/a' | sha256sum
    expect(await createPush(fake().env).deviceId("https://web.push.apple.com/a")).toMatch(/^[0-9a-f]{8}$/);
    expect(await createPush(fake().env).deviceId("x")).toBe("2d711642");
  });
});

describe("Anbieter-Abos und Glocken-Tipp (Plan 0054, E3, E4)", () => {
  const WITH_PROVIDERS: MirrorData = { ...DATA, providers: ["anb-a", "anb-b"] };

  it("mirrorIfSubscribed spiegelt die Anbieter-Abos und meldet „an“; ein leeres Array löscht den Schlüssel", async () => {
    const f = fake();
    f.setSub("https://web.push.apple.com/a");
    const push = createPush(f.env);
    expect(await push.mirrorIfSubscribed(WITH_PROVIDERS)).toBe("an");
    expect(f.store.get("providers")).toEqual(["anb-a", "anb-b"]);
    expect(await push.mirrorIfSubscribed(DATA)).toBe("an");
    expect(f.store.has("providers")).toBe(false);
    expect(f.requests).toEqual([]);
  });

  it("mirrorIfSubscribed meldet „aus“ ohne Abo und „nein“ ohne PushManager", async () => {
    expect(await createPush(fake().env).mirrorIfSubscribed(DATA)).toBe("aus");
    expect(await createPush(fake({ pushManager: false }).env).mirrorIfSubscribed(DATA)).toBe("nein");
  });

  it("enable spiegelt die Anbieter-Abos mit, disable löscht sie", async () => {
    const f = fake();
    const push = createPush(f.env);
    await push.enable(WITH_PROVIDERS);
    expect(f.store.get("providers")).toEqual(["anb-a", "anb-b"]);
    await push.disable();
    expect(f.store.size).toBe(0);
  });

  it("ein Glocken-Spiegeln, dessen subscription() erst nach dem Leeren antwortet, schreibt nichts (Review 2, Nr. 2)", async () => {
    const f = fake();
    const push = createPush(f.env);
    await push.enable(DATA);
    // Das nächste getRegistration (das von mirrorIfSubscribed) sieht noch das alte Abo, antwortet aber erst nach clear()
    const getRegistration = f.env.getRegistration;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    f.env.getRegistration = async () => {
      const registration = await getRegistration();
      if (!first || !registration) return registration;
      first = false;
      const old = await registration.pushManager.getSubscription();
      await gate;
      return { ...registration, pushManager: { ...registration.pushManager, getSubscription: async () => old } };
    };
    const late = push.mirrorIfSubscribed(WITH_PROVIDERS);
    await push.disable();
    release();
    expect(await late).toBe("aus");
    expect(f.store.size).toBe(0);
  });
});
