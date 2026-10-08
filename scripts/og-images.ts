/**
 * Kachelbild je Angebot (Plan 0026, Nachtrag A, E16–E18): `<out>/angebot/<id>/vorschau.jpg`, 1200 × 630, nach dem
 * Vite-Build (`pnpm build`). Die Kachel ist die der Übersicht, gestylt vom Start-CSS samt Bricolage aus dem Build,
 * also genau dem Stand, der ausgeliefert wird. Texte aus `offerPreview` (dieselben wie im `og:title`).
 *
 * Kein Server, kein Port: Die Seite liegt unter einer Schein-Origin, `page.route` antwortet aus dem Ausgabeordner,
 * alles andere wird abgebrochen. Gates (Exit 1): Schrift und CSS geladen, Kanarienvogel passt, jede Kachel passt,
 * Zahl der Bilder = Zahl der Angebote, jedes Bild < 300 kB.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, type BrowserContext, chromium, type Page, webkit } from "@playwright/test";
import { BASE, OUT_DIR } from "../site.config.ts";
import { offerImagePath } from "../src/domain/share.ts";
import type { SiteData } from "../src/domain/site-data.ts";
import { dataSource, ROOT } from "./lib/load-data.ts";
import { type CardContent, OG_CANARY, OG_HEIGHT, OG_WIDTH, OG_ZOOM, offerCardHtml, ogDocument } from "./lib/og-card.ts";
import { pickEngine } from "./lib/og-engine.ts";
import { offerPreview } from "./lib/share-pages.ts";

const ORIGIN = "https://og.zwergenplan.invalid";
const DOCUMENT_PATH = "/__vorschau__.html";
/** Meta erlaubt für WhatsApp 600 kB; die Hälfte als Gate */
const MAX_IMAGE_BYTES = 300 * 1000;
const QUALITY = 82;
const PAGES = 4;
const IMAGE_TIMEOUT_MS = 15_000;
const WARN_SECONDS = 60;
/** Gewichte der Kachel: Meta 450, Fakten 700, Pille, Zeit und Titel 800 */
const FONT_CHECKS = ["450 16px", "700 16px", "800 22px"].map((f) => `${f} "Bricolage Grotesque Variable"`);
const MIME: Record<string, string> = {
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const source = dataSource();
const out = fileURLToPath(new URL(`${OUT_DIR[source]}/`, ROOT));
// Cast begründet: eigene Build-Ausgabe von build-data, dort per Zod geprüft (ADR 0001); kein zweites Prüfen hier.
const site = JSON.parse(readFileSync(join(out, "data/site.json"), "utf8")) as SiteData;
const indexHtml = readFileSync(join(out, "index.html"), "utf8");
const stylesheets = [...indexHtml.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+\.css)"/g)].map((m) => m[1] ?? "");
if (stylesheets.length === 0) fail(`kein Stylesheet in ${out}/index.html`);
const documentHtml = ogDocument(stylesheets);

function fail(message: string): never {
  console.error(`✗ Vorschaubilder: ${message}`);
  process.exit(1);
}

/** Antwortet aus dem Ausgabeordner; nur bekannte Typen, nie außerhalb davon */
async function serve(context: BrowserContext) {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === DOCUMENT_PATH) return route.fulfill({ contentType: "text/html", body: documentHtml });
    const rel = normalize(decodeURIComponent(url.pathname).slice(BASE.length));
    const type = MIME[extname(rel)];
    const file = join(out, rel);
    if (!type || rel.startsWith("..") || !existsSync(file)) return route.abort();
    return route.fulfill({ contentType: type, body: readFileSync(file) });
  });
}

/** Schrift und CSS sind wirklich da (Review A, M2): sonst ginge ein Bild in Rückfallschrift still live */
async function checkReady(page: Page) {
  const problem = await page.evaluate(async (fonts) => {
    await Promise.all(fonts.map((f) => document.fonts.load(f, "Zwergenplan ÄÖÜäöüß €–…")));
    const missing = fonts.filter((f) => !document.fonts.check(f, "Zwergenplan"));
    if (missing.length > 0) return `Schrift fehlt: ${missing.join(", ")}`;
    const probe = document.querySelector("#og-probe .card");
    const radius = probe ? getComputedStyle(probe).borderTopLeftRadius : "";
    return radius === "22px" ? "" : `CSS der Kachel fehlt (border-radius „${radius}“)`;
  }, FONT_CHECKS);
  if (problem) fail(problem);
}

/**
 * Setzt die Kachel ein und senkt den Zoom, bis sie in die Bühne passt (Passregel, Review A, M1). Liefert den Zoom
 * oder `undefined`, wenn sie auch bei `OG_ZOOM.min` nicht passt.
 */
async function place(page: Page, card: CardContent): Promise<number | undefined> {
  return page.evaluate(
    async ({ html, zoom }) => {
      const slot = document.getElementById("og-slot");
      const stage = document.querySelector(".og-stage");
      if (!slot || !stage) return undefined;
      slot.innerHTML = html;
      slot.getBoundingClientRect();
      // neue Zeichen können ein weiteres Schrift-Subset nachladen (latin-ext)
      await document.fonts.ready;
      const margin = 12;
      for (let z = zoom.start; z >= zoom.min - 1e-9; z -= zoom.step) {
        slot.style.setProperty("--z", z.toFixed(2));
        const box = stage.getBoundingClientRect();
        const card = slot.getBoundingClientRect();
        const fits =
          card.top >= box.top + margin &&
          card.bottom <= box.bottom - margin &&
          card.left >= box.left + margin &&
          card.right <= box.right - margin;
        if (fits) return Number(z.toFixed(2));
      }
      return undefined;
    },
    { html: offerCardHtml(card), zoom: OG_ZOOM },
  );
}

/** Zeitlimit für das ganze Bild: Platzieren (samt Schrift) und Screenshot (Plan 0026, E17, Review A m3) */
function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: über ${IMAGE_TIMEOUT_MS / 1000} s`)), IMAGE_TIMEOUT_MS);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

async function render(page: Page, card: CardContent, file: string) {
  const zoom = await place(page, card);
  if (zoom === undefined) fail(`„${card.title}“ passt auch bei Zoom ${OG_ZOOM.min} nicht ins Bild`);
  const jpeg = await page.screenshot({
    type: "jpeg",
    quality: QUALITY,
    clip: { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT },
    timeout: IMAGE_TIMEOUT_MS,
  });
  if (jpeg.byteLength > MAX_IMAGE_BYTES) fail(`${file}: ${Math.round(jpeg.byteLength / 1000)} kB (höchstens 300 kB)`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, jpeg);
  return zoom;
}

async function openPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: OG_WIDTH, height: OG_HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await serve(context);
  const page = await context.newPage();
  await page.goto(`${ORIGIN}${DOCUMENT_PATH}`);
  await checkReady(page);
  return page;
}

const started = performance.now();
const engineName = pickEngine(source, existsSync(chromium.executablePath()));
const browser = await (engineName === "chromium" ? chromium : webkit).launch();
try {
  const pages = await Promise.all(Array.from({ length: PAGES }, () => openPage(browser)));
  const [first] = pages;
  if (!first) fail("keine Seite");
  // Kanarienvogel: der schlimmste Fall muss passen, unabhängig von den Daten (Review A, M1)
  if ((await place(first, OG_CANARY)) === undefined) {
    fail(`Kanarienvogel passt bei Zoom ${OG_ZOOM.min} nicht – Generator oder CSS kaputt`);
  }

  const queue = [...site.offers];
  const zooms: number[] = [];
  await Promise.all(
    pages.map(async (page) => {
      for (let offer = queue.shift(); offer; offer = queue.shift()) {
        const file = join(out, offerImagePath(offer.id));
        const card = offerPreview(offer, site.generatedAt);
        // eine Wiederholung bei einem Aussetzer des Browsers (Review A, m3), dann Exit 1
        const once = () => withTimeout(render(page, card, file), offer.id);
        const zoom = await once().catch(once);
        zooms.push(zoom);
      }
    }),
  );

  // Gate: so viele Bilder auf der Platte wie Angebote (Arch-Review m1), nicht nur so viele Schleifendurchläufe
  const written = readdirSync(join(out, "angebot")).filter((d) => existsSync(join(out, "angebot", d, "vorschau.jpg")));
  if (written.length !== site.offers.length) fail(`${written.length} Bilder für ${site.offers.length} Angebote`);
  const sizes = site.offers.map((o) => statSync(join(out, offerImagePath(o.id))).size);
  const seconds = (performance.now() - started) / 1000;
  const took = seconds.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  const largest = Math.round(Math.max(0, ...sizes) / 1000);
  const shrunk = zooms.filter((z) => z < OG_ZOOM.start).length;
  console.log(
    `✓ Vorschaubilder (${engineName}): ${sizes.length} in ${took} s, größtes ${largest} kB, ${shrunk} verkleinert`,
  );
  if (seconds > WARN_SECONDS) console.log(`::warning::Vorschaubilder dauerten ${took} s (> ${WARN_SECONDS} s)`);
} finally {
  await browser.close();
}
