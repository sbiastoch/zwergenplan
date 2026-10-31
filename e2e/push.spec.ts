/**
 * Wöchentliche Push-Nachricht (Plan 0017, E6, E7, E10; ADR 0014): Push-Teil im Abschnitt „Als App“, Spiegeln in den
 * Geräte-Speicher und der Zuschnitt im Service Worker. Nur Chromium (`pixel-7`, `desktop`) mit dem neuen
 * Headless-Modus (`channel: "chromium"`): Die Headless-Shell verweigert Benachrichtigungen immer (Plan 0017,
 * „Umsetzung“, Schritt 4).
 *
 * - Push-Fähigkeit: echter Service Worker, Erlaubnis per `grantPermissions`. Das Abonnieren selbst stubbt ein
 *   Init-Skript (`PushManager.prototype`), denn ein echtes Abo bräuchte den Push-Dienst von Google.
 * - Der Push-Worker ist gemockt (`pushWorker: "mock"`), die Requests stehen in `pushLog`.
 * - Zustellung per CDP (`ServiceWorker.deliverPushMessage`), gelesen über `registration.getNotifications()`.
 */
import type { BrowserContext, CDPSession, Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import {
  expectAccessible,
  expectMobileUx,
  expectNoHorizontalScroll,
  expectTextFits,
  setTextScale,
} from "./mobile-ux.ts";
import { ONBOARDING_FLAG } from "./onboarding-flag.ts";
import { goTo, intro } from "./onboarding-steps.ts";

// Der Tab „Anbieter“ zeigt die Anbieterkarte, Kacheln aus tests/fixtures/karte/ (Plan 0055, E8)
test.use({ tiles: "mock" });

test.use({ serviceWorkers: "allow", channel: "chromium", pushWorker: "mock" });
test.skip(process.env["ZWERGENPLAN_SW"] === "aus", "Notausgang aktiv: Build ohne Service Worker (README)");
test.skip(
  () => !["pixel-7", "desktop"].includes(test.info().project.name),
  "Push nur in Chromium (pixel-7, desktop); WebKit prüft der Browser-Review am iPhone",
);

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/e2e-geraet";
/** Fixture-„Jetzt“ als Versandzeitpunkt (Plan 0017, E10: `now` = `sentAt`) */
const SENT_AT = "2026-10-05T12:00:00+02:00";

const sheet = (page: Page) => page.getByRole("dialog", { name: "Kind und Einstellungen" });
const section = (page: Page) => sheet(page).getByRole("region", { name: "Als App" });
const pushSwitch = (page: Page) => section(page).getByRole("switch", { name: "Wöchentliche Push-Nachricht" });
/** Glocke eines Fixture-Anbieters im Tab „Anbieter“ (`fv3fpfp2`) */
const theaterBell = (page: Page) =>
  page.getByRole("button", { name: "Kleines Theater Beispiel (fiktiv) abonnieren", exact: true });
/** zwei Anbieter-Abos vor dem ersten Laden (Theater und Familientreff aus den Fixtures) */
async function presetProviders(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("zwergenplan.anbieter-merkliste", JSON.stringify(["fv3fpfp2", "b5nuus36"])),
  );
}
/** Verwaltung der Abos im Kind-Sheet (Plan 0054, E7) */
const aboList = (page: Page) => sheet(page).getByRole("region", { name: "Deine Abos" });

/** Fake-Push-Manager der Seite (der Service Worker bleibt echt); das Abo überlebt Neuladen über sessionStorage */
async function fakePushManager(page: Page) {
  await page.addInitScript((endpoint) => {
    const KEY = "__e2ePushSub";
    const make = (ep: string) => ({
      endpoint: ep,
      expirationTime: null,
      options: {},
      getKey: () => null,
      toJSON: () => ({ endpoint: ep, expirationTime: null, keys: { p256dh: "BTEST", auth: "QVVUSA" } }),
      unsubscribe: async () => {
        sessionStorage.removeItem(KEY);
        return true;
      },
    });
    PushManager.prototype.subscribe = async function subscribe() {
      sessionStorage.setItem(KEY, endpoint);
      return make(endpoint) as unknown as PushSubscription;
    };
    PushManager.prototype.getSubscription = async function getSubscription() {
      const ep = sessionStorage.getItem(KEY);
      return (ep ? make(ep) : null) as unknown as PushSubscription | null;
    };
  }, ENDPOINT);
}

/** Startseite laden, bis der Service Worker aktiv ist und die Seite kontrolliert (wie pwa.spec.ts) */
async function installed(page: Page, context: BrowserContext, path = "./") {
  await context.grantPermissions(["notifications"], { origin: new URL(test.info().project.use.baseURL ?? "").origin });
  await page.goto(path);
  // nicht auf eine Kachel warten: gefilterte Routen dieser Datei haben mit den Fixtures oft keinen Treffer
  await expect(page.getByRole("button", { name: /^Kind und Einstellungen/ })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

async function openKidSheet(page: Page) {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  await expect(sheet(page)).toBeVisible();
  await sheet(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await expect(page.locator("html")).toHaveAttribute("data-push", "bereit");
}

/** Geräte-Speicher (IndexedDB `zwergenplan`, Store `kv`) lesen bzw. setzen, wie Seite und Service Worker ihn sehen */
function readStore(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const open = indexedDB.open("zwergenplan", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("kv");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const store = open.result.transaction("kv").objectStore("kv");
          const out: Record<string, unknown> = {};
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (!c) return resolve(out);
            out[String(c.key)] = c.value;
            c.continue();
          };
        };
      }),
  );
}

function writeStore(page: Page, entries: Record<string, unknown>): Promise<void> {
  return page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("zwergenplan", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("kv");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("kv", "readwrite");
          const store = tx.objectStore("kv");
          store.clear();
          for (const [key, value] of Object.entries(data)) store.put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    entries,
  );
}

/** Angebots-IDs aus site.json, nach Titelanfang */
async function siteIds(page: Page): Promise<{ all: string[]; byTitle: (start: string) => string }> {
  const offers: { id: string; title: string }[] = await page.evaluate(async () => {
    const site = await (await fetch("data/site.json")).json();
    return site.offers.map((o: { id: string; title: string }) => ({ id: o.id, title: o.title }));
  });
  return {
    all: offers.map((o) => o.id),
    byTitle: (start) => {
      const found = offers.find((o) => o.title.startsWith(start));
      if (!found) throw new Error(`kein Angebot „${start}“`);
      return found.id;
    },
  };
}

/** CDP-Sitzung mit der ID der Registrierung (Chromium) */
async function cdpFor(page: Page, context: BrowserContext): Promise<{ cdp: CDPSession; registrationId: string }> {
  const cdp = await context.newCDPSession(page);
  const ids: string[] = [];
  cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
    for (const r of registrations) if (!r.isDeleted) ids.push(r.registrationId);
  });
  await cdp.send("ServiceWorker.enable");
  await expect.poll(() => ids.length).toBeGreaterThan(0);
  return { cdp, registrationId: ids[0] ?? "" };
}

function payload({ test: isTest = false, sentAt = SENT_AT }: { test?: boolean; sentAt?: string } = {}) {
  const base = test.info().project.use.baseURL ?? "";
  return {
    web_push: 8030,
    notification: {
      title: "Zwergenplan",
      body: "3 neue Angebote seit letztem Samstag",
      navigate: new URL("./?sortierung=neu", base).href,
      tag: "wochen-nachricht",
      lang: "de",
      data: isTest ? { sentAt, test: true } : { sentAt },
    },
    mutable: true,
  };
}

/**
 * Push zustellen und die angezeigte Nachricht lesen (danach geschlossen). Zählt dabei die Requests des Service
 * Workers auf `data/` (Privatsphäre: je Push genau einer auf site.json, ohne Query; ADR 0042).
 */
async function deliver(
  page: Page,
  context: BrowserContext,
  session: { cdp: CDPSession; registrationId: string },
  options: { test?: boolean; sentAt?: string } = {},
) {
  const requests: string[] = [];
  const onRequest = (req: { url: () => string; serviceWorker: () => unknown }) => {
    const url = new URL(req.url());
    if (req.serviceWorker() && url.pathname.includes("/data/")) requests.push(`${url.pathname}${url.search}`);
  };
  context.on("request", onRequest);
  await session.cdp.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(page.url()).origin,
    registrationId: session.registrationId,
    data: JSON.stringify(payload(options)),
  });
  const shown = await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.ready;
          return (await registration.getNotifications()).map((n) => ({
            title: n.title,
            body: n.body,
            navigate: (n.data as { navigate?: string } | null)?.navigate,
          }));
        }),
      // eine Wartezeit, keine Gate-Schwelle: unter Last (8 Worker) brauchte die Zustellung lokal bis ~20 s
      { timeout: 20_000 },
    )
    .toHaveLength(1)
    .then(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        const [n] = await registration.getNotifications();
        const result = {
          title: n?.title,
          body: n?.body,
          navigate: (n?.data as { navigate?: string } | null)?.navigate,
        };
        n?.close();
        return result;
      }),
    );
  context.off("request", onRequest);
  return { ...shown, requests: requests.sort() };
}

test.beforeEach(async ({ page }) => {
  await fakePushManager(page);
});

test("Anbieter-Glocke bei ausgeschaltetem Push: schaltet ihn ein und spiegelt; Verwaltung im Sheet (Plan 0054, E5–E7)", async ({
  page,
  context,
  pushLog,
}) => {
  await installed(page, context, "./?ansicht=anbieter");
  await expect(theaterBell(page)).toHaveAttribute("aria-pressed", "false");
  await theaterBell(page).click();
  await expect(theaterBell(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Anbieter abonniert – die wöchentliche Push-Nachricht ist jetzt an")).toBeVisible();
  // Push war aus: der Tipp hat ihn eingeschaltet wie der Schalter, genau ein POST /abo
  await expect.poll(() => pushLog.length).toBe(1);
  expect(pushLog[0]).toMatchObject({ method: "POST", path: "/abo" });
  await expect.poll(() => readStore(page)).toMatchObject({ endpoint: ENDPOINT, providers: ["fv3fpfp2"] });

  await openKidSheet(page);
  await expect(pushSwitch(page)).toHaveAttribute("aria-checked", "true");
  const item = aboList(page).getByRole("listitem");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("Kleines Theater Beispiel (fiktiv)");
  await aboList(page).getByRole("button", { name: "Abo Kleines Theater Beispiel (fiktiv) beenden" }).click();
  await expect(aboList(page).getByRole("listitem")).toHaveCount(0);
  // Der Knopf verschwindet mit der Zeile: Fokus auf der Überschrift, nicht auf <body> (Review 2, Nr. 3)
  await expect(aboList(page).getByRole("heading", { name: "Deine Abos" })).toBeFocused();
  // das offene Sheet spiegelt die Änderung
  await expect.poll(async () => (await readStore(page))["providers"]).toBeUndefined();
  await sheet(page).getByRole("button", { name: "Fertig" }).click();
  await expect(theaterBell(page)).toHaveAttribute("aria-pressed", "false");
  expect(pushLog).toHaveLength(1);
});

test("Anbieter-Glocke mit Push an: spiegelt sofort, ohne das Kind-Sheet (Plan 0054, E4)", async ({
  page,
  context,
  pushLog,
}) => {
  await installed(page, context, "./?ansicht=anbieter");
  await openKidSheet(page);
  await pushSwitch(page).click();
  await expect(pushSwitch(page)).toHaveAttribute("aria-checked", "true");
  await sheet(page).getByRole("button", { name: "Fertig" }).click();
  await expect(sheet(page)).toBeHidden();

  const bell = page.getByRole("button", { name: "Kleines Theater Beispiel (fiktiv) abonnieren", exact: true });
  await bell.click();
  await expect(page.getByText("Anbieter abonniert – Neues kommt in die wöchentliche Push-Nachricht")).toBeVisible();
  await expect.poll(async () => (await readStore(page))["providers"]).toEqual(["fv3fpfp2"]);
  await bell.click();
  await expect(page.getByText("Abo beendet")).toBeVisible();
  await expect.poll(async () => (await readStore(page))["providers"]).toBeUndefined();
  // nur das Einschalten sprach mit dem Push-Worker
  expect(pushLog).toHaveLength(1);
});

test.describe("Onboarding (Plan 0033, E8)", () => {
  test.use({ onboarding: "neu" });

  test("Schalter im letzten Schritt: vorher kein Request, nach dem Tipp genau ein POST /abo", async ({
    page,
    context,
    pushLog,
  }) => {
    test.skip(test.info().project.name !== "pixel-7", "App-Schritt mit Schalter zuletzt: pixel-7");
    await fakePushManager(page);
    await context.grantPermissions(["notifications"], {
      origin: new URL(test.info().project.use.baseURL ?? "").origin,
    });
    await page.goto("./");
    const intro = page.getByRole("dialog", { name: "Einführung" });
    const title = intro.getByRole("heading", { level: 2 });
    await expect(title).toHaveText(/^Schritt 1 von 4: /);
    for (let n = 2; n <= 4; n++) {
      await intro.locator(".onb-foot .btn.primary").click();
      await expect(title).toHaveText(new RegExp(`^Schritt ${n} von 4: `));
    }
    const toggle = intro.getByRole("switch", { name: "Wöchentliche Push-Nachricht" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(toggle).toBeEnabled();
    expect(pushLog, "ohne Tipp kein Request an den Push-Worker").toEqual([]);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(intro.getByRole("status")).toHaveText("An. Die erste kommt in den nächsten Tagen.");
    expect(pushLog).toEqual([
      {
        method: "POST",
        path: "/abo",
        body: { endpoint: ENDPOINT, expirationTime: null, keys: { p256dh: "BTEST", auth: "QVVUSA" } },
      },
    ]);
  });
});

test("ohne Abo erklärt die Verwaltung den Weg; keine Glocke an der Schnellfilter-Zeile (Plan 0054, E7, Nachtrag A)", async ({
  page,
  context,
}) => {
  await installed(page, context, "./?kat=musik&format=kurs");
  await expect(page.getByRole("group", { name: "Schnellfilter" })).toBeVisible();
  await expect(page.getByRole("button", { name: /abonnieren$/ })).toHaveCount(0);
  await openKidSheet(page);
  await expect(aboList(page)).toContainText("Noch keine. Tippe auf die Glocke bei einem Anbieter.");
});

test("Einschalten meldet nur das Abo; der Geräte-Speicher folgt dem offenen Sheet; Ausschalten räumt auf (E6)", async ({
  page,
  context,
  pushLog,
}) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__e2eSeeded")) return;
    sessionStorage.setItem("__e2eSeeded", "1");
    localStorage.setItem("zwergenplan.geburtsdatum", "2025-08-05");
    localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof");
  });
  await installed(page, context, "./?kat=bewegung");
  await openKidSheet(page);
  await pushSwitch(page).click();
  await expect(pushSwitch(page)).toHaveAttribute("aria-checked", "true");
  await expect(section(page).getByRole("status")).toHaveText("Wöchentliche Push-Nachricht ist an.");
  expect(pushLog).toEqual([
    {
      method: "POST",
      path: "/abo",
      body: { endpoint: ENDPOINT, expirationTime: null, keys: { p256dh: "BTEST", auth: "QVVUSA" } },
    },
  ]);
  await expect
    .poll(() => readStore(page))
    .toEqual({
      endpoint: ENDPOINT,
      birthDate: "2025-08-05",
    });
  await expect(section(page)).toContainText(/Geräte-Kennung: [0-9a-f]{8}/);

  // Änderungen im offenen Sheet kommen sofort an (Runde 3 M3)
  await sheet(page).getByLabel("Stadtteil").selectOption("st-johannis");
  await sheet(page).getByLabel("Geburtsdatum").fill("");
  await expect.poll(() => readStore(page)).toEqual({ endpoint: ENDPOINT });

  await pushSwitch(page).click();
  await expect(pushSwitch(page)).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => readStore(page)).toEqual({});
  expect(pushLog.at(-1)).toEqual({ method: "DELETE", path: "/abo", body: { endpoint: ENDPOINT } });
  // Der Startpunkt gehört dem Nutzer und bleibt im localStorage, kommt aber nie in den Geräte-Speicher (ADR 0042)
  expect(await page.evaluate(() => localStorage.getItem("zwergenplan.entfernung-ab"))).toBe("st-johannis");
});

test.describe("Onboarding spiegelt am Ende einmal, ohne Request (Plan 0035, E9)", () => {
  /** Bestandsnutzer mit Angaben, nur beim ersten Laden (Muster oben) */
  async function seed(page: Page) {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("__e2eSeeded")) return;
      sessionStorage.setItem("__e2eSeeded", "1");
      localStorage.setItem("zwergenplan.geburtsdatum", "2025-08-05");
      localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof");
    });
  }

  /** altes Flag „1“ setzen und neu laden: Das Onboarding erscheint (Plan 0035, E4); neues Alter und neuer Stadtteil */
  async function onboardingWithNewValues(page: Page) {
    await page.evaluate((key) => localStorage.setItem(key, "1"), ONBOARDING_FLAG.key);
    await page.reload();
    await expect(intro(page)).toBeVisible();
    await goTo(page, "alter");
    await intro(page).getByLabel("Geburtsdatum").fill("01.03.2026");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("zwergenplan.geburtsdatum"))).toBe("2026-03-01");
    await goTo(page, "weg");
    await intro(page).getByRole("combobox", { name: "Stadtteil" }).selectOption("st-johannis");
    await intro(page).getByRole("button", { name: "Überspringen" }).click();
    await expect(intro(page)).toHaveCount(0);
  }

  test("mit Abo: neue Werte im Geräte-Speicher, kein Request an den Push-Worker", async ({
    page,
    context,
    pushLog,
  }) => {
    await seed(page);
    await installed(page, context);
    await openKidSheet(page);
    await pushSwitch(page).click();
    await expect(pushSwitch(page)).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => readStore(page)).toEqual({ endpoint: ENDPOINT, birthDate: "2025-08-05" });
    const requests = pushLog.length;

    await onboardingWithNewValues(page);
    await expect.poll(() => readStore(page)).toEqual({ endpoint: ENDPOINT, birthDate: "2026-03-01" });
    expect(pushLog.slice(requests), "kein Request seit dem Neuladen").toEqual([]);
  });

  test("ohne Abo: Geräte-Speicher bleibt leer", async ({ page, context, pushLog }) => {
    await seed(page);
    await installed(page, context);
    await onboardingWithNewValues(page);
    // dem Cleanup Zeit geben: Er liest das Abo asynchron
    await page.waitForTimeout(300);
    expect(await readStore(page)).toEqual({});
    expect(pushLog).toEqual([]);
  });
});

test("Zuschnitt im Service Worker: neu, nichts Neues, Testversand, Anbieter; nur site.json, für alle gleich (E10)", async ({
  page,
  context,
}) => {
  await installed(page, context);
  const ids = await siteIds(page);
  const unseen = [ids.byTitle("Musikgarten"), ids.byTitle("Krabbelreime")];
  const seen = ids.all.filter((id) => !unseen.includes(id));
  const session = await cdpFor(page, context);
  // Ziel jedes Tipps: „Neu eingestellt“ (Plan 0043, E6; ADR 0014, Nachtrag)
  const startPage = new URL("./?sortierung=neu", test.info().project.use.baseURL ?? "").href;
  // je Push genau ein Request, keine Wegzeit-Tabelle, mit und ohne Startpunkt und Abo gleich (ADR 0042, Review M4)
  const SAME_REQUESTS = ["/data/site.json"];

  // ohne Abos und Alter: alle neuen
  await writeStore(page, { seenIds: seen });
  const first = await deliver(page, context, session);
  expect(first).toEqual({
    title: "2 neue Angebote im Zwergenplan",
    body: "Krabbelreime & Fingerspiele und Musikgarten 1 (1–2 Jahre)",
    navigate: startPage,
    requests: SAME_REQUESTS,
  });

  // danach kennt das Gerät alles, und 8 Tage später sind beide nur noch „vorige Woche“ eingestellt: nichts Neues
  // (Plan 0043, E3: mit `listedAt` entscheidet die Woche, nicht die gesehenen IDs)
  await expect
    .poll(async () => ((await readStore(page))["seenIds"] as string[] | undefined)?.length)
    .toBe(ids.all.length);
  const second = await deliver(page, context, session, { sentAt: "2026-10-13T12:00:00+02:00" });
  expect(second.title).toBe("Diese Woche nichts Neues");
  expect(second.body).toMatch(/^\d+ Angebote? in den nächsten 7 Tagen\.$/);

  // Testversand: zugeschnitten, schreibt aber nichts
  await writeStore(page, { seenIds: seen, birthDate: "2025-08-05" });
  const probe = await deliver(page, context, session, { test: true });
  expect(probe.title).toBe("2 neue Angebote passen zu 14 Monaten");
  expect((await readStore(page))["seenIds"]).toEqual(seen);

  // Anbieter-Abo (Plan 0054, E2): nur die neuen Angebote dieses Anbieters, dieselben Requests
  const provider: string = await page.evaluate(async () => {
    const site = await (await fetch("data/site.json")).json();
    return site.offers.find((o: { title: string }) => o.title.startsWith("Musikgarten")).providerId;
  });
  // dazu die Altlast Startpunkt und Such-Abo im Geräte-Speicher: Sie zählt nicht und wird gelöscht (Review M1)
  await writeStore(page, { seenIds: seen, providers: [provider], origin: "gostenhof", searches: '["kat=buecher"]' });
  const withProvider = await deliver(page, context, session);
  expect(withProvider).toEqual({
    title: "1 neues Angebot von deinen Anbietern",
    body: "Musikgarten 1 (1–2 Jahre)",
    navigate: startPage,
    requests: SAME_REQUESTS,
  });
  const store = await readStore(page);
  expect(store).not.toHaveProperty("origin");
  expect(store).not.toHaveProperty("searches");

  // ohne gesehene IDs (erste Nachricht nach dem Einschalten): zugeschnitten über `listedAt` (Plan 0043, E3)
  await writeStore(page, { birthDate: "2025-08-05" });
  const firstEver = await deliver(page, context, session);
  expect(firstEver.title).toBe("2 neue Angebote passen zu 14 Monaten");
  await expect
    .poll(async () => ((await readStore(page))["seenIds"] as string[] | undefined)?.length)
    .toBe(ids.all.length);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Push-Teil mit zwei Anbieter-Abos: Gates (${colorScheme === "light" ? "hell" : "dunkel"}, E7)`, async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ colorScheme });
    await presetProviders(page);
    await installed(page, context);
    await openKidSheet(page);
    await expect(aboList(page).getByRole("listitem")).toHaveCount(2);
    await expectMobileUx(page);
  });
}

/**
 * Weitere Zustände der Matrix (E7; Arch-Review 0017, M3), je hell, dunkel und 320 px/200 %:
 * - „verweigert“: `Notification.permission` gestubbt auf „denied“;
 * - „kein-push“: ohne `PushManager` (Android-UA, Installationszustand „menue“: Hinweis);
 * - „an“: eingeschaltet, mit Geräte-Kennung;
 * - „angebot“: Installationsknopf und Push-Teil im selben Abschnitt.
 */
type MatrixState = "verweigert" | "kein-push" | "an" | "angebot";

const MATRIX: Record<MatrixState, { title: string; project?: string; expect: (page: Page) => Promise<void> }> = {
  verweigert: {
    title: "Benachrichtigungen abgelehnt: Schalter gesperrt, Hinweis",
    expect: async (page) => {
      await expect(pushSwitch(page)).toBeDisabled();
      await expect(section(page)).toContainText("In den Einstellungen des Geräts erlaubt?");
    },
  },
  "kein-push": {
    title: "Browser ohne Push: Hinweis statt Schalter",
    // Der Hinweis gehört zur Installationshilfe; am Desktop ohne Angebot bliebe der Abschnitt leer
    project: "pixel-7",
    expect: async (page) => {
      await expect(section(page)).toContainText("Dieser Browser kann keine Benachrichtigungen.");
      await expect(pushSwitch(page)).toHaveCount(0);
    },
  },
  an: {
    title: "eingeschaltet: Geräte-Kennung",
    expect: async (page) => {
      await pushSwitch(page).click();
      await expect(pushSwitch(page)).toHaveAttribute("aria-checked", "true");
      await expect(section(page)).toContainText(/Geräte-Kennung: [0-9a-f]{8}/);
    },
  },
  angebot: {
    title: "Browser bietet die Installation an: Knopf und Push-Teil",
    expect: async (page) => {
      // Plan 0022: Der Knopf steht im Fuß des Kind-Sheets über „Fertig“, nicht mehr im Abschnitt
      const sheetFoot = page.getByRole("dialog", { name: "Kind und Einstellungen" }).locator(".sheetfoot");
      await expect(sheetFoot.getByRole("button", { name: "Zum Startbildschirm hinzufügen" })).toBeVisible();
      await expect(pushSwitch(page)).toBeVisible();
    },
  },
};

async function openInState(page: Page, context: BrowserContext, state: MatrixState) {
  if (state === "verweigert") {
    await page.addInitScript(() => {
      Object.defineProperty(Notification, "permission", { get: () => "denied" });
    });
  }
  if (state === "kein-push") {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, "PushManager");
    });
  }
  await installed(page, context);
  if (state === "angebot") {
    await expect(page.locator("html")).toHaveAttribute("data-pwa", "bereit");
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "dismissed" }) });
      window.dispatchEvent(event);
    });
  }
  await openKidSheet(page);
  await MATRIX[state].expect(page);
}

for (const state of Object.keys(MATRIX) as MatrixState[]) {
  const onlyIn = () => {
    const project = MATRIX[state].project;
    test.skip(project !== undefined && test.info().project.name !== project, `Zustand nur in ${project}`);
  };
  for (const colorScheme of ["light", "dark"] as const) {
    test(`${MATRIX[state].title}: Gates (${colorScheme === "light" ? "hell" : "dunkel"}, E7)`, async ({
      page,
      context,
    }) => {
      onlyIn();
      await page.emulateMedia({ colorScheme });
      await openInState(page, context, state);
      await expectMobileUx(page);
    });
  }
  test(`${MATRIX[state].title}: 320 px und 200 % (E7)`, async ({ page, context }) => {
    onlyIn();
    await page.setViewportSize({ width: 320, height: 640 });
    await openInState(page, context, state);
    await setTextScale(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2 });
    await expectAccessible(page);
  });
}

test("Push-Teil mit zwei Anbieter-Abos: 320 px und 200 % (E7; Plan 0054, Review 2, Nr. 12)", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await presetProviders(page);
  await installed(page, context);
  await openKidSheet(page);
  await expect(aboList(page).getByRole("listitem")).toHaveCount(2);
  await setTextScale(page, 2);
  await expectNoHorizontalScroll(page);
  await expectTextFits(page, { scale: 2 });
  await expectAccessible(page);
});
