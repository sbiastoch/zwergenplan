import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInstallStore,
  FRESH_AFTER_MS,
  ICS_OFFLINE,
  type InstallEnv,
  offlineNote,
  type PromptEvent,
  type PwaEnv,
  type PwaHooks,
  STALE_RETRY_MS,
  start,
  UPDATE_WAIT_MS,
  type UpdatableRegistration,
} from "./pwa.ts";

const MIN = 60_000;

/** Fake-Umgebung: Ereignisse per `fire`, Aufrufe protokolliert in `calls` (Reihenfolge zählt) */
function fakeEnv(fields: Partial<PwaEnv> = {}) {
  const listeners = new Map<string, Set<() => void>>();
  const calls: string[] = [];
  let message: ((data: unknown) => void) | undefined;
  let visible = true;
  let now = 100 * MIN;
  const env: PwaEnv = {
    register: vi.fn(async () => undefined),
    listen: (type, fn) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
      return () => set.delete(fn);
    },
    onMessage: (fn) => {
      message = fn;
    },
    onControllerChange: () => () => undefined,
    visible: () => visible,
    online: () => true,
    now: () => now,
    reload: () => calls.push("reload"),
    markReady: () => calls.push("bereit"),
    ...fields,
  };
  return {
    env,
    calls,
    fire: (type: string) => {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    count: (type: string) => listeners.get(type)?.size ?? 0,
    message: (data: unknown) => message?.(data),
    setVisible: (v: boolean) => {
      visible = v;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const STAND = "2026-10-05T06:00:00+02:00";

/** Hooks der App: `refresh`, Toast und Statuszeile protokolliert; `last` kann der Test später ändern */
function hooks(calls: string[], last?: { at: number; stale: boolean }) {
  const state: { last: ReturnType<PwaHooks["lastLoad"]>; note: string; loaded: (() => void) | undefined } = {
    last: last && { ...last, generatedAt: STAND },
    note: "",
    loaded: undefined,
  };
  const api: PwaHooks = {
    lastLoad: () => state.last,
    onLoad: (fn) => {
      state.loaded = fn;
    },
    refresh: async () => {
      calls.push("refresh");
    },
    say: (text) => calls.push(`say: ${text}`),
    note: (text) => {
      state.note = text;
    },
  };
  /** `loadSiteData` ist fertig (wie `onSiteLoad` in site.ts): neuer Stand, dann der Rückruf */
  const finishLoad = (next: { at: number; stale: boolean }) => {
    state.last = { ...next, generatedAt: STAND };
    state.loaded?.();
  };
  return Object.assign(api, { state, finishLoad });
}

/** Registrierung mit `update()`, die optional einen neuen Service Worker findet */
function registration(calls: string[], found: "neu" | "nichts" | "fehler" = "nichts") {
  const reg: UpdatableRegistration = {
    installing: null,
    waiting: null,
    update: vi.fn(async () => {
      calls.push("update");
      if (found === "fehler") throw new TypeError("Failed to fetch");
      if (found === "neu") reg.installing = {};
    }),
  };
  return reg;
}

/** Wartet, bis alle Mikro-Tasks (und Fake-Timer-Ketten) durch sind */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("start (Plan 0011, E5)", () => {
  it("markiert die Seite als bereit und registriert den Service Worker", async () => {
    const f = fakeEnv();
    await start(hooks(f.calls), f.env);
    expect(f.calls).toEqual(["bereit"]);
    expect(f.env.register).toHaveBeenCalledOnce();
  });

  it("register() liefert undefined (Playwright „block“), ready käme nie: kein Hänger, Frische lädt nur Daten neu", async () => {
    const f = fakeEnv({ register: vi.fn(async () => undefined) });
    const at = 100 * MIN;
    await start(hooks(f.calls, { at, stale: false }), f.env);
    f.advance(FRESH_AFTER_MS + 1);
    f.fire("visibilitychange");
    await settle();
    expect(f.calls).toEqual(["bereit", "refresh"]);
  });

  it("register() wirft: trotzdem Frische und Nachrichten", async () => {
    const f = fakeEnv({ register: vi.fn(async () => Promise.reject(new Error("SecurityError"))) });
    await start(hooks(f.calls, { at: 0, stale: true }), f.env);
    f.fire("online");
    await settle();
    f.message({ type: "ics-offline" });
    expect(f.calls).toEqual(["bereit", "refresh", `say: ${ICS_OFFLINE}`]);
  });

  it("Nachricht ics-offline vom Service Worker → Hinweis; andere Nachrichten nicht", async () => {
    const f = fakeEnv();
    await start(hooks(f.calls), f.env);
    f.message({ type: "anders" });
    f.message("ics-offline");
    f.message(null);
    f.message({ type: "ics-offline" });
    expect(f.calls).toEqual(["bereit", `say: ${ICS_OFFLINE}`]);
  });

  it("das Aufräumen entfernt die Listener", async () => {
    const f = fakeEnv();
    const stop = await start(hooks(f.calls), f.env);
    expect(f.count("visibilitychange")).toBe(1);
    expect(f.count("online")).toBe(1);
    stop();
    expect(f.count("visibilitychange")).toBe(0);
    expect(f.count("online")).toBe(0);
  });
});

describe("Frische-Anlass (Plan 0011, E4a)", () => {
  async function started(last: { at: number; stale: boolean } | undefined, found?: "neu" | "nichts" | "fehler") {
    const f = fakeEnv();
    const controller = new Set<() => void>();
    const reg = registration(f.calls, found);
    f.env.register = vi.fn(async () => reg);
    f.env.onControllerChange = (fn) => {
      controller.add(fn);
      return () => controller.delete(fn);
    };
    await start(hooks(f.calls, last), f.env);
    f.calls.length = 0;
    return {
      ...f,
      reg,
      controllerChange: () => {
        for (const fn of controller) fn();
      },
      listening: () => controller.size,
    };
  }

  it(`sichtbar und letzter Abruf älter als ${FRESH_AFTER_MS / MIN} Min.: zuerst update(), dann Daten neu`, async () => {
    const f = await started({ at: 100 * MIN, stale: false });
    f.advance(FRESH_AFTER_MS + 1);
    f.fire("visibilitychange");
    await settle();
    expect(f.calls).toEqual(["update", "refresh"]);
  });

  it("genau an der Schwelle und jünger: kein Anlass", async () => {
    const f = await started({ at: 100 * MIN, stale: false });
    f.advance(FRESH_AFTER_MS);
    f.fire("visibilitychange");
    await settle();
    expect(f.calls).toEqual([]);
  });

  it("unsichtbar (in den Hintergrund) oder ohne erfolgreichen Abruf: kein Anlass", async () => {
    const f = await started({ at: 100 * MIN, stale: false });
    f.advance(2 * FRESH_AFTER_MS);
    f.setVisible(false);
    f.fire("visibilitychange");
    const g = await started(undefined);
    g.advance(2 * FRESH_AFTER_MS);
    g.fire("visibilitychange");
    g.fire("online");
    await settle();
    expect([...f.calls, ...g.calls]).toEqual([]);
  });

  it("wieder online nach einem Offline-Abruf: Anlass; nach einem frischen Abruf nicht", async () => {
    const stale = await started({ at: 100 * MIN, stale: true });
    stale.fire("online");
    await settle();
    expect(stale.calls).toEqual(["update", "refresh"]);
    const fresh = await started({ at: 100 * MIN, stale: false });
    fresh.fire("online");
    await settle();
    expect(fresh.calls).toEqual([]);
  });

  it("neuer Service Worker wird aktiv (controllerchange): Seite lädt neu, statt Daten zu tauschen", async () => {
    const f = await started({ at: 0, stale: true }, "neu");
    f.fire("online");
    await settle();
    expect(f.calls).toEqual(["update"]);
    f.controllerChange();
    await settle();
    expect(f.calls).toEqual(["update", "reload"]);
    expect(f.listening()).toBe(0);
  });

  it(`neuer Service Worker, aber kein controllerchange binnen ${UPDATE_WAIT_MS / 1000} s: Daten neu, kein Neuladen`, async () => {
    const f = await started({ at: 0, stale: true }, "neu");
    f.fire("online");
    await vi.advanceTimersByTimeAsync(UPDATE_WAIT_MS);
    expect(f.calls).toEqual(["update", "refresh"]);
  });

  it("controllerchange kommt später: gemerkt, das nächste Sichtbarwerden lädt neu (Arch-Review, H10)", async () => {
    const f = await started({ at: 100 * MIN, stale: false }, "neu");
    f.advance(FRESH_AFTER_MS + 1);
    f.fire("visibilitychange");
    await vi.advanceTimersByTimeAsync(UPDATE_WAIT_MS);
    expect(f.calls).toEqual(["update", "refresh"]);
    f.controllerChange();
    await settle();
    expect(f.calls, "nie mitten in der Bedienung").toEqual(["update", "refresh"]);
    expect(f.listening()).toBe(0);
    f.setVisible(false);
    f.fire("visibilitychange");
    expect(f.calls).toEqual(["update", "refresh"]);
    f.setVisible(true);
    f.fire("visibilitychange");
    await settle();
    expect(f.calls).toEqual(["update", "refresh", "reload"]);
  });

  it("ohne neuen Service Worker: kein Neuladen, auch wenn später controllerchange käme", async () => {
    const f = await started({ at: 0, stale: true }, "nichts");
    f.fire("online");
    await settle();
    f.controllerChange();
    await settle();
    expect(f.calls).toEqual(["update", "refresh"]);
  });

  it("update() scheitert (offline): Daten trotzdem neu", async () => {
    const f = await started({ at: 0, stale: true }, "fehler");
    f.fire("online");
    await settle();
    expect(f.calls).toEqual(["update", "refresh"]);
  });

  it("zwei Anlässe kurz nacheinander: ein Durchlauf", async () => {
    const f = await started({ at: 0, stale: true }, "neu");
    f.fire("online");
    f.advance(2 * FRESH_AFTER_MS);
    f.fire("visibilitychange");
    await vi.advanceTimersByTimeAsync(UPDATE_WAIT_MS);
    expect(f.calls).toEqual(["update", "refresh"]);
  });
});

const UA = {
  pixel:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1",
  // iPadOS meldet sich als Mac; nur die Touch-Punkte verraten es
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15",
  desktop: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
};

function installEnv(fields: Partial<InstallEnv> = {}) {
  let prompt: ((e: PromptEvent) => void) | undefined;
  let installed: (() => void) | undefined;
  const env: InstallEnv = {
    standalone: () => false,
    userAgent: UA.desktop,
    maxTouchPoints: 0,
    onPrompt: (fn) => {
      prompt = fn;
    },
    onInstalled: (fn) => {
      installed = fn;
    },
    ...fields,
  };
  return { env, offer: (e: PromptEvent) => prompt?.(e), installed: () => installed?.() };
}

/** Synthetisches beforeinstallprompt wie im E2E (E6) */
function promptEvent(outcome: "accepted" | "dismissed") {
  const calls: string[] = [];
  const event: PromptEvent = {
    preventDefault: () => calls.push("preventDefault"),
    prompt: async () => {
      calls.push("prompt");
    },
    userChoice: Promise.resolve({ outcome }),
  };
  return { event, calls };
}

describe("Installationszustand (Plan 0011, E7)", () => {
  it("läuft als App (display-mode bzw. navigator.standalone) geht allem vor", () => {
    const { env, offer } = installEnv({ standalone: () => true, userAgent: UA.iphone });
    const store = createInstallStore(env);
    offer(promptEvent("accepted").event);
    expect(store.state()).toBe("app");
  });

  it("iPhone und iPadOS (Mac-UA mit Touch) → ios; Mac ohne Touch nicht", () => {
    expect(createInstallStore(installEnv({ userAgent: UA.iphone, maxTouchPoints: 5 }).env).state()).toBe("ios");
    expect(createInstallStore(installEnv({ userAgent: UA.ipad, maxTouchPoints: 5 }).env).state()).toBe("ios");
    expect(createInstallStore(installEnv({ userAgent: UA.ipad, maxTouchPoints: 0 }).env).state()).toBe("keine");
  });

  it("Android ohne Angebot → Browser-Menü; Desktop ohne Angebot → ausgeblendet", () => {
    expect(createInstallStore(installEnv({ userAgent: UA.pixel }).env).state()).toBe("menue");
    expect(createInstallStore(installEnv().env).state()).toBe("keine");
  });

  it("beforeinstallprompt wird gemerkt (preventDefault) und gemeldet", () => {
    const { env, offer } = installEnv({ userAgent: UA.pixel });
    const store = createInstallStore(env);
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.state()));
    const { event, calls } = promptEvent("accepted");
    offer(event);
    expect(calls).toEqual(["preventDefault"]);
    expect(seen).toEqual(["angebot"]);
  });

  it("Tipp ruft prompt(); angenommen → installiert", async () => {
    const { env, offer } = installEnv({ userAgent: UA.pixel });
    const store = createInstallStore(env);
    const { event, calls } = promptEvent("accepted");
    offer(event);
    await store.prompt();
    expect(calls).toEqual(["preventDefault", "prompt"]);
    expect(store.state()).toBe("installiert");
  });

  it("abgelehnt: Das Angebot ist verbraucht (Chrome erlaubt prompt() nur einmal) → Browser-Menü", async () => {
    const { env, offer } = installEnv({ userAgent: UA.pixel });
    const store = createInstallStore(env);
    offer(promptEvent("dismissed").event);
    await store.prompt();
    expect(store.state()).toBe("menue");
    await store.prompt();
    expect(store.state()).toBe("menue");
  });

  it("prompt() scheitert: kein Fehler nach außen, das Angebot ist weg, die Oberfläche erfährt es (Arch-Review 0022, m7)", async () => {
    const { env, offer } = installEnv({ userAgent: UA.pixel });
    const store = createInstallStore(env);
    const seen: string[] = [];
    offer({
      preventDefault: () => {},
      prompt: () => Promise.reject(new Error("NotAllowedError")),
      userChoice: new Promise(() => {}),
    });
    store.subscribe(() => seen.push(store.state()));
    await expect(store.prompt()).resolves.toBeUndefined();
    expect(store.state()).toBe("menue");
    expect(seen).toEqual(["menue"]);
  });

  it("appinstalled (auch über das Browser-Menü) → installiert, Abmelden beendet die Meldungen", () => {
    const { env, offer, installed } = installEnv({ userAgent: UA.pixel });
    const store = createInstallStore(env);
    let count = 0;
    const off = store.subscribe(() => {
      count += 1;
    });
    offer(promptEvent("accepted").event);
    installed();
    expect(store.state()).toBe("installiert");
    off();
    installed();
    expect(count).toBe(2);
  });
});

describe("Statuszeile „Offline – Stand vom …“ (E4; seit dem Arch-Review lazy, Plan 0011, E5)", () => {
  it("Text: Tag des Datenstands in Berlin", () => {
    expect(offlineNote("2026-10-04T23:30:00Z")).toBe("Offline – Stand vom 5.10.");
    expect(offlineNote(STAND)).toBe("Offline – Stand vom 5.10.");
  });

  it("start setzt die Zeile nach einem Offline-Abruf, sonst leer", async () => {
    const offline = hooks([], { at: 0, stale: true });
    await start(offline, fakeEnv().env);
    expect(offline.state.note).toBe("Offline – Stand vom 5.10.");
    const online = hooks([], { at: 0, stale: false });
    await start(online, fakeEnv().env);
    expect(online.state.note).toBe("");
  });

  it("nach dem Frische-Anlass gilt der neue Abruf: Zeile verschwindet", async () => {
    const f = fakeEnv();
    const h = hooks(f.calls, { at: 0, stale: true });
    const refresh = h.refresh;
    h.refresh = async () => {
      await refresh();
      h.state.last = { at: 1, stale: false, generatedAt: STAND };
    };
    await start(h, f.env);
    f.fire("online");
    await settle();
    expect(h.state.note).toBe("");
  });
});

describe(`stale trotz Netz (5-s-Zeitlimit): ein Frische-Anlass nach ${STALE_RETRY_MS / 1000} s (Arch-Review, H5)`, () => {
  it("online und stale: nach der Wartezeit genau ein Anlass", async () => {
    const f = fakeEnv();
    await start(hooks(f.calls, { at: 0, stale: true }), f.env);
    await vi.advanceTimersByTimeAsync(STALE_RETRY_MS - 1);
    expect(f.calls).toEqual(["bereit"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.calls).toEqual(["bereit", "refresh"]);
    await vi.advanceTimersByTimeAsync(10 * STALE_RETRY_MS);
    expect(f.calls).toEqual(["bereit", "refresh"]);
  });

  it("offline (das Ereignis online kommt noch) oder nicht stale: kein Anlass; Aufräumen stoppt den Timer", async () => {
    const offline = fakeEnv({ online: () => false });
    await start(hooks(offline.calls, { at: 0, stale: true }), offline.env);
    const fresh = fakeEnv();
    await start(hooks(fresh.calls, { at: 0, stale: false }), fresh.env);
    const stopped = fakeEnv();
    const stop = await start(hooks(stopped.calls, { at: 0, stale: true }), stopped.env);
    stop();
    await vi.advanceTimersByTimeAsync(2 * STALE_RETRY_MS);
    expect([...offline.calls, ...fresh.calls, ...stopped.calls]).toEqual(["bereit", "bereit", "bereit"]);
  });
});

describe("Daten kommen erst nach dem Start des Kerns (Browser-Review live, B1)", () => {
  it("die Zeile erscheint, sobald loadSiteData nach dem Start fertig wird", async () => {
    const f = fakeEnv();
    const h = hooks(f.calls);
    await start(h, f.env);
    expect(h.state.note).toBe("");
    h.finishLoad({ at: 1, stale: true });
    expect(h.state.note).toBe("Offline – Stand vom 5.10.");
    h.finishLoad({ at: 2, stale: false });
    expect(h.state.note).toBe("");
  });

  it("H5: Kopie trotz Netz kommt nach dem Start → der Wiederholer wird trotzdem geplant, einmal", async () => {
    const f = fakeEnv();
    const h = hooks(f.calls);
    await start(h, f.env);
    h.finishLoad({ at: 1, stale: true });
    await vi.advanceTimersByTimeAsync(STALE_RETRY_MS);
    expect(f.calls).toEqual(["bereit", "refresh"]);
    // der Anlass liefert wieder eine Kopie: kein zweiter Wiederholer (einmal je Seite)
    h.finishLoad({ at: 2, stale: true });
    await vi.advanceTimersByTimeAsync(10 * STALE_RETRY_MS);
    expect(f.calls).toEqual(["bereit", "refresh"]);
  });
});
