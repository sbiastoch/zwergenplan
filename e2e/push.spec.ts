/**
 * Wochen-Nachricht (Plan 0017, E6, E7, E10; ADR 0014): Push-Teil im Abschnitt „Als App“, Spiegeln in den
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
const pushSwitch = (page: Page) => section(page).getByRole("switch", { name: "Wochen-Nachricht" });
const subscribeButton = (page: Page) => section(page).getByRole("button", { name: "Suche abonnieren" });

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

function payload({ test: isTest = false }: { test?: boolean } = {}) {
  const base = test.info().project.use.baseURL ?? "";
  return {
    web_push: 8030,
    notification: {
      title: "Zwergenplan",
      body: "3 neue Angebote seit letztem Samstag",
      navigate: new URL("./", base).href,
      tag: "wochen-nachricht",
      lang: "de",
      data: isTest ? { sentAt: SENT_AT, test: true } : { sentAt: SENT_AT },
    },
    mutable: true,
  };
}

/**
 * Push zustellen und die angezeigte Nachricht lesen (danach geschlossen). Zählt dabei die Requests des Service
 * Workers auf `data/` (Privatsphäre: je Push genau einer auf site.json und wegzeit.json, ohne Query).
 */
async function deliver(
  page: Page,
  context: BrowserContext,
  session: { cdp: CDPSession; registrationId: string },
  options: { test?: boolean } = {},
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

test("Aktuelle Suche abonnieren und entfernen: Statuszeile, Liste, Fokus (E7)", async ({ page, context, pushLog }) => {
  await installed(page, context, "./?kat=musik&wegzeit=20");
  await openKidSheet(page);
  await expect(pushSwitch(page)).toHaveAttribute("aria-checked", "false");
  await expect(section(page)).toContainText("Musik & Singen · bis 20 Min.");
  await expect(section(page)).toContainText("Noch keine. Bis dahin kommen alle neuen Angebote.");

  await subscribeButton(page).click();
  await expect(subscribeButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(section(page).getByText("Abonniert", { exact: true })).toBeVisible();
  await expect(section(page).getByRole("status")).toHaveText(
    "Abonniert. Die Wegzeit wirkt in der Nachricht ab einem Startpunkt.",
  );
  const item = section(page).getByRole("listitem");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("Wegzeit wirkt ab einem Startpunkt");
  await expect(section(page)).toContainText("Kommt erst mit eingeschalteter Wochen-Nachricht.");
  expect(await page.evaluate(() => localStorage.getItem("zwergenplan.such-abos"))).toBe('["kat=musik&wegzeit=20"]');

  await section(page).getByRole("button", { name: "Such-Abo Musik & Singen · bis 20 Min. entfernen" }).click();
  await expect(section(page).getByRole("listitem")).toHaveCount(0);
  await expect(section(page).getByRole("status")).toHaveText("Such-Abo entfernt.");
  // Der Knopf verschwindet mit der Zeile: Fokus auf der Überschrift der Liste, nicht auf <body> (Runde 3 M2)
  await expect(section(page).getByRole("heading", { name: "Deine Such-Abos" })).toBeFocused();
  await expect(subscribeButton(page)).toHaveAttribute("aria-pressed", "false");
  expect(pushLog).toEqual([]);
});

test("ohne Filter erklärt der Abschnitt den Weg, statt einen Knopf zu zeigen (E7)", async ({ page, context }) => {
  await installed(page, context);
  await openKidSheet(page);
  await expect(section(page)).toContainText("Wähle im Filter, was dich interessiert, und abonniere die Suche hier.");
  await expect(subscribeButton(page)).toHaveCount(0);
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
    localStorage.setItem("zwergenplan.such-abos", '["kat=musik"]');
  });
  await installed(page, context, "./?kat=natur");
  await openKidSheet(page);
  await pushSwitch(page).click();
  await expect(pushSwitch(page)).toHaveAttribute("aria-checked", "true");
  await expect(section(page).getByRole("status")).toHaveText("Wochen-Nachricht ist an.");
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
      origin: "gostenhof",
      searches: '["kat=musik"]',
    });
  await expect(section(page)).toContainText(/Geräte-Kennung: [0-9a-f]{8}/);

  // Änderungen im offenen Sheet kommen sofort an (Runde 3 M3)
  await sheet(page).getByLabel("Stadtteil").selectOption("st-johannis");
  await sheet(page).getByLabel("Geburtsdatum").fill("");
  await subscribeButton(page).click();
  await expect
    .poll(() => readStore(page))
    .toEqual({ endpoint: ENDPOINT, origin: "st-johannis", searches: '["kat=musik","kat=natur"]' });

  await pushSwitch(page).click();
  await expect(pushSwitch(page)).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => readStore(page)).toEqual({});
  expect(pushLog.at(-1)).toEqual({ method: "DELETE", path: "/abo", body: { endpoint: ENDPOINT } });
  // Die Such-Abos gehören dem Nutzer, nicht dem Push
  expect(await page.evaluate(() => localStorage.getItem("zwergenplan.such-abos"))).toBe('["kat=musik","kat=natur"]');
});

test("Zuschnitt im Service Worker: neu, nichts Neues, Testversand, Wegzeit; Requests für alle gleich (E10)", async ({
  page,
  context,
}) => {
  await installed(page, context);
  const ids = await siteIds(page);
  const unseen = [ids.byTitle("Musikgarten"), ids.byTitle("Krabbelreime")];
  const seen = ids.all.filter((id) => !unseen.includes(id));
  const session = await cdpFor(page, context);
  const startPage = new URL("./", test.info().project.use.baseURL ?? "").href;
  const SAME_REQUESTS = ["/data/site.json", "/data/wegzeit.json"];

  // ohne Abos und Alter: alle neuen
  await writeStore(page, { seenIds: seen });
  const first = await deliver(page, context, session);
  expect(first).toEqual({
    title: "2 neue Angebote im Zwergenplan",
    body: "Krabbelreime & Fingerspiele und Musikgarten 1 (1–2 Jahre)",
    navigate: startPage,
    requests: SAME_REQUESTS,
  });

  // danach kennt das Gerät alles: nichts Neues
  await expect
    .poll(async () => ((await readStore(page))["seenIds"] as string[] | undefined)?.length)
    .toBe(ids.all.length);
  const second = await deliver(page, context, session);
  expect(second.title).toBe("Diese Woche nichts Neues");
  expect(second.body).toMatch(/^\d+ Angebote? in den nächsten 7 Tagen\.$/);

  // Testversand: zugeschnitten, schreibt aber nichts
  await writeStore(page, { seenIds: seen, birthDate: "2025-08-05" });
  const probe = await deliver(page, context, session, { test: true });
  expect(probe.title).toBe("2 neue Angebote passen zu 14 Monaten");
  expect((await readStore(page))["seenIds"]).toEqual(seen);

  // Abo mit Wegzeit ab Gostenhof: die Musikschule (29,6 Min.) fällt heraus; Requests wie ohne Startpunkt
  await writeStore(page, { seenIds: seen, searches: '["kat=musik&wegzeit=20"]', origin: "gostenhof" });
  const withReach = await deliver(page, context, session);
  expect(withReach).toEqual({
    title: "1 neues Angebot für deine Suchen",
    body: "Krabbelreime & Fingerspiele",
    navigate: startPage,
    requests: SAME_REQUESTS,
  });

  // gespeicherter Standort (gerundeter Punkt, ADR 0017) statt Stadtteil: ebenfalls Wegzeit, dieselben Requests
  await writeStore(page, {
    seenIds: seen,
    searches: '["kat=musik&wegzeit=20"]',
    origin: { source: "standort", lat: 49.448, lon: 11.058 },
  });
  const withPoint = await deliver(page, context, session);
  expect(withPoint.title).toBe("1 neues Angebot für deine Suchen");
  expect(withPoint.requests).toEqual(SAME_REQUESTS);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Push-Teil mit langem Abo: Gates (${colorScheme === "light" ? "hell" : "dunkel"}, E7)`, async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ colorScheme });
    await installed(
      page,
      context,
      "./?kat=musik,natur,krabbel-spielgruppen&format=kurs&anmeldung=ohne-anmeldung&kosten=kostenlos&wegzeit=20",
    );
    await openKidSheet(page);
    await subscribeButton(page).click();
    await expect(section(page).getByRole("listitem")).toHaveCount(1);
    await expectMobileUx(page);
  });
}

test("Push-Teil mit langem Abo: 320 px und 200 % (E7)", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await installed(
    page,
    context,
    "./?kat=musik,natur,krabbel-spielgruppen&format=kurs&anmeldung=ohne-anmeldung&kosten=kostenlos&wegzeit=20",
  );
  await openKidSheet(page);
  await subscribeButton(page).click();
  await setTextScale(page, 2);
  await expectNoHorizontalScroll(page);
  await expectTextFits(page, { scale: 2 });
  await expectAccessible(page);
});
