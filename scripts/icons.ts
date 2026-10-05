/**
 * App-Icons aus design/icon.svg (Plan 0011, E2), reproduzierbar mit Playwright-Chromium, ohne neues npm-Paket.
 *   node scripts/icons.ts                       schreibt public/icons/ (wird committet, wie Schrift-Assets)
 *   node scripts/icons.ts --preview=<ordner>    zusätzlich Vorschau für die Abnahme (hell/dunkel, Schutzzone)
 *
 * Varianten:
 * - icon-192.png, icon-512.png (`purpose: "any"`) und icon.svg (Favicon): abgerundetes Quadrat, Ecken transparent;
 * - maskable-512.png: randlos, Motiv auf 80 % verkleinert (10 % Schutzzone je Seite);
 * - apple-touch-180.png: randlos und **deckend** (iOS rundet selbst und setzt sonst Schwarz hinter Transparenz).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const SOURCE = "design/icon.svg";
const OUT = "public/icons";
/** Ecken des „any“-Icons: 22 % wie die üblichen Launcher-Formen */
const RADIUS = 112;

const source = readFileSync(SOURCE, "utf8");
if (!source.includes('<g id="papier">') || !source.includes('<g id="motiv">')) {
  throw new Error(`${SOURCE}: Gruppen #papier und #motiv fehlen`);
}
const body = (svg: string) => svg.replace(/<!--[\s\S]*?-->\s*/g, "");

/** abgerundetes Quadrat mit transparenten Ecken */
const rounded = body(source)
  .replace("<defs>", `<defs><clipPath id="rund"><rect width="512" height="512" rx="${RADIUS}" /></clipPath>`)
  .replace('<g id="papier">', '<g clip-path="url(#rund)"><g id="papier">')
  .replace(/<\/svg>\s*$/, "</g></svg>\n");
/** randlos, Motiv auf 80 % um die Mitte */
const maskable = body(source).replace('<g id="motiv">', '<g id="motiv" transform="translate(51.2 51.2) scale(0.8)">');
const plain = body(source);

async function render(page: Page, svg: string, size: number, file: string, transparent: boolean) {
  await page.setViewportSize({ width: size, height: size });
  const sized = svg.replace('width="512" height="512"', `width="${size}" height="${size}"`);
  await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${sized}</body>`);
  await page.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
}

const previewArg = process.argv.find((a) => a.startsWith("--preview="))?.slice("--preview=".length);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "icon.svg"), rounded);
  await render(page, rounded, 192, join(OUT, "icon-192.png"), true);
  await render(page, rounded, 512, join(OUT, "icon-512.png"), true);
  await render(page, maskable, 512, join(OUT, "maskable-512.png"), false);
  await render(page, plain, 180, join(OUT, "apple-touch-180.png"), false);
  console.log(`✓ Icons in ${OUT}/`);

  if (previewArg) {
    mkdirSync(previewArg, { recursive: true });
    const img = (file: string) => `data:image/png;base64,${readFileSync(join(OUT, file)).toString("base64")}`;
    /** Home-Bildschirm-Ausschnitt: iOS (abgerundet), Android rund und als Squircle (maskable) */
    const screen = (dark: boolean) => `<!doctype html><body style="margin:0;font:600 15px system-ui;
      background:${dark ? "#000 linear-gradient(160deg,#1c2a3a,#05070a)" : "#dfe7f2 linear-gradient(160deg,#f6d7e4,#cfe3ff)"};
      color:${dark ? "#fff" : "#111"};width:760px;height:300px;display:flex;gap:42px;align-items:center;justify-content:center">
      ${[
        ["iPhone", img("apple-touch-180.png"), "border-radius:22.5%"],
        ["Android rund", img("maskable-512.png"), "border-radius:50%"],
        ["Android Squircle", img("maskable-512.png"), "border-radius:32%"],
        ["Desktop (any)", img("icon-512.png"), ""],
      ]
        .map(
          ([label, src, shape]) => `<figure style="margin:0;text-align:center">
            <img src="${src}" width="120" height="120" style="${shape};display:block;margin:0 auto 10px">${label}</figure>`,
        )
        .join("")}</body>`;
    for (const dark of [false, true]) {
      await page.setViewportSize({ width: 760, height: 300 });
      await page.setContent(screen(dark));
      await page.screenshot({ path: join(previewArg, `homescreen-${dark ? "dunkel" : "hell"}.png`) });
    }
    // maskable mit Schutzzone: Kreis mit 80 % Durchmesser (sicherer Bereich laut W3C), außerhalb wird beschnitten
    await page.setViewportSize({ width: 512, height: 512 });
    await page.setContent(`<!doctype html><body style="margin:0;position:relative">
      <img src="${img("maskable-512.png")}" width="512" height="512" style="display:block">
      <div style="position:absolute;left:51.2px;top:51.2px;width:409.6px;height:409.6px;border-radius:50%;
        outline:3px dashed #d0021b;outline-offset:-1.5px"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(circle at center,transparent 204.8px,rgba(208,2,27,.18) 205px)"></div>
      </body>`);
    await page.screenshot({ path: join(previewArg, "maskable-schutzzone.png") });
    await page.setContent(
      `<!doctype html><body style="margin:0;background:#fff"><img src="${img("icon-512.png")}"></body>`,
    );
    await page.screenshot({ path: join(previewArg, "icon-512.png"), clip: { x: 0, y: 0, width: 512, height: 512 } });
    console.log(`✓ Vorschau in ${previewArg}/`);
  }
} finally {
  await browser.close();
}
