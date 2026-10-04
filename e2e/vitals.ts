/**
 * Web-Vitals-Helfer (Plan 0007, E12; Arch-Hinweis 13 aus Plan 0003): LCP/CLS beobachten, Mobile-Drosselung,
 * Webfont zurückhalten und genau eine Fallback-Schrift erzwingen.
 *
 * Grenze „ab jetzt“ ohne Uhr: Die Fake-Uhr aus fixtures.ts ersetzt `performance.now()`, `mark()` und
 * `getEntries*()`, deshalb nutzt dieses Modul sie nie. Auch ein nativer Zeitstempel taugt nicht: Die `startTime` eines
 * Layout-Shifts ist der Beginn des Frames, und der lag in headless Chromium bis zu ≈ 60 ms *vor* dem auslösenden
 * Ereignis (gemessen: Shift bei 1038 ms, Schrift fertig geladen bei 1101 ms, `new Event().timeStamp` davor 1061 ms).
 * Ein Vergleich mit `t0` verlor so genau den Swap-Shift. Die Grenze ist deshalb die Zahl der bis dahin
 * beobachteten Shifts: `markShifts()` wartet zwei Frames, holt mit `takeRecords()` alles Ausstehende ab und merkt
 * sich die Anzahl; gezählt werden nur spätere Einträge. Der Kanarienvogel in perf.spec.ts verlangt, dass ein Shift
 * direkt nach der Grenze zählt.
 */
import { createRequire } from "node:module";
import {
  expect,
  type Fixtures,
  type Page,
  type PlaywrightTestOptions,
  type PlaywrightWorkerOptions,
} from "@playwright/test";

interface Shift {
  startTime: number;
  value: number;
  sources: string[];
}
interface Vitals {
  lcp: number;
  shifts: Shift[];
}
interface LayoutShiftSource {
  node?: Node | null;
  previousRect: DOMRectReadOnly;
  currentRect: DOMRectReadOnly;
}
declare global {
  interface Window {
    /** von observeVitals im Browser angelegt */
    __vitals?: Vitals & { flush: () => void };
  }
}

/** LCP und alle Layout-Shifts (ohne Eingabe) samt Verursachern mitschreiben, vor dem Laden registrieren. */
export async function observeVitals(page: Page) {
  await page.addInitScript(() => {
    const shifts: Shift[] = [];
    const vitals = { lcp: 0, shifts, flush: () => {} };
    window.__vitals = vitals;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) vitals.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    const box = (r: DOMRectReadOnly) =>
      `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`;
    const record = (entries: PerformanceEntryList) => {
      for (const e of entries) {
        // LayoutShift fehlt in lib.dom: Felder per Typprüfung lesen statt per Cast
        const value = "value" in e && typeof e.value === "number" ? e.value : 0;
        if ("hadRecentInput" in e && e.hadRecentInput === true) continue;
        const raw: unknown[] = "sources" in e && Array.isArray(e.sources) ? e.sources : [];
        const sources = raw
          .filter((src): src is LayoutShiftSource => typeof src === "object" && src !== null && "currentRect" in src)
          .map((src) => {
            const el = src.node instanceof Element ? src.node : src.node?.parentElement;
            const name = el ? `${el.tagName.toLowerCase()}${el.classList[0] ? `.${el.classList[0]}` : ""}` : "?";
            return `${name} ${box(src.previousRect)} → ${box(src.currentRect)}`;
          });
        shifts.push({ startTime: e.startTime, value, sources });
      }
    };
    const observer = new PerformanceObserver((list) => record(list.getEntries()));
    observer.observe({ type: "layout-shift", buffered: true });
    vitals.flush = () => record(observer.takeRecords());
  });
}

export async function readVitals(page: Page): Promise<Vitals> {
  return page.evaluate(() => {
    window.__vitals?.flush();
    return { lcp: window.__vitals?.lcp ?? 0, shifts: window.__vitals?.shifts ?? [] };
  });
}

/**
 * Grenze für „Shifts ab jetzt“: zwei Frames abwarten (ausstehendes Layout ist gerendert), ausstehende Einträge
 * abholen, Anzahl merken. Ohne Uhr, siehe Kopfkommentar.
 */
async function markShifts(page: Page): Promise<number> {
  return page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__vitals?.flush();
    return window.__vitals?.shifts.length ?? 0;
  });
}

/** CLS-Summe der Shifts ab Eintrag `from` (siehe `markShifts`), dazu die Verursacher für die Fehlermeldung */
export function clsFrom(vitals: Vitals, from = 0): { cls: number; detail: string } {
  const shifts = vitals.shifts.slice(from);
  const cls = shifts.reduce((sum, s) => sum + s.value, 0);
  const detail = shifts
    .map((s) => `${s.value.toFixed(4)} @${Math.round(s.startTime)} ms: ${s.sources.slice(0, 4).join("; ")}`)
    .join("\n");
  return { cls, detail };
}

/** CPU 4× langsamer, Netz wie ein mittleres Mobilnetz (nur Chromium). */
export async function throttleMobile(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}

/**
 * Hält alle Bricolage-Dateien zurück, bis `release()` gerufen wird. Alle, nicht nur Latin: Braucht ein Text
 * Latin-Ext, käme dessen Swap sonst unbemerkt vor der Messung. `expectHeld()` ist der Kanarienvogel: Die
 * Latin-Datei muss genau einmal angefragt worden sein, sonst misst der Test nichts.
 */
async function holdWebfont(page: Page) {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held: string[] = [];
  await page.route("**/assets/bricolage-grotesque-*.woff2", async (route) => {
    held.push(route.request().url());
    await released;
    await route.continue();
  });
  return {
    release,
    expectHeld() {
      expect(
        held.filter((u) => /bricolage-grotesque-latin-opsz-normal/.test(u)),
        "Webfont (Latin) genau einmal zurückgehalten",
      ).toHaveLength(1);
    },
  };
}

/**
 * Fallback-Familien in tokens.css und die Zahl ihrer @font-face-Blöcke (Plan 0007, E11): drei Gewichtsbereiche, je im
 * Text- und im Display-Stack („Bricolage Fallback Arial“ und „… Arial Display“ zählen zusammen).
 */
export const FALLBACK_BUCKETS = { Arial: 6, Roboto: 6, Noto: 6, DejaVu: 6 } as const;
export type FallbackName = keyof typeof FALLBACK_BUCKETS;

const TEST_ROBOTO = "/__zp-test/roboto.woff2";
const NO_FONT = 'local("ZP kein Font")';

/**
 * Schreibt das App-CSS so um, dass nur die Fallback-Familie `chosen` greifen kann: In allen Blöcken der anderen
 * „Bricolage Fallback …“-Familien wird jede `local(…)`-Quelle ersetzt. Erfasst `local("X")`, `local('X')` und
 * `local(X)` (Lightning CSS lässt Anführungszeichen weg, wo es darf). Bei Roboto kommt die Schrift per URL aus
 * @fontsource-variable/roboto, mit `font-display: block`, damit sie nicht selbst nachrutscht. Zählt die Blöcke je
 * Familie: Weicht eine Zahl ab oder blieb ein Block unverändert (anderes Minifier-Format), wirft die Funktion.
 */
export function rewriteFallbackCss(css: string, chosen: FallbackName): string {
  const blocks = new Map<string, number>();
  const rewritten = new Map<string, number>();
  const out = css.replace(/@font-face\s*\{[^}]*\}/g, (block) => {
    const family = /font-family:\s*["']?Bricolage Fallback ([A-Za-z]+)/.exec(block)?.[1];
    if (!family) return block;
    blocks.set(family, (blocks.get(family) ?? 0) + 1);
    let next = block;
    if (family !== chosen) next = block.replace(/local\((?:"[^"]*"|'[^']*'|[^)"']*)\)/g, NO_FONT);
    else if (chosen === "Roboto")
      next = block.replace(/src:[^;}]*/, `src:url("${TEST_ROBOTO}") format("woff2");font-display:block`);
    if (next !== block) rewritten.set(family, (rewritten.get(family) ?? 0) + 1);
    return next;
  });
  for (const [name, expected] of Object.entries(FALLBACK_BUCKETS)) {
    expect(blocks.get(name) ?? 0, `@font-face-Blöcke „Bricolage Fallback ${name}“ im CSS`).toBe(expected);
    if (name !== chosen || name === "Roboto")
      expect(rewritten.get(name) ?? 0, `umgeschriebene Blöcke „Bricolage Fallback ${name}“`).toBe(expected);
  }
  return out;
}

/**
 * Nur die Fallback-Familie `chosen` darf greifen (Umschreiben siehe `rewriteFallbackCss`). Gilt nur für das CSS mit
 * den Fallback-Faces; andere Stylesheets (z. B. das Lazy-CSS der Karte) bleiben unberührt.
 */
async function allowOnlyFallback(page: Page, chosen: FallbackName) {
  await page.route("**/assets/*.css", async (route) => {
    const response = await route.fetch();
    const css = await response.text();
    if (!css.includes("Bricolage Fallback")) return route.fulfill({ response });
    return route.fulfill({ response, body: rewriteFallbackCss(css, chosen) });
  });
  if (chosen === "Roboto") {
    const file = createRequire(import.meta.url).resolve(
      "@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2",
    );
    await page.route(`**${TEST_ROBOTO}`, (route) => route.fulfill({ path: file, contentType: "font/woff2" }));
  }
}

/**
 * Lädt die gewählte Fallback-Familie in allen drei Gewichtsbereichen und prüft über `document.fonts`, dass von den
 * „Bricolage Fallback …“-Faces genau die der gewählten Familie geladen sind. Liefert `false`, wenn die Schrift auf
 * dieser Maschine fehlt (lokale Quelle nicht vorhanden).
 */
async function loadOnlyFallback(page: Page, chosen: FallbackName): Promise<boolean> {
  const state = await page.evaluate(async (name) => {
    for (const family of [`Bricolage Fallback ${name}`, `Bricolage Fallback ${name} Display`])
      for (const weight of [400, 700, 800]) {
        try {
          await document.fonts.load(`${weight} 16px "${family}"`);
        } catch {
          // fehlende lokale Schrift: Status „error“, unten ausgewertet
        }
      }
    // Familie = erstes Wort nach „Bricolage Fallback“ (Text- und Display-Stack zusammen)
    return [...document.fonts]
      .map((f) => ({ family: /^"?Bricolage Fallback ([A-Za-z]+)/.exec(f.family)?.[1], status: f.status }))
      .filter((f) => f.family !== undefined);
  }, chosen);
  const mine = state.filter((f) => f.family === chosen);
  if (mine.some((f) => f.status === "error")) return false;
  expect(
    mine.map((f) => f.status),
    `alle Faces von „Bricolage Fallback ${chosen}“ geladen`,
  ).toEqual(mine.map(() => "loaded"));
  expect(
    state.filter((f) => f.family !== chosen && f.status === "loaded"),
    "keine andere Fallback-Familie geladen",
  ).toEqual([]);
  return true;
}

/** Wartet, bis Bricolage nach `release()` wirklich verwendet wird (der Swap hat stattgefunden). */
async function expectWebfontSwapped(page: Page) {
  await page.waitForFunction(() => document.fonts.check('800 22px "Bricolage Grotesque Variable"'));
  await page.evaluate(() => document.fonts.ready);
}

/** Ergebnis eines Swap-Laufs: CLS nur aus Shifts ab `release()`, oder „fehlt“, wenn die lokale Schrift fehlt */
export type SwapResult = { cls: number; detail: string } | "fehlt";

/**
 * Misst den Schrift-Swap (Plan 0007, E12): Webfont zurückhalten, nur `chosen` als Fallback zulassen und laden,
 * 300 ms warten, Grenze setzen (`markShifts`), Webfont freigeben, Swap abwarten, CLS ab der Grenze summieren.
 * Gemessen wird so genau der Swap, nicht das Laden der Daten oder der Test-Roboto. Ohne CPU-Drosselung: Es geht
 * um Verschiebung, nicht um Tempo. `shiftAfterMark` ist nur für den Kanarienvogel der Grenze (perf.spec.ts).
 */
export async function measureSwap(
  page: Page,
  chosen: FallbackName,
  { width, height, at, shiftAfterMark = false }: { width: number; height: number; at?: Date; shiftAfterMark?: boolean },
): Promise<SwapResult> {
  await allowOnlyFallback(page, chosen);
  const font = await holdWebfont(page);
  await observeVitals(page);
  await page.setViewportSize({ width, height });
  if (at) await page.clock.setFixedTime(at);
  await page.goto("./");
  await expect(page.getByTestId("offer").first()).toBeVisible();
  if (!(await loadOnlyFallback(page, chosen))) {
    font.release();
    return "fehlt";
  }
  font.expectHeld();
  await page.waitForTimeout(300);
  const boundary = await markShifts(page);
  if (shiftAfterMark)
    await page.evaluate(() => {
      const main = document.querySelector("main");
      if (main) main.style.paddingTop = "120px";
    });
  font.release();
  await expectWebfontSwapped(page);
  await page.waitForTimeout(500);
  return clsFrom(await readVitals(page), boundary);
}

/**
 * Schrift-Rendering wie am Telefon für die Swap-Tests: Die Geräte-Emulation (Pixel 7, DSF 2,625) ändert in
 * headless Chromium nicht die Schrift-Parameter, Glyphen-Breiten werden auf ganze CSS-Pixel gerundet (bei 13 px
 * ±3 % je Wort). Mit erzwungenem Skalierungsfaktor > 1 positioniert Chromium Glyphen subpixelgenau wie auf
 * hochauflösenden Geräten. Nur für Chromium; für andere Engines bleiben die Startoptionen leer.
 */
export const PHONE_FONT_RENDERING: Fixtures<object, object, PlaywrightTestOptions, PlaywrightWorkerOptions> = {
  launchOptions: [
    async ({ browserName }, use) => {
      await use(browserName === "chromium" ? { args: ["--force-device-scale-factor=2.625"] } : {});
    },
    { scope: "worker" },
  ],
};
