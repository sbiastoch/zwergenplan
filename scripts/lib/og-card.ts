/**
 * Markup des Kachelbilds (Plan 0026, Nachtrag A, E16/E17): die Kachel der Übersicht mit den Klassen aus OfferCard.tsx,
 * gestylt vom Start-CSS der App aus dem Build. Rein: kein I/O. Gerendert wird in scripts/og-images.ts.
 * Bild-eigene Regeln (Größe, Zeilenbegrenzung, Marke) stehen in `OG_STYLE`, ungeschichtet: Sie schlagen die
 * `@layer`-Regeln der App.
 */

import { BASE } from "../../site.config.ts";
import { CATEGORY_SHAPES } from "../../src/domain/category-look.ts";
import { CATEGORY_LABELS } from "../../src/domain/topics.ts";
import { escapeHtml, type OfferPreview } from "./share-pages.ts";

export type CardContent = Pick<OfferPreview, "category" | "when" | "title" | "meta" | "facts">;

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
/** Kachel in CSS-px; per `zoom` vergrößert, bis sie nicht mehr passt (Passregel, Review A, M1) */
export const OG_ZOOM = { start: 2.4, min: 1.6, step: 0.1 } as const;

/**
 * Schlimmster Fall für den Kanarienvogel (Review A, M1): 150 Zeichen Titel, Kosten mit 40 Zeichen (Grenze aus
 * `offerPreview`), alle Fakten, lange Meta. Passt er bei `OG_ZOOM.min` nicht, ist der Generator kaputt.
 */
export const OG_CANARY: CardContent = {
  category: "krabbel-spielgruppen",
  when: "Kurs ab Mi 30. Sept., 12 Termine",
  title:
    "Eltern-Kind-Bewegungslandschaftsnachmittag für Krabbelkinder und Laufanfänger mit Kletterparcours, Bällebad und Rhythmusinstrumenten im Gemeindehaus Süd",
  meta: "Ev.-Luth. Kirchengemeinde Beispielhausen-Südstadt – Mutter/Vater-Kind-Gruppen · Gemeindehaus der Evangelisch-Lutherischen Beispielkirchengemeinde, Südstadt",
  facts: [
    { text: "12–36 Monate", kind: "plain" },
    { text: "48 € für vier Nachmittage, Geschwisterk…", kind: "plain" },
    { text: "Anmeldung nötig", kind: "reg" },
    { text: "Warteliste", kind: "avail-warteliste" },
  ],
};

/**
 * - Papier wie `html` in base.css, Punkte im Maßstab der vergrößerten Kachel.
 * - Kein Herz: der Platz dafür (`margin-right: 47px`) entfällt. Die Drehung um −0,6° bleibt wie in der App.
 * - Titel höchstens 3 Zeilen, Meta 2; Meta und Fakten 16 px statt 14/13 px, lesbar in der Chat-Blase.
 * - Fester Viewport 1200 × 630 mit `zoom` statt kleinem Viewport mit Pixeldichte: Der löste die Querformat-
 *   Media-Queries der App aus (tabs.css, `max-height: 500px`).
 */
const OG_STYLE = `html{background-size:40px 40px;background-image:radial-gradient(var(--dotc) 2.8px,transparent 3.4px)}
body{width:${OG_WIDTH}px;height:${OG_HEIGHT}px;overflow:hidden;position:relative}
.og-stage{position:absolute;inset:0 0 80px;display:flex;align-items:center;justify-content:center}
.og-zoom{width:460px;zoom:var(--z,${OG_ZOOM.start})}
.og-zoom .card{margin:0}
.og-zoom .card-top,.og-zoom .ctitle{margin-right:0}
.og-zoom .ctitle{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;line-clamp:3;overflow:hidden}
.og-zoom .meta{font-size:16px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden}
.og-zoom .when{font-size:17px}
.og-zoom .fact{font-size:16px}
.og-brand{position:absolute;right:48px;bottom:24px;display:flex;align-items:center;gap:14px;font:800 30px/1 var(--font-display);letter-spacing:-.02em;color:var(--ink)}
.og-brand img{width:52px;height:52px;display:block}
#og-probe{position:absolute;left:-9999px;top:0;width:100px}`;

const FACT_CLASS = (kind: CardContent["facts"][number]["kind"]) => (kind === "plain" ? "fact" : `fact ${kind}`);

export function offerCardHtml({ category, when, title, meta, facts }: CardContent): string {
  return `<article class="card k-${category}"><div class="card-body"><div class="card-top"><span class="pill"><svg class="mini" viewBox="0 0 24 24" aria-hidden="true"><path class="shape-ink" d="${CATEGORY_SHAPES[category]}"/></svg>${escapeHtml(CATEGORY_LABELS[category])}</span><span class="when">${escapeHtml(when)}</span></div><h3 class="ctitle">${escapeHtml(title)}</h3><p class="meta">${escapeHtml(meta)}</p><div class="facts">${facts
    .map((f) => `<span class="${FACT_CLASS(f.kind)}">${escapeHtml(f.text)}</span>`)
    .join("")}</div></div></article>`;
}

/**
 * Seite, in die je Angebot eine Kachel kommt (`#og-slot`). `#og-probe` ist eine ungezoomte Kachel für den CSS-Wächter
 * in og-images.ts (Review A, M2). Ohne Skript: gesteuert wird über Playwright.
 */
export function ogDocument(stylesheets: readonly string[]): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
${stylesheets.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join("\n")}
<style>${OG_STYLE}</style>
</head>
<body>
<main class="og-stage"><div class="og-zoom" id="og-slot"></div></main>
<div class="og-brand"><img src="${BASE}icons/icon.svg" alt="">zwergenplan.app</div>
<div id="og-probe"><article class="card"></article></div>
</body>
</html>
`;
}
