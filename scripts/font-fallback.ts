/**
 * Misst size-adjust der Fallback-Schriften gegen Bricolage (Plan 0007, E11, Befund B6). Nur Entwicklung, kein Gate.
 *   node scripts/font-fallback.ts
 * Rendert Mustertexte je Textklasse der Seite (Größe, Gewicht wie im CSS) in Playwright-Chromium, einmal in Bricolage
 * (Webfont aus node_modules, optische Größe automatisch) und einmal je Fallback mit size-adjust 100 %. Das
 * Breitenverhältnis Bricolage/Fallback ist das size-adjust, mit dem die Zeile gleich breit läuft.
 * Zwei Stacks (E11): Die optische Größe macht Bricolage klein breiter als groß, ein Wert passt nicht für 13 und 22 px.
 * Überschriften (≥ 17 px, 800) bekommen deshalb eigene Faces „… Display“. Je Stack und Gewichtsbereich (Bucket) wird der
 * Wert gewählt, der den größten Fehler der Klassen klein hält, die umbrechen und so verschieben können („fit“);
 * Chips (waagrecht scrollende Leiste), Tabs (feste Spalten), Tagesüberschrift und Marke (einzeilig, mit Reserve)
 * brechen beim Laden nicht um und werden nur berichtet. Ausgegeben werden Werte, Restfehler je Klasse und die Faces. Arial/Liberation, Noto und DejaVu kommen per local(),
 * Roboto per url() aus @fontsource-variable/roboto (variable wght wie ab Android 12).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
import { toSiteData } from "../src/domain/site-data.ts";
import { loadDataset } from "./lib/load-data.ts";

const require = createRequire(import.meta.url);
const fontFile = (pkg: string, file: string) =>
  readFileSync(require.resolve(`${pkg}/files/${file}`)).toString("base64");
const BRICOLAGE = fontFile("@fontsource-variable/bricolage-grotesque", "bricolage-grotesque-latin-opsz-normal.woff2");
const ROBOTO = fontFile("@fontsource-variable/roboto", "roboto-latin-wght-normal.woff2");

/** Bricolage-Maße (unverändert aus Plan 0003, E6): ascent/descent in em */
const ASCENT = 0.93;
const DESCENT = 0.27;

const loaded = loadDataset("real");
if (!loaded.ok) throw new Error(`Daten ungültig: ${loaded.errors.join("; ")}`);
const site = toSiteData(loaded.providers, loaded.offers);
const unique = (xs: string[]) => [...new Set(xs)];

interface TextClass {
  name: string;
  px: number;
  weight: number;
  samples: string[];
  /** Stack, der die Klasse setzt: Text (--font-sans) oder Überschrift (--font-display) */
  stack: "text" | "display";
  /** kann beim Laden umbrechen und zählt für die Wahl des size-adjust */
  fit: boolean;
}
const CLASSES: TextClass[] = [
  {
    name: "Titel 22/800",
    stack: "display",
    fit: true,
    px: 22,
    weight: 800,
    samples: unique(site.offers.map((o) => o.title)).slice(0, 150),
  },
  {
    name: "Tag 23/800",
    stack: "display",
    fit: false,
    px: 23,
    weight: 800,
    samples: ["Heute, 7. Oktober", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag", "Montag", "Dienstag"],
  },
  { name: "Marke 22/800", stack: "display", fit: false, px: 22, weight: 800, samples: ["Zwergenplan"] },
  {
    name: "Zeit 15/800",
    stack: "text",
    fit: true,
    px: 15,
    weight: 800,
    samples: ["10:00–11:30 Uhr", "9:30–10:30 Uhr", "15:00–16:15 Uhr", "Mi 7.10. · 10:00 Uhr", "Sa 17.10. · 9:30 Uhr"],
  },
  {
    name: "Fakten 13/700",
    stack: "text",
    fit: true,
    px: 13,
    weight: 700,
    samples: [
      "Kurs · noch 4 von 8",
      "Kurs · 8 Termine",
      "Jeden Mittwoch",
      "Freitags",
      "Regelmäßig",
      "Einmalig",
      "Anmeldung nötig",
      "Ohne Anmeldung",
      "Wenige Plätze",
      "Ausgebucht",
      "Kostenlos",
      "Kostenpflichtig",
      "120 € (8 Termine)",
      "6–24 Monate",
    ],
  },
  {
    name: "Chips 16/700",
    stack: "text",
    fit: false,
    px: 16,
    weight: 700,
    samples: ["Filter", "Kostenlos", "Ohne Anmeldung", "Kurse", "Regelmäßig", "Einmalig", "Alter?", "23 Mon."],
  },
  {
    name: "Pille 13/800",
    stack: "text",
    fit: true,
    px: 13,
    weight: 800,
    samples: [
      "Krabbel- & Spielgruppen",
      "Babykurse",
      "Musik & Singen",
      "Treffs & Cafés",
      "Bewegung & Turnen",
      "Bücher & Vorlesen",
    ],
  },
  {
    name: "Etikett 17/800",
    stack: "display",
    fit: true,
    px: 17,
    weight: 800,
    samples: [
      "Jeden Mittwoch, 10:00–11:30",
      "Kurs · noch 6 von 8 Terminen",
      "Ohne Anmeldung",
      "Anmeldung nötig",
      "Kostenlos",
      "6–24 Monate",
    ],
  },
  {
    name: "Tabs 13/600",
    stack: "text",
    fit: false,
    px: 13,
    weight: 600,
    samples: ["Entdecken", "Kalender", "Merkliste", "Liste", "Karte"],
  },
  {
    name: "Meta 14/450",
    stack: "text",
    fit: true,
    px: 14,
    weight: 450,
    samples: unique(site.offers.map((o) => `${o.providerName} · ${o.venue.district ?? o.venue.name}`)).slice(0, 100),
  },
  {
    name: "Text 16/400",
    stack: "text",
    fit: true,
    px: 16,
    weight: 400,
    samples: unique(site.offers.map((o) => o.summary)).slice(0, 60),
  },
];

interface Fallback {
  name: string;
  /** Quellen je Schnitt, wie in tokens.css */
  regular: string;
  bold: string;
}
const FALLBACKS: Fallback[] = [
  {
    name: "Arial",
    regular: 'local("Arial"), local("ArialMT"), local("Liberation Sans"), local("LiberationSans")',
    bold: 'local("Arial Bold"), local("Arial-BoldMT"), local("Liberation Sans Bold"), local("LiberationSans-Bold")',
  },
  {
    name: "Roboto",
    regular: `url(data:font/woff2;base64,${ROBOTO}) format("woff2")`,
    bold: `url(data:font/woff2;base64,${ROBOTO}) format("woff2")`,
  },
  {
    name: "Noto",
    regular: 'local("Noto Sans"), local("NotoSans-Regular")',
    bold: 'local("Noto Sans Bold"), local("NotoSans-Bold")',
  },
  {
    name: "DejaVu",
    regular: 'local("DejaVu Sans"), local("DejaVuSans")',
    bold: 'local("DejaVu Sans Bold"), local("DejaVuSans-Bold")',
  },
];

/** Gewichtsbereiche wie in tokens.css: normal, halbfett (Fakten, Chips, Tabs), fett (Titel, Zeit, Marke) */
const BUCKETS = [
  { range: "200 549", min: 200, max: 549, bold: false },
  { range: "550 749", min: 550, max: 749, bold: true },
  { range: "750 800", min: 750, max: 800, bold: true },
] as const;

const faces = [
  `@font-face { font-family: "ZP Bricolage"; font-weight: 200 800; src: url(data:font/woff2;base64,${BRICOLAGE}) format("woff2"); }`,
  ...FALLBACKS.flatMap((f) =>
    BUCKETS.map(
      (b) =>
        `@font-face { font-family: "ZP ${f.name}"; font-weight: ${b.range}; src: ${b.bold ? f.bold : f.regular}; }`,
    ),
  ),
].join("\n");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<!doctype html><html lang="de"><head><style>${faces}
  body { margin: 0; } span { white-space: nowrap; font-optical-sizing: none; letter-spacing: 0; }</style></head><body></body></html>`);

/** Summe der Breiten aller Mustertexte einer Klasse in einer Familie; null, wenn die Schrift fehlt */
/**
 * Gerendert wird zehnfach, mit der optischen Größe der echten Schriftgröße: Headless-Chromium unter Linux rundet
 * Glyphen-Breiten auf ganze Pixel, bei 13 px verfälscht das die Verhältnisse um mehrere Prozent (Roboto-Fakten:
 * 111,8 % gerundet statt 108 % exakt). Bei 130 px ist der Rundungsfehler vernachlässigbar.
 */
const SCALE = 10;

async function width(family: string, c: TextClass): Promise<number | null> {
  return page.evaluate(
    async ({ family, px, weight, samples, scale }) => {
      const font = `${weight} ${px * scale}px "${family}"`;
      const faces = await document.fonts.load(font, samples.join(""));
      if (faces.length === 0) return null;
      let sum = 0;
      for (const text of samples) {
        const span = document.createElement("span");
        span.style.font = font;
        // optische Größe wie bei der echten Größe, gerendert aber zehnfach (siehe SCALE)
        span.style.fontVariationSettings = `"opsz" ${px}`;
        span.textContent = text;
        document.body.append(span);
        sum += span.getBoundingClientRect().width;
        span.remove();
      }
      return sum;
    },
    { family, px: c.px, weight: c.weight, samples: c.samples, scale: SCALE },
  );
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const css: string[] = [];
for (const f of FALLBACKS) {
  const ratios: { c: TextClass; r: number }[] = [];
  for (const c of CLASSES) {
    const wb = await width("ZP Bricolage", c);
    const wf = await width(`ZP ${f.name}`, c);
    if (wb === null) throw new Error("Bricolage fehlt");
    if (wf !== null) ratios.push({ c, r: wb / wf });
  }
  if (ratios.length === 0) {
    console.log(`\n${f.name}: nicht installiert, übersprungen`);
    continue;
  }
  for (const stack of ["text", "display"] as const) {
    const family = `Bricolage Fallback ${f.name}${stack === "display" ? " Display" : ""}`;
    console.log(`\n${family}`);
    for (const b of BUCKETS) {
      const inRange = ratios.filter(({ c }) => c.weight >= b.min && c.weight <= b.max);
      // Display-Stack: nur 750–800 hat eigene Klassen, die übrigen Bereiche (z. B. `small` in .daylabel) wie Text
      const own = inRange.filter(({ c }) => c.stack === stack);
      const basis = (own.some(({ c }) => c.fit) ? own : inRange.filter(({ c }) => c.stack === "text")).filter(
        ({ c }) => c.fit,
      );
      const rs = basis.map(({ r }) => r);
      // Mitte zwischen kleinstem und größtem Verhältnis: hält den größten Fehler der umbrechenden Klassen klein
      const adjust = Math.round(((Math.min(...rs) + Math.max(...rs)) / 2) * 1000) / 1000;
      console.log(`  ${b.range}: size-adjust ${pct(adjust)}`);
      for (const { c, r } of own.length > 0 ? own : basis)
        console.log(
          `    ${c.name.padEnd(15)} ${c.fit ? "     " : "(nur)"} Verhältnis ${pct(r)}  Restfehler ${((r / adjust - 1) * 100).toFixed(2)} %`,
        );
      const src = f.name === "Roboto" ? "<siehe tokens.css>" : b.bold ? f.bold : f.regular;
      css.push(
        `@font-face {\n  font-family: "${family}";\n  font-weight: ${b.range};\n  src: ${src};\n  size-adjust: ${pct(adjust)};\n  ascent-override: ${pct(ASCENT / adjust)};\n  descent-override: ${pct(DESCENT / adjust)};\n  line-gap-override: 0%;\n}`,
      );
    }
  }
}
await browser.close();
console.log(
  `\n/* erzeugt mit node scripts/font-fallback.ts, ${new Date().toLocaleDateString("sv", { timeZone: "Europe/Berlin" })} */`,
);
console.log(css.join("\n"));
