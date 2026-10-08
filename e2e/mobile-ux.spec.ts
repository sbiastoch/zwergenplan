/** Mobile-UX-Gates für jede Ansicht und jedes Overlay, hell und dunkel (Plan 0003, Plan 0007, docs/architecture.md). */
import type { Page } from "@playwright/test";
import { expect, MAP_READY, test, twoLinesEverywhere } from "./fixtures.ts";
import {
  backgroundLuminance,
  expectAccessible,
  expectMobileUx,
  expectNoBrightIslands,
  expectNoHorizontalScroll,
  expectReducedMotion,
  expectTextFits,
  expectTouchTargets,
  expectVisibleFocus,
  setTextScale,
} from "./mobile-ux.ts";

/** wie FIXTURE_NOW in fixtures.ts: Mo 5.10.2026 12:00 Berlin */
const FIXTURE_NOW = new Date("2026-10-05T12:00:00+02:00");

async function ready(page: Page) {
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
}

/** Startpunkt Gostenhof über das Kind-Sheet setzen (Plan 0004); das Sheet bleibt offen. */
async function pickGostenhof(page: Page) {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  const sheet = page.getByRole("dialog", { name: "Kind und Einstellungen" });
  await sheet.getByLabel("Stadtteil", { exact: true }).selectOption("gostenhof");
  await expect(sheet.getByText("Startpunkt:")).toContainText("Gostenhof");
  return sheet;
}

/** Wie pickGostenhof, danach ist das Sheet wieder zu und die Kacheln zeigen Wegzeiten (Plan 0009). */
async function withGostenhof(page: Page) {
  const sheet = await pickGostenhof(page);
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Wegzeit ab Gostenhof");
}

/** Karte mit Stadtteil als Startpunkt (Plan 0005): Werkzeugzeile „Startpunkt: Gostenhof“, Orts-Liste mit Wegzeit. */
async function openMap(page: Page) {
  await withGostenhof(page);
  await page.getByRole("button", { name: "Karte", exact: true }).click();
  await expect(page.locator(".map-box")).toHaveAttribute("data-state", "bereit", MAP_READY);
}

const tabButton = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: new RegExp(`^${name}`) });
const providerRow = (page: Page, name: string) =>
  page.getByRole("region", { name: "Anbieter" }).locator(".place").filter({ hasText: name });

/** Tab „Anbieter“ (Plan 0010): fünf aktive Zeilen, der Turnverein blass am Ende */
async function openProviders(page: Page) {
  await tabButton(page, "Anbieter").click();
  await expect(page.locator(".place:not(.idle)")).toHaveCount(5);
  await expect(page.locator(".place.idle")).toHaveCount(1);
}

/** IDs der Fixture-Angebote für Merkliste und Deep-Link (Plan 0018) */
const PEKIP_ID =
  "familientreff-beispiel--pekip-gruppe-herbst-babys-geb-juni-aug-2026-20261013t0930--familientreff-beispiel-haus";
const TREFF_ID = "familientreff-beispiel--offener-krabbeltreff--familientreff-beispiel-haus";
const REIME_ID = "stadtbibliothek-beispiel--krabbelreime-fingerspiele--stadtbibliothek-beispiel-zentrum";

/**
 * Geburtsdatum (ISO) und Merkliste vor dem Laden speichern und `path` laden (Plan 0018): `VIEWS` startet nach
 * `ready()`, und der Altersfilter blendet in „Entdecken“ Unpassendes aus.
 */
async function loadAged(page: Page, path: string, birthDate: string, saved: string[] = []) {
  await page.addInitScript(
    ([born, ids]) => {
      localStorage.setItem("zwergenplan.geburtsdatum", born);
      localStorage.setItem("zwergenplan.merkliste", ids);
    },
    [birthDate, JSON.stringify(saved)] as const,
  );
  await page.goto(path);
}

async function setBirthDate(page: Page, text: string) {
  await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
  await page.getByLabel("Geburtsdatum").fill(text);
  await page.getByRole("button", { name: "Fertig" }).click();
  // erst nach dem Schließen weiter: WebKit scrollt sonst den nächsten Knopf nicht ins Bild (Scroll-Sperre des Dialogs)
  await expect(page.getByRole("dialog", { name: "Kind und Einstellungen" })).toBeHidden();
}

/** Ansichten mit Karte: Kacheln kommen aus dem Mock (fixtures.ts). */
const MAP_VIEWS = new Set(["karte", "orts-sheet", "orts-sheet-wegzeit", "karte-fehler"]);

/** Ansichten mit absichtlich gescheitertem Request: Der Browser meldet ihn in der Konsole (nur diese Muster). */
const CONSOLE_ERRORS: Record<string, RegExp[]> = {
  "entdecken-wegzeit-rueckfall": [/\/data\/wegzeit\.json\b/],
  "filter-sheet-wegzeit-rueckfall": [/\/data\/wegzeit\.json\b/],
  "anbieter-fehler": [/\/data\/anbieter\.json\b/],
  "anbieter-sheet-fehler": [/\/data\/anbieter\.json\b/],
};

/** Weg zu jeder Ansicht, ausgehend von der geladenen Startseite */
const VIEWS: Record<string, (page: Page) => Promise<void>> = {
  entdecken: async () => {},
  kalender: async (page) => {
    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await page.getByRole("button", { name: "Ganzen Monat zeigen" }).click();
    await expect(page.getByText("Oktober 2026")).toBeVisible();
  },
  // Wochenleiste allein: Bei offenem Monat ist sie ausgeblendet (Plan 0007, E5), B3 misst aber beide Raster.
  "kalender-woche": async (page) => {
    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toBeVisible();
  },
  merkliste: async (page) => {
    await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
    await page.getByRole("button", { name: /PEKiP-Gruppe Herbst .* merken/ }).click();
    await page.getByRole("button", { name: /^Merkliste/ }).click();
    await expect(page.getByTestId("offer")).toHaveCount(2);
  },
  // Plan 0025, E2: Anbieter-Sheet mit gedrücktem Herz neben dem längsten Namen (Kirchengemeinde, mehrzeilig)
  "anbieter-sheet-gemerkt": async (page) => {
    await page
      .getByRole("heading", { level: 3, name: /^Eltern-Kind-Bewegungslandschaft/ })
      .getByRole("button")
      .click();
    await page.getByRole("button", { name: "Mehr von diesem Anbieter" }).click();
    const heart = page
      .getByRole("dialog", { name: "Anbieter" })
      .getByRole("button", { name: /^Ev\.-Luth\. Kirchengemeinde.* merken$/ });
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
  },
  // Plan 0025, E3: Tab „Anbieter“ mit zwei gemerkten oben, einer davon ohne Termine (gestrichelt), Herz an jeder Zeile
  "anbieter-gemerkt": async (page) => {
    await page.evaluate(() =>
      localStorage.setItem(
        "zwergenplan.anbieter-merkliste",
        JSON.stringify(["gemeinde-beispiel", "turnverein-beispiel"]),
      ),
    );
    await page.goto("./?ansicht=anbieter");
    await expect(page.locator("ul.provider-saved li")).toHaveCount(2);
  },
  detail: async (page) => {
    await page.getByRole("heading", { level: 3, name: /PEKiP/ }).getByRole("button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  },
  // Plan 0018, E3: längster Text unter „Alle in den Kalender“ (Kurs komplett, Treff nur passend zum Alter)
  "merkliste-mit-geburtsdatum": async (page) => {
    await loadAged(page, "./?ansicht=merkliste", "2024-09-18", [PEKIP_ID, TREFF_ID]);
    await expect(
      page.getByText("2 gemerkt · 10 Termine in einer .ics-Datei · Kurse komplett, regelmäßige nur passend zum Alter"),
    ).toBeVisible();
  },
  // Plan 0018, E4: Alterszeile mit Grenze „· passt bis 14.10.“
  "detail-mit-geburtsdatum": async (page) => {
    await loadAged(page, `./?angebot=${TREFF_ID}`, "2024-09-18");
    await expect(
      page.getByRole("dialog").getByText("Passt: am Mi 7.10. 24 Monate alt · passt bis 14.10."),
    ).toBeVisible();
  },
  // Plan 0026, E6 (Review M2): Teilen und Kopieren scheitern, Sheet „Link zum Teilen“ über dem Detail mit langer URL
  "link-zum-teilen": async (page) => {
    await page.addInitScript(() => {
      const fail = () => Promise.reject(new DOMException("Test", "NotAllowedError"));
      Object.defineProperty(navigator, "share", { value: fail, configurable: true });
      Object.defineProperty(navigator, "clipboard", { value: { writeText: fail }, configurable: true });
    });
    await page.reload();
    await page.getByRole("heading", { level: 3, name: /PEKiP/ }).getByRole("button").click();
    await page.getByRole("dialog").getByRole("button", { name: "Teilen" }).click();
    await expect(page.getByRole("dialog", { name: "Link zum Teilen" }).locator("input.share-link")).toBeFocused();
  },
  // Regelmäßige Reihe: zwei ICS-Knöpfe nebeneinander (`.two`), die der Kurs oben nicht hat.
  "detail-regelmaessig": async (page) => {
    await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  },
  "filter-sheet": async (page) => {
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    await expect(page.getByRole("dialog", { name: "Filter" })).toBeVisible();
  },
  // Plan 0023: Zeitraum gesetzt, beide Datumsfelder gefüllt, „Zeitraum entfernen“ sichtbar
  "filter-sheet-zeitraum": async (page) => {
    await page.goto("./?von=2026-10-20&bis=2026-10-31");
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    await expect(page.getByRole("button", { name: "Zeitraum entfernen" })).toBeVisible();
  },
  // Plan 0021: Altersschalter im Filter-Sheet (aus), Warnhinweis und Leerzustand mit zwei Textknöpfen
  "filter-sheet-alter": async (page) => {
    await setBirthDate(page, "01.09.2026");
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    await page.getByRole("switch", { name: "Nur passend für 1 Mon." }).click();
    await expect(page.getByRole("switch", { name: "Nur passend für 1 Mon." })).toHaveAttribute("aria-checked", "false");
  },
  "entdecken-alter-aus": async (page) => {
    await setBirthDate(page, "01.09.2026");
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    await page.getByRole("switch", { name: "Nur passend für 1 Mon." }).click();
    await page.getByRole("button", { name: "8 Angebote zeigen" }).click();
    await expect(page.getByText("Zeigt auch 4 Angebote, die nicht zu 1 Mon. passen")).toBeVisible();
  },
  "entdecken-alter-leer": async (page) => {
    await page.goto("./?kat=bewegung");
    await setBirthDate(page, "01.09.2026");
    await expect(page.getByRole("button", { name: "Auch unpassende zeigen" })).toBeVisible();
  },
  "kind-sheet": async (page) => {
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    await page.getByLabel("Geburtsdatum").fill("01.09.2026");
    await expect(page.getByText("Dein Kind ist heute 1 Monat alt.")).toBeVisible();
    // Abschnitt „Als App“ geladen (Lazy-Chunk, Plan 0011, E7): Die Gates prüfen sein Ergebnis, nicht den Platzhalter
    await expect(page.locator(".app-pending")).toHaveCount(0);
    // Push-Teil entschieden (Plan 0017, E7): data-push in jedem Zweig, auch wenn der Abschnitt leer bleibt
    await expect(page.locator("html")).toHaveAttribute("data-push", "bereit");
  },
  // Plan 0004/0009: längere Meta-Zeile „Anbieter · Stadtteil · 15 Min.“ und Statuszeile „… · Wegzeit ab Gostenhof“ (Plan 0020)
  "entdecken-wegzeit": async (page) => {
    await withGostenhof(page);
    await expect(page.getByTestId("offer").filter({ hasText: "Kuckuck im Nest" })).toContainText("5 Min.");
  },
  // Quellenhinweis mit zwei Fließtext-Links (≥ 24 px, Plan 0009, E3)
  "kind-sheet-wegzeit": async (page) => {
    const sheet = await pickGostenhof(page);
    await expect(sheet.getByRole("button", { name: "Startpunkt entfernen" })).toBeVisible();
    await expect(
      sheet.getByText(/^Geschätzte Wegzeit mit Bus & Bahn oder zu Fuß.*mehr als einen Umstieg/),
    ).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Fiktiver Fahrplan für Tests" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "CC0 1.0" })).toBeVisible();
  },
  "filter-sheet-wegzeit": async (page) => {
    await withGostenhof(page);
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    await sheet.getByRole("button", { name: "bis 30 Min." }).click();
    await expect(sheet.getByRole("button", { name: "bis 30 Min." })).toHaveAttribute("aria-pressed", "true");
    await sheet.getByRole("heading", { name: "Wegzeit" }).scrollIntoViewIfNeeded();
  },
  // geteilter Link mit Wegzeit, aber ohne Startpunkt: Hinweis mit „Startpunkt wählen“ unter der Statuszeile
  "entdecken-wegzeit-ohne-startpunkt": async (page) => {
    await page.goto("./?wegzeit=45");
    await expect(page.getByText("„bis 45 Min.“ braucht einen Startpunkt.")).toBeVisible();
    await expect(page.getByTestId("offer").first()).toBeVisible();
  },
  // Plan 0012, E4: längste Folge der Fixture „Tram 1 → Bus 202E“ (Gemeinde ab Gostenhof, 23,6 → „ca. 25 Min.“), mit
  // dem längsten Ortsnamen und dem längsten Preis („… Geschwisterkinder ermäßigt“ in der halben Label-Spalte,
  // Arch-Review 0012, Befund 3)
  "detail-wegzeit": async (page) => {
    await withGostenhof(page);
    await page
      .getByRole("heading", { level: 3, name: /^Eltern-Kind-Bewegungslandschaft/ })
      .getByRole("button")
      .click();
    await expect(page.getByRole("dialog").locator(".reach-long")).toContainText("Bus\u00a0202E");
  },
  // Plan 0019, E6/E10: Sheet „Wege ab …“ mit Linien, „1 Umstieg“, „zum Halt“, Marke „Vorschlag“ und dem Knopf
  // „In Google Maps navigieren“ (Musikgarten ab Gostenhof: Tram 1 → Bus 2, dazu zu Fuß)
  "detail-wege": async (page) => {
    await withGostenhof(page);
    await page
      .getByRole("heading", { level: 3, name: /^Musikgarten/ })
      .getByRole("button")
      .click();
    // Sheet über der Kachel „Wo“ (Plan 0019, E10)
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Wege & Route in Google Maps/ })
      .click();
    await expect(page.getByRole("dialog", { name: "Wege ab Gostenhof" }).locator(".ways li")).toHaveCount(2);
  },
  // dasselbe Detail ohne Startpunkt (Arch-Review 0012, Befund 3): Preis in der halben Spalte
  "detail-gemeinde": async (page) => {
    await page
      .getByRole("heading", { level: 3, name: /^Eltern-Kind-Bewegungslandschaft/ })
      .getByRole("button")
      .click();
    await expect(page.getByRole("dialog").getByText(/Geschwisterkinder ermäßigt/)).toBeVisible();
  },
  // Tabelle blockiert (E11): Luftlinie, längste Statuszeile und Hinweis mit „Nochmal laden“
  "entdecken-wegzeit-rueckfall": async (page) => {
    await page.route("**/data/wegzeit.json", (route) => route.abort());
    await page.evaluate(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
    await page.goto("./?wegzeit=30");
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar");
    await expect(page.getByRole("button", { name: "Nochmal laden" })).toBeVisible();
    await expect(page.getByTestId("offer").filter({ hasText: "Kuckuck im Nest" })).toContainText("200 m");
  },
  // Tabelle zurückgehalten (M7): Platzhalter-Block statt ungefilterter Liste, Statuszeile unsichtbar (Arch-Review
  // 0009, Befund 5). Das Zeitlimit des Ladens (8 s, `TRANSIT_TIMEOUT_MS`) darf während der Prüfungen nicht ablaufen.
  // Die Uhr anzuhalten geht nicht, axe braucht laufende Timer; deshalb fallen die 8-s-Timer weg. Seit Plan 0012
  // nutzt auch das Laden der Linien (`loadLines`) `TRANSIT_TIMEOUT_MS`; hier trifft der Hack aber nur den Timer der
  // Tabelle, denn die Linien werden erst nach der Antwort von wegzeit.json angefordert, und die hält diese Ansicht
  // zurück. Sonst gibt es in src keinen 8-s-Timer.
  "entdecken-wegzeit-laedt": async (page) => {
    await page.addInitScript(() => {
      const original = window.setTimeout.bind(window);
      Object.defineProperty(window, "setTimeout", {
        value: (handler: TimerHandler, ms?: number, ...args: unknown[]) =>
          ms === 8000 ? 0 : original(handler, ms, ...args),
      });
    });
    await page.route("**/data/wegzeit.json", () => {});
    await page.evaluate(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
    await page.goto("./?wegzeit=30");
    await expect(page.locator(".list-pending")).toHaveText("Wegzeiten werden geladen …");
    await expect(page.getByTestId("offer")).toHaveCount(0);
  },
  // Filter-Sheet bei Tabelle blockiert: gesperrte Chips, Begründung mit „Nochmal laden“ (E11, M6)
  "filter-sheet-wegzeit-rueckfall": async (page) => {
    await page.route("**/data/wegzeit.json", (route) => route.abort());
    await page.evaluate(() => localStorage.setItem("zwergenplan.entfernung-ab", "gostenhof"));
    await page.goto("./");
    await expect(page.getByRole("status")).toContainText("Wegzeiten gerade nicht verfügbar");
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    await expect(sheet.getByRole("button", { name: "bis 20 Min." })).toBeDisabled();
    await sheet.getByRole("button", { name: "Nochmal laden" }).scrollIntoViewIfNeeded();
  },
  // Standort außerhalb des Stadtgebiets im Kind-Sheet: Hinweis statt „Wegzeit ab deinem Standort“ (N3, H5)
  "kind-sheet-ausserhalb": async (page) => {
    await page.context().grantPermissions(["geolocation"]);
    await page.context().setGeolocation({ latitude: 49.4, longitude: 11.2 });
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
    await kid.getByRole("button", { name: "Meinen Standort nutzen" }).click();
    await expect(
      kid.getByText("Wegzeiten gibt es nur für Startpunkte im Stadtgebiet Nürnberg. Wähle einen Stadtteil."),
    ).toBeVisible();
  },
  // Standort außerhalb des Stadtgebiets: Begründung mit „Startpunkt wählen“ (E11, m16)
  "filter-sheet-wegzeit-ausserhalb": async (page) => {
    await page.context().grantPermissions(["geolocation"]);
    await page.context().setGeolocation({ latitude: 49.4, longitude: 11.2 });
    await page.getByRole("button", { name: /^Kind und Einstellungen/ }).click();
    const kid = page.getByRole("dialog", { name: "Kind und Einstellungen" });
    await kid.getByRole("button", { name: "Meinen Standort nutzen" }).click();
    await expect(kid.getByText("Startpunkt:")).toContainText("Mein Standort");
    await kid.getByRole("button", { name: "Fertig" }).click();
    await expect(page.getByRole("status")).toContainText("außerhalb des Stadtgebiets");
    await page.getByRole("button", { name: /^Alle Filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    await expect(sheet.getByText("Wegzeiten gibt es nur für Startpunkte im Stadtgebiet Nürnberg.")).toBeVisible();
    await sheet.getByRole("button", { name: "Startpunkt wählen" }).scrollIntoViewIfNeeded();
  },
  karte: openMap,
  // Fehlerzustand (E12): Meldung im Kartenrahmen, Orts-Liste und „Startpunkt …“ bleiben, keine Kartenmitte
  "karte-fehler": async (page) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        value(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
          if (type === "webgl" || type === "webgl2") return null;
          return Reflect.apply(original, this, [type, ...rest]);
        },
      });
    });
    await page.reload();
    await expect(page.getByTestId("offer").first()).toBeVisible();
    await withGostenhof(page);
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await expect(page.locator(".map-box")).toHaveAttribute("data-state", "fehler", MAP_READY);
    await expect(page.locator(".map-box")).toContainText("Dein Browser kann die Karte nicht zeigen.");
  },
  // Plan 0010: Anbieterliste und Anbieter-Sheet mit Zuständen (E10)
  anbieter: openProviders,
  "anbieter-startpunkt": async (page) => {
    await withGostenhof(page);
    await openProviders(page);
    await expect(providerRow(page, "Kleines Theater")).toContainText("5 Min.");
  },
  // Sticker „Bücher“: eine aktive Zeile, Hinweis mit „Filter zurücksetzen“, Turnverein blass
  "anbieter-filter": async (page) => {
    await page.goto("./?kat=buecher&ansicht=anbieter");
    await expect(page.getByText("4 weitere Anbieter haben gerade nichts Passendes.")).toBeVisible();
    await expect(page.locator(".place.idle")).toHaveCount(1);
  },
  "anbieter-suche-leer": async (page) => {
    await openProviders(page);
    await page.getByRole("searchbox", { name: "Anbieter suchen" }).fill("xyz");
    await expect(page.getByText("Kein Anbieter heißt so.")).toBeVisible();
  },
  // längster Name (111 Zeichen) und langer Ortsname: Worst Case für Kopf und Orte
  "anbieter-sheet": async (page) => {
    await openProviders(page);
    await providerRow(page, "Ev.-Luth. Kirchengemeinde").click();
    await expect(page.getByRole("dialog", { name: "Anbieter" }).getByTestId("offer")).toHaveCount(1);
  },
  "anbieter-sheet-leer": async (page) => {
    await openProviders(page);
    await providerRow(page, "Turnverein Beispiel").click();
    await expect(
      page.getByRole("dialog", { name: "Anbieter" }).getByText(/^Gerade stehen keine Termine/),
    ).toBeVisible();
  },
  // anbieter.json 503: Fehlertext mit „Nochmal versuchen“ in .lazy-box (E10)
  "anbieter-fehler": async (page) => {
    await page.route("**/data/anbieter.json", (route) => route.fulfill({ status: 503 }));
    await tabButton(page, "Anbieter").click();
    await expect(page.locator(".lazy-box")).toContainText("Die Anbieter konnten nicht geladen werden.");
    await expect(page.getByRole("button", { name: "Nochmal versuchen" })).toBeVisible();
  },
  // dasselbe im Sheet (Overlay im Top-Layer), erreicht über das Detail (Arch-Review m5)
  "anbieter-sheet-fehler": async (page) => {
    await page.route("**/data/anbieter.json", (route) => route.fulfill({ status: 503 }));
    await page.getByRole("heading", { level: 3, name: "Offener Krabbeltreff" }).getByRole("button").click();
    await page.getByRole("button", { name: "Mehr von diesem Anbieter" }).click();
    const sheet = page.getByRole("dialog", { name: "Anbieter" });
    await expect(sheet.locator(".lazy-box")).toContainText("Die Anbieter konnten nicht geladen werden.");
    await expect(sheet.getByRole("button", { name: "Nochmal versuchen" })).toBeVisible();
  },
  // Orts-Sheet mit zwei Linien: Die Fixture hat dafür keinen Ort, die Linien-Datei wird umgeschrieben (fixtures.ts)
  "orts-sheet-wegzeit": async (page) => {
    await twoLinesEverywhere(page);
    await openMap(page);
    await page
      .getByRole("region", { name: "Orte" })
      .getByRole("button", { name: /^Familientreff Beispielhof/ })
      .click();
    await expect(page.getByRole("dialog", { name: "Familientreff Beispielhof" }).locator(".reach-long")).toContainText(
      "Bus\u00a0202E",
    );
  },
  "orts-sheet": async (page) => {
    await openMap(page);
    await page
      .getByRole("region", { name: "Orte" })
      .getByRole("button", { name: /^Familientreff Beispielhof/ })
      .click();
    await expect(page.getByRole("dialog", { name: "Familientreff Beispielhof" })).toBeVisible();
  },
};

/**
 * Drei Wege zur Darstellung. Dunkel gibt es zweimal, weil die Tokens doppelt stehen (Plan 0007, E15): per System
 * (`@media`-Zweig) und per gewählter Darstellung (`data-theme="dark"`). Die Wahl wird vor dem Laden gespeichert,
 * denn die Darstellung steht nur im Kind-Sheet (Plan 0020, E2).
 */
const SCHEMES = [
  { label: "hell", colorScheme: "light", chosenDark: false },
  { label: "dunkel", colorScheme: "dark", chosenDark: false },
  { label: "dunkel per Darstellung", colorScheme: "light", chosenDark: true },
] as const;

async function useScheme(page: Page, scheme: (typeof SCHEMES)[number]) {
  await page.emulateMedia({ colorScheme: scheme.colorScheme, reducedMotion: "reduce" });
  if (scheme.chosenDark)
    await page.addInitScript(() => {
      localStorage.setItem("zwergenplan.darstellung", "dunkel");
    });
}

async function expectDarkTheme(page: Page, scheme: (typeof SCHEMES)[number]) {
  if (scheme.chosenDark) expect(await page.evaluate(() => document.documentElement.dataset["theme"])).toBe("dark");
}

for (const [name, go] of Object.entries(VIEWS)) {
  test.describe(name, () => {
    if (MAP_VIEWS.has(name)) test.use({ tiles: "mock" });
    const allowed = CONSOLE_ERRORS[name];
    if (allowed) test.use({ allowedConsoleErrors: allowed });
    for (const scheme of SCHEMES) {
      test(`${name} besteht die Mobile-UX-Gates (${scheme.label})`, async ({ page }) => {
        await useScheme(page, scheme);
        await ready(page);
        await expectDarkTheme(page, scheme);
        await go(page);
        // vor expectMobileUx: dessen settle() wartet Animationen ab, die hier gar nicht erst laufen dürfen
        await expectReducedMotion(page);
        await expectMobileUx(page);
        if (scheme.label !== "hell") {
          await expectNoBrightIslands(page);
          // Der Alters-Hinweis liegt mit Grün (0,60) unter der Insel-Schwelle, soll im Dunkeln aber gedämpft sein.
          if (name === "kind-sheet") expect(await backgroundLuminance(page, ".hint.ok")).toBeLessThan(0.2);
        }
      });
    }

    test(`${name} bricht bei 320 px und 200 % Textgröße nicht aus`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await ready(page);
      await go(page);
      await expectNoHorizontalScroll(page);
      await expectTouchTargets(page); // B3: Kalendertage ≥ 44 px auch bei 320 px
      await expectTextFits(page); // inkl. einzeiliger Knopf-Beschriftungen bei 100 %
      await setTextScale(page, 2);
      await expectNoHorizontalScroll(page);
      await expectTextFits(page, { scale: 2 });
      await expectAccessible(page);
    });
  });
}

/**
 * Vorschauseite ohne JavaScript (Plan 0026, E4, Tests 7): eigenes Dokument mit eigenem `<style>`, Darstellung nur nach
 * System. Bewusste Ausnahme von „dunkel auch per `data-theme`“: Die Seite liest die gewählte Darstellung nicht, denn
 * dafür bräuchte sie ein Skript mit `localStorage` auf einer Seite, die man meist nur Millisekunden sieht (E4, Review m6).
 *
 * „Ohne JavaScript“ heißt hier: ohne das eine Inline-Skript der Seite (die Weiterleitung), denn sonst hat sie keins.
 * `javaScriptEnabled: false` ginge nicht: axe läuft im Seitenkontext und hängt dann (Zeitlimit). Dass die Seite mit
 * abgeschaltetem JavaScript wirklich so aussieht, prüft `e2e/teilen.spec.ts` („ohne JavaScript“).
 */
test.describe("vorschauseite-ohne-js", () => {
  const SHARE_PAGE = "angebot/familientreff-beispiel--offener-krabbeltreff--familientreff-beispiel-haus/";
  test.beforeEach(async ({ page }) => {
    await page.route(`**/${SHARE_PAGE}`, async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/<script>[\s\S]*?<\/script>/, "");
      expect(body).not.toContain("<script");
      await route.fulfill({ response, body });
    });
  });
  for (const colorScheme of ["light", "dark"] as const) {
    test(`vorschauseite-ohne-js besteht die Mobile-UX-Gates (${colorScheme === "light" ? "hell" : "dunkel"})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto(SHARE_PAGE);
      await expect(page.getByRole("link", { name: "Im Zwergenplan öffnen" })).toBeVisible();
      await expectReducedMotion(page);
      await expectMobileUx(page);
      if (colorScheme === "dark") await expectNoBrightIslands(page);
    });
  }
  test("vorschauseite-ohne-js bricht bei 320 px und 200 % Textgröße nicht aus", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(SHARE_PAGE);
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);
    await expectTextFits(page);
    await setTextScale(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2 });
    await expectAccessible(page);
  });
});

/**
 * 404-Seite (Plan 0026, E7, Arch-Review m7): eigenes Dokument wie die Vorschauseite, Darstellung nur nach System. Der
 * Vite-Server liefert für unbekannte Pfade die SPA-Rückfallseite, deshalb stellt `page.route` die 404-Antwort von
 * GitHub Pages mit der gebauten `dist-e2e/404.html` nach (wie `e2e/teilen.spec.ts`). Für `irgendwas/` springt ihr
 * Skript nicht, die Seite bleibt stehen.
 */
test.describe("404-seite", () => {
  const MISSING = "irgendwas/";
  // Chromium meldet die 404-Antwort des Dokuments selbst in der Konsole; erlaubt nur für diesen Pfad.
  test.use({ allowedConsoleErrors: [/\/irgendwas\/ Failed to load resource: .* 404/] });
  test.beforeEach(async ({ page }) => {
    await page.route(`**/${MISSING}`, (route) => route.fulfill({ status: 404, path: "dist-e2e/404.html" }));
  });
  const heading = (page: Page) =>
    page.getByRole("heading", { name: "Diese Seite gibt es im Zwergenplan nicht (mehr)." });
  for (const colorScheme of ["light", "dark"] as const) {
    test(`404-seite besteht die Mobile-UX-Gates (${colorScheme === "light" ? "hell" : "dunkel"})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto(MISSING);
      await expect(heading(page)).toBeVisible();
      await expectReducedMotion(page);
      await expectMobileUx(page);
      if (colorScheme === "dark") await expectNoBrightIslands(page);
    });
  }
  test("404-seite bricht bei 320 px und 200 % Textgröße nicht aus", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(MISSING);
    await expect(heading(page)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);
    await expectTextFits(page);
    await setTextScale(page, 2);
    await expectNoHorizontalScroll(page);
    await expectTextFits(page, { scale: 2 });
    await expectAccessible(page);
  });
});

for (const scheme of SCHEMES.filter((s) => s.label !== "hell")) {
  test(`Toast im Dunkeln ist keine helle Insel (${scheme.label})`, async ({ page }) => {
    await useScheme(page, scheme);
    await ready(page);
    await expectDarkTheme(page, scheme);
    // Hält auch die Timer an: Der Toast (2,8 s) bleibt stehen, bis die Uhr weiterläuft (Plan 0007, E15).
    await page.clock.pauseAt(FIXTURE_NOW);
    await page.getByRole("button", { name: "Offener Krabbeltreff merken" }).click();
    await expect(page.getByText("Gemerkt – liegt jetzt auf deiner Merkliste")).toBeVisible();
    await expectNoBrightIslands(page);
    await expectTextFits(page);
    await page.clock.runFor(3000);
    await expect(page.getByText("Gemerkt – liegt jetzt auf deiner Merkliste")).toHaveCount(0);
  });
}

// Plan 0018, E4: die längsten Kalender-Toasts aus Detail und Merkliste bei 320 px, auch bei 200 %. Die Uhr hält den
// Toast; vorher die Textgröße setzen, denn `setTextScale` wartet auf Frames.
const LONG_TOASTS = [
  {
    name: "Detail, gekürzt",
    path: `./?angebot=${TREFF_ID}`,
    birthDate: "2024-09-18",
    saved: [],
    trigger: (page: Page) => page.getByRole("dialog").getByRole("link", { name: "Alle Termine", exact: true }),
    toast: "Kalenderdatei mit 2 Terminen geladen – bis 14.10., danach passt es nicht mehr zum Alter",
  },
  {
    name: "Merkliste, ein Angebot passt nicht",
    path: "./?ansicht=merkliste",
    birthDate: "2026-08-01",
    saved: [TREFF_ID, REIME_ID],
    trigger: (page: Page) => page.getByRole("button", { name: "Alle in den Kalender" }),
    toast: "Kalenderdatei mit 4 Terminen geladen – 1 Angebot passt nicht zum Alter",
  },
];

for (const item of LONG_TOASTS) {
  for (const scale of [1, 2]) {
    test(`langer Kalender-Toast passt bei 320 px und ${scale * 100} % (${item.name})`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await ready(page);
      await loadAged(page, item.path, item.birthDate, item.saved);
      const trigger = item.trigger(page);
      await expect(trigger).toBeVisible();
      await setTextScale(page, scale);
      await page.clock.pauseAt(FIXTURE_NOW);
      await Promise.all([page.waitForEvent("download"), trigger.click()]);
      const toast = page.locator(".toast").filter({ hasText: item.toast });
      await expect(toast).toHaveText(item.toast);
      await expect(toast).toBeInViewport({ ratio: 1 });
      await expectNoHorizontalScroll(page);
      await expectTextFits(page, { scale });
    });
  }
}

test("Text-Gate erkennt Überlappung", async ({ page }) => {
  await ready(page);
  // `.hdr .kid` statt `.kid`: `.hdr .kid { margin-left: auto }` in chrome.css ist spezifischer.
  await page.addStyleTag({ content: ".hdr .kid { margin-left: -40px }" });
  await expect(expectTextFits(page)).rejects.toThrow(/Überlappung in header\.hdr/);
});

test("Text-Gate erkennt Text in der Rundung, auch im Scroll-Container des Sheets", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  await expect(page.getByRole("dialog", { name: "Filter" })).toBeVisible();
  // „Filter“ rückt ganz in die obere linke Ecke des Sheets (Radius 28 px), bleibt aber sichtbar.
  await page.addStyleTag({ content: ".sheet-scroll { padding: 0 !important } .sheet .grab { display: none }" });
  await expect(expectTextFits(page)).rejects.toThrow(/Text stößt an die Rundung von dialog\.dlg: „Filter“/);
  // auch bei 200 %: Ungescrollt (`scrollTop = 0`) zählt die Zeile an der Oberkante (Prüfung 3, Plan 0008, E3)
  await setTextScale(page, 2);
  await expect(expectTextFits(page, { scale: 2 })).rejects.toThrow(
    /Text stößt an die Rundung von dialog\.dlg: „Filter“/,
  );
});

/** Kalender bei 320 px (Wochenleiste dehnt sich in den Seitenrand, calendar.css), reduzierte Bewegung */
async function calendarAt320(page: Page) {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: "Kalender", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ganzen Monat zeigen" })).toBeVisible();
}

// Plan 0008, E2: Die Woche 26.10.–1.11. beginnt mit „26“. Die Tageszahl steckt sichtbar in button.day, das per
// negativem Rand über das unsichtbare fieldset.plain hinausreicht. Die Uhr bleibt am Datenstand (Fixture).
test("Text-Gate: Woche mit zweistelligem Montag bei 320 px", async ({ page }) => {
  await weekWithTwoDigitMonday(page);
  await expectTextFits(page);
});

test("Text-Gate erkennt Text, der aus seinem sichtbaren Kasten ragt", async ({ page }) => {
  await calendarAt320(page);
  // relative Verschiebung statt Rand: Ein Rand verpufft in der zentrierenden Flex-Spalte von .day
  await page.addStyleTag({ content: ".day .num { position: relative; left: -40px }" });
  await expect(expectTextFits(page)).rejects.toThrow(/Text ragt aus button\.day/);
});

/** Woche 26.10.–1.11. bei 320 px: „26“ ragt per negativem Rand über fieldset.plain hinaus (E2). */
async function weekWithTwoDigitMonday(page: Page) {
  await calendarAt320(page);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Nächste Woche" }).click();
  await expect(page.locator(".week .day .num").first()).toHaveText("26");
}

// Grenzen der E2-Lockerung (Arch-Review 0008, M1): Ein Ausbruch über einen Vorfahren mit sichtbarer Kante oder über
// einen abschneidenden Vorfahren bleibt rot.
test("Text-Gate erkennt Ausbruch über einen Kasten mit sichtbarem Rand", async ({ page }) => {
  await weekWithTwoDigitMonday(page);
  await page.addStyleTag({ content: "fieldset.plain { border: 1px solid currentColor }" });
  await expect(expectTextFits(page)).rejects.toThrow(/Text ragt aus fieldset\.plain/);
});

test("Text-Gate erkennt Ausbruch über einen abschneidenden Kasten", async ({ page }) => {
  await weekWithTwoDigitMonday(page);
  await page.addStyleTag({ content: "fieldset.plain { overflow: hidden }" });
  await expect(expectTextFits(page)).rejects.toThrow(/Text ragt aus fieldset\.plain/);
});

test("Text-Gate erkennt Text, der aus einem unsichtbaren Kasten ragt", async ({ page }) => {
  await ready(page);
  // `flex: none`, sonst setzt `flex: 1 1 10rem` die Breite außer Kraft. Kein sichtbarer Kasten liegt dazwischen.
  await page.addStyleTag({ content: ".status-row > .status { flex: none; width: 2rem; white-space: nowrap }" });
  await expect(expectTextFits(page)).rejects.toThrow(/Text ragt aus p\.status/);
});

// Plan 0008, E3: Eine an der Oberkante des Scrollbereichs angeschnittene Zeile ist Scroll-Zustand, kein Layout.
test("Text-Gate übergeht halb hinausgescrollte Überschriften im Sheet", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  await expect(page.getByRole("dialog", { name: "Filter" })).toBeVisible();
  await setTextScale(page, 2);
  const crossing = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("dialog[open] .sheet-scroll");
    const h = [...document.querySelectorAll("dialog[open] h3")].find((x) => x.textContent?.trim() === "Kosten");
    if (!el || !h) throw new Error("Scrollbereich oder „Kosten“ fehlt");
    const hr = h.getBoundingClientRect();
    el.scrollTop += hr.top - el.getBoundingClientRect().top + hr.height / 2;
    const top = el.getBoundingClientRect().top;
    const r = h.getBoundingClientRect();
    return r.top < top && top < r.bottom;
  });
  expect(crossing, "„Kosten“ kreuzt die Oberkante des Scrollbereichs").toBe(true);
  await expectTextFits(page, { scale: 2 });
});

/** Filter-Sheet bei 320 px und 200 %: Der Scrollbereich ist sicher länger als sichtbar. */
async function filterSheetAt320(page: Page) {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: /^Alle Filter/ }).click();
  await expect(page.getByRole("dialog", { name: "Filter" })).toBeVisible();
  await setTextScale(page, 2);
}

// Plan 0009, N5 (H7): Eine ganz sichtbare Zeile knapp unter der Oberkante eines gescrollten Bereichs liegt in der
// Rundung des Dialogs, weil gescrollt ist. Geprüft wird die Lage bei `scrollTop = 0`, dort liegt sie weit unten.
test("Text-Gate übergeht Zeilen, die erst das Scrollen in die Rundung des Sheets schiebt", async ({ page }) => {
  await filterSheetAt320(page);
  // 8 px Innenabstand statt 16: Die Zeile liegt dann eindeutig im Eckbereich (Radius 28 px), nicht auf der Kante.
  // In Ruhe hält Griff plus Innenabstand oben „Filter“ unter der Rundung.
  await page.addStyleTag({ content: ".sheet-scroll { padding-inline: 8px !important }" });
  const inCorner = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("dialog[open] .sheet-scroll");
    const h = [...document.querySelectorAll("dialog[open] h3")].find((x) => x.textContent?.trim() === "Kosten");
    const text = h?.firstChild;
    if (!el || !text) throw new Error("Scrollbereich oder „Kosten“ fehlt");
    const range = document.createRange();
    range.selectNodeContents(text);
    // Textoberkante 0,5 px unter die Oberkante des Bereichs: ganz sichtbar, kreuzt also nichts
    el.scrollTop += range.getBoundingClientRect().top - el.getBoundingClientRect().top - 0.5;
    const r = range.getBoundingClientRect();
    const v = el.getBoundingClientRect();
    return el.scrollTop > 0 && r.top >= v.top - 1 && r.left - v.left < 28 && r.top - v.top < 3;
  });
  expect(inCorner, "„Kosten“ steht ganz sichtbar in der oberen linken Ecke des gescrollten Bereichs").toBe(true);
  await expectTextFits(page, { scale: 2 });
});

// Gegenstück (N5): Liegt der Text schon in Ruhe in der Rundung, bleibt er rot, auch wenn gescrollt ist. Die alte
// E3-Ausnahme übersah ihn, sobald er die Oberkante kreuzte.
test("Text-Gate erkennt Text in der Rundung auch im gescrollten Sheet", async ({ page }) => {
  await filterSheetAt320(page);
  await page.addStyleTag({ content: ".sheet-scroll { padding: 0 !important } .sheet .grab { display: none }" });
  const crossing = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("dialog[open] .sheet-scroll");
    const text = document.querySelector("dialog[open] h2")?.firstChild;
    if (!el || !text) throw new Error("Scrollbereich oder „Filter“ fehlt");
    const range = document.createRange();
    range.selectNodeContents(text);
    // Textoberkante 4 px über die Oberkante des Bereichs: Die Zeile kreuzt sie, ist aber noch zu sehen
    el.scrollTop += range.getBoundingClientRect().top - el.getBoundingClientRect().top + 4;
    const r = range.getBoundingClientRect();
    const top = el.getBoundingClientRect().top;
    return el.scrollTop > 0 && r.top < top - 1 && top < r.bottom;
  });
  expect(crossing, "„Filter“ kreuzt die Oberkante des gescrollten Bereichs").toBe(true);
  await expect(expectTextFits(page, { scale: 2 })).rejects.toThrow(
    /Text stößt an die Rundung von dialog\.dlg: „Filter“/,
  );
});

test("Bewegungs-Gate erkennt Transition trotz Reduce", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  // auch 0,01 ms ist eine echte Transition, die WebKit verspätet abschließt (Plan 0008, E1)
  await page.addStyleTag({ content: ".brand { transition: color 0.01ms !important }" });
  await expect(expectReducedMotion(page)).rejects.toThrow(/transition auf .*brand/);
  // .brand ist spezifischer als `*` in motion.css, beide ungeschichtet und !important
  await page.addStyleTag({ content: ".brand { transition: color 0.3s !important }" });
  await expect(expectReducedMotion(page)).rejects.toThrow(/transition auf .*brand/);
});

test("funktioniert mit reduzierter Bewegung", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: "Kurse", exact: true }).click();
  await expect(page.getByTestId("offer")).toHaveCount(2);
});

test("zeigt bei Tastaturbedienung immer den Fokus", async ({ page, isMobile }) => {
  test.skip(isMobile, "Tastatur-Fokus wird auf Desktop geprüft");
  await ready(page);
  await expectVisibleFocus(page);
});

test("zeigt den Fokus auch im Detail-Dialog", async ({ page, isMobile }) => {
  test.skip(isMobile, "Tastatur-Fokus wird auf Desktop geprüft");
  await ready(page);
  await VIEWS["detail"]?.(page);
  await expectVisibleFocus(page, 15);
});

test.describe("Karte", () => {
  test.use({ tiles: "mock" });

  test("zeigt den Fokus auf Kartenfläche, Zoom, Attribution, Werkzeugzeile und Orts-Liste", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Tastatur-Fokus wird auf Desktop geprüft");
    await ready(page);
    await openMap(page);
    await expectVisibleFocus(page, 60);
  });
});
