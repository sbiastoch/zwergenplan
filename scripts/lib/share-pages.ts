/**
 * Vorschauseiten zum Teilen (Plan 0026, E2–E4, E7; ADR 0020) und die Texte des Kachelbilds (Nachtrag A, E16).
 * Rein: kein I/O, keine Uhr. „Jetzt“ ist der Datenstand `generatedAt`, die Ausgabe hängt nur an Daten, `generatedAt`
 * und site.config.ts. Pfade aus src/domain/share.ts, Texte aus src/domain/labels.ts (dieselben wie in der App).
 */

import { BASE, SITE_URL } from "../../site.config.ts";
import { rhythm, uniformTimes, upcomingSessions } from "../../src/domain/agenda.ts";
import { providerCategories, providerOffers } from "../../src/domain/directory.ts";
import { MAX_KEBAB_ID, MAX_LEGACY_OFFER_ID } from "../../src/domain/ids.ts";
import {
  ageRangeLabel,
  availabilityLabel,
  clock,
  costLabel,
  monthShort,
  registrationLabel,
  WD_SHORT,
  weekdayName,
} from "../../src/domain/labels.ts";
import { OFFER_PARAM, PROVIDER_PARAM } from "../../src/domain/route.ts";
import {
  LEGACY_SHARE_DIRS,
  offerAppSearch,
  offerImagePath,
  offerSharePath,
  providerAppSearch,
  providerSharePath,
  SHARE_DIRS,
} from "../../src/domain/share.ts";
import type { SiteOffer, SiteProvider } from "../../src/domain/site-data.ts";
import { berlinIsoDate, isoWeekday, parseIsoDate } from "../../src/domain/time.ts";
import { CATEGORY_LABELS, type Category, leadCategory } from "../../src/domain/topics.ts";

export interface SharePage {
  /** relativ zum Ausgabeordner, z. B. „a/<id>/index.html“ */
  path: string;
  html: string;
}

/** Ein Fakt der Kachel; `kind` entspricht der Klasse in src/ui/styles/card.css (`.fact.reg`, `.fact.avail-…`) */
interface PreviewFact {
  text: string;
  kind: "plain" | "reg" | `avail-${SiteOffer["availability"]["status"]}`;
}

/** Was Vorschauseite und Kachelbild über ein Angebot sagen – eine Quelle für beide (Nachtrag A, E16). */
export interface OfferPreview {
  category: Category;
  /** Rhythmus bzw. festes Datum (E3), nie „nächster Termin“ */
  when: string;
  title: string;
  /** „{Ort}, {Stadtteil} · {Anbieter}“; heißt der Ort wie der Anbieter, nur einmal */
  meta: string;
  facts: PreviewFact[];
  /** `{title} · {when}`, höchstens 110 Zeichen */
  ogTitle: string;
  /** höchstens 200 Zeichen */
  description: string;
  /** 8 Hex-Zeichen über die Texte des Bildes: `vorschau.jpg?v=…` wechselt mit dem Inhalt (Nachtrag A, E18) */
  imageVersion: string;
}

const MAX_TITLE = 110;
const MAX_DESCRIPTION = 200;
/** freier Preistext im Bild (Review A, M1); die Beschreibung nennt ihn ganz */
const MAX_FACT = 40;
/**
 * Wächter gegen Fehler im Generator (Schleife, doppelter Block), nie gegen Daten (E4, Review M4). Gemessen am
 * 2026-10-08: Median 3,2 kB, größte 3,5 kB – die geplanten 4 kB hätte ein Titel voller „&“ reißen können. Strenge
 * Obergrenze aus den Kürzungen: Titel 110 Zeichen viermal, Beschreibung 200 Zeichen dreimal, je höchstens 6 Byte
 * escaped („&quot;“), dazu die ID viermal (bis ADR 0022 bis 240 Zeichen, seit ADR 0022 genau 8) und rund 1,6 kB fester
 * Text ≈ 8,8 kB. Der Wert bleibt, darüber liegt nur ein Bug.
 */
const MAX_PAGE_BYTES = 10_000;
const GENERIC_IMAGE = "og/vorschau-v1.jpg";
const GENERIC_ALT = "Zwergenplan – Angebote für Kinder unter 3 in Nürnberg";
/** fest statt Titel: der stünde sonst ein weiteres Mal escaped in der Seite (Review A, m5) */
const OFFER_IMAGE_ALT = "Kachel des Angebots im Zwergenplan";
/** Nur Abrufer, die JavaScript ausführen könnten, bleiben auf der Seite (E4, Review M1; ADR 0020, Punkt 3). */
const SHARE_REDIRECT =
  'if (!/facebookexternalhit|Facebot|Twitterbot|bot\\b|crawler|spider/i.test(navigator.userAgent)) location.replace(document.getElementById("go").href);';

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** & < > " ' – für Texte in HTML und Attributen (Vorschauseite und Kachelbild) */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** kürzt am Wortende und hängt „…“ an; ohne Wortgrenze in der zweiten Hälfte hart */
function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  let base = space > max / 2 ? cut.slice(0, space) : cut;
  // angeschnittene Klammer („41,36 € (2…“) fällt ganz weg, solange genug übrig bleibt
  const open = base.replace(/\s*[(„"][^)“"]*$/, "");
  if (open.length > max / 2) base = open;
  return `${base.replace(/[\s·,–-]+$/, "")}…`;
}

/** FNV-1a (32 Bit) als 8 Hex-Zeichen: deterministisch, kein Krypto-Anspruch */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** „So 6. Dez.“ für einen Berliner Kalendertag */
function dayLabel(day: string): string {
  const { month, day: d } = parseIsoDate(day);
  return `${WD_SHORT[isoWeekday(day) - 1]} ${d}. ${monthShort(month)}`;
}

/** Wann, je Format (E3, Tabelle) */
function whenText(offer: SiteOffer, ref: Date): string {
  const first = offer.sessions[0];
  if (!first) return "";
  const day = berlinIsoDate(first.start);
  if (offer.format === "einmalig") return `${dayLabel(day)} ${parseIsoDate(day).year}, ${clock(first.start)}`;
  if (offer.format === "kurs") {
    const n = offer.sessions.length;
    return `Kurs ab ${dayLabel(day)}, ${n} ${n === 1 ? "Termin" : "Termine"}`;
  }
  const r = rhythm(offer, ref);
  if (!r) return "regelmäßig";
  // Uhrzeit nur, wenn alle kommenden Termine sie teilen; auch bei „Montags“ (Umsetzung: sonst fehlte das Wann)
  const upcoming = upcomingSessions(offer, ref);
  const [next] = upcoming;
  const days = r.weekly ? `jeden ${weekdayName(r.weekday)}` : `${weekdayName(r.weekday)}s`;
  return next && uniformTimes(upcoming) ? `${days}, ${clock(next.start)}` : days;
}

/** „Studio X (ehem. Y)“ und „Studio X“ heißen gleich: ohne Klammerzusatz, ohne Groß-/Kleinschreibung */
const plainName = (name: string) =>
  name
    .replace(/\s*\([^)]*\)/g, "")
    .trim()
    .toLocaleLowerCase("de");

export function offerPreview(offer: SiteOffer, generatedAt: string): OfferPreview {
  const ref = new Date(generatedAt);
  const when = whenText(offer, ref);
  const { name, district } = offer.venue;
  // Heißt der Ort wie der Anbieter, steht der Name nur einmal da (sonst „Studio X · Studio X, Gostenhof“)
  const sameName = plainName(name) === plainName(offer.providerName);
  const venueName = sameName ? offer.providerName : name;
  const place = district ? `${venueName}, ${district}` : venueName;
  const age = ageRangeLabel(offer.age);
  const availability = availabilityLabel(offer);
  const suffix = ` · ${when}`;
  const category = leadCategory(offer.topics, []);
  // Ort zuerst (anders als die Kachel der App): lange Anbieternamen verdrängten sonst das „Wo“ aus zwei Zeilen
  const meta = sameName ? place : `${place} · ${offer.providerName}`;
  const facts: PreviewFact[] = [
    { text: age, kind: "plain" },
    { text: shorten(costLabel(offer), MAX_FACT), kind: "plain" },
    { text: registrationLabel(offer), kind: offer.registration === "mit-anmeldung" ? "reg" : "plain" },
    ...(availability ? [{ text: availability, kind: `avail-${offer.availability.status}` as const }] : []),
  ];
  return {
    category,
    when,
    title: offer.title,
    meta,
    facts,
    ogTitle: `${shorten(offer.title, MAX_TITLE - suffix.length)}${suffix}`,
    description: shorten(
      `${place} · ${age} · ${costLabel(offer)} · ${registrationLabel(offer)}${sameName ? "" : ` – ${offer.providerName}`}`,
      MAX_DESCRIPTION,
    ),
    imageVersion: fnv1a(JSON.stringify([category, when, offer.title, meta, facts])),
  };
}

interface PageContent {
  title: string;
  description: string;
  /** relativ zur Basis */
  sharePath: string;
  image: { path: string; alt: string };
  /** Ziel in der App, z. B. „?angebot=<id>“ */
  appSearch: string;
}

/** System-Darstellung, Farben für hell und dunkel selbst gesetzt (E4, Review m6); Link ≥ 44 px */
const PAGE_STYLE = `:root{color-scheme:light dark;--bg:#e8f1ff;--ink:#13212e;--muted:#475563;--link:#13212e;--on-link:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0e1620;--ink:#eef3f8;--muted:#a9b8c6;--link:#ffd93b;--on-link:#13212e}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,sans-serif}
main{max-width:34rem;margin:0 auto;padding:12vh 16px 32px;overflow-wrap:anywhere}
h1{font-size:1.5rem;line-height:1.15;margin:.25rem 0 .75rem}
p{margin:0 0 1rem}.brand{font-weight:800;color:var(--muted)}
a{display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border-radius:12px;background:var(--link);color:var(--on-link);font-weight:700;text-decoration:none}`;

function sharePage({ title, description, sharePath, image, appSearch }: PageContent): string {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>${t} – Zwergenplan</title>
<meta name="description" content="${d}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Zwergenplan">
<meta property="og:locale" content="de_DE">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${SITE_URL}${sharePath}">
<meta property="og:image" content="${SITE_URL}${image.path}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeHtml(image.alt)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${BASE}icons/icon.svg" type="image/svg+xml">
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
<p class="brand">Zwergenplan</p>
<h1>${t}</h1>
<p>${d}</p>
<p><a id="go" href="${BASE}${escapeHtml(appSearch)}">Im Zwergenplan öffnen</a></p>
</main>
<script>${SHARE_REDIRECT}</script>
</body>
</html>
`;
}

export function offerSharePage(offer: SiteOffer, generatedAt: string): SharePage {
  const preview = offerPreview(offer, generatedAt);
  const sharePath = offerSharePath(offer.id);
  return {
    path: `${sharePath}index.html`,
    html: sharePage({
      title: preview.ogTitle,
      description: preview.description,
      sharePath,
      image: { path: `${offerImagePath(offer.id)}?v=${preview.imageVersion}`, alt: OFFER_IMAGE_ALT },
      appSearch: offerAppSearch(offer.id),
    }),
  };
}

const MAX_LISTED = 3;

export function providerSharePage(
  provider: SiteProvider,
  offers: readonly SiteOffer[],
  generatedAt: string,
): SharePage {
  const ref = new Date(generatedAt);
  // wie das Anbieter-Sheet: Zahl und Kategorien aus den kommenden Angeboten (directory.ts, Plan 0030)
  const own = providerOffers(offers, provider.id, ref);
  const upcoming = own.length;
  const count =
    upcoming === 0
      ? "Im Zwergenplan"
      : `${upcoming} ${upcoming === 1 ? "kommendes Angebot" : "kommende Angebote"} im Zwergenplan`;
  const categories = providerCategories(provider.id, own)
    .slice(0, MAX_LISTED)
    .map((c) => CATEGORY_LABELS[c]);
  const districts = [...new Set(provider.venues.flatMap((v) => (v.district ? [v.district] : [])))].slice(0, MAX_LISTED);
  const sharePath = providerSharePath(provider.id);
  return {
    path: `${sharePath}index.html`,
    html: sharePage({
      title: shorten(provider.name, MAX_TITLE),
      description: shorten([count, ...categories, ...districts].join(" · "), MAX_DESCRIPTION),
      sharePath,
      image: { path: GENERIC_IMAGE, alt: GENERIC_ALT },
      appSearch: providerAppSearch(provider.id),
    }),
  };
}

const regexEscape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * 404.html (E7; ADR 0022): leitet `a/<id>/` und `p/<id>/` unbekannter IDs in die App weiter, die dann „nicht mehr im
 * Zwergenplan“ meldet, dazu alte Links unter `angebot/<lange-id>/` und `anbieter/<katalog-id>/`, die die App umrechnet.
 * Kein `og:` – eine Vorschau für „gibt es nicht“ wäre irreführend. Die App prüft die IDs danach noch einmal (`parseRoute`).
 */
export function notFoundPage(): string {
  const base = regexEscape(BASE);
  const rule = (dir: string, id: string, key: string) => `[/^${base}${dir}\\/(${id})\\/?(?:index\\.html)?$/, "${key}"]`;
  const rules = [
    rule(SHARE_DIRS.offer, "[0-9a-z]{8}", OFFER_PARAM),
    rule(SHARE_DIRS.provider, "[0-9a-z]{8}", PROVIDER_PARAM),
    rule(LEGACY_SHARE_DIRS.offer, `[a-z0-9-]{1,${MAX_LEGACY_OFFER_ID}}`, OFFER_PARAM),
    rule(LEGACY_SHARE_DIRS.provider, `[a-z0-9-]{1,${MAX_KEBAB_ID}}`, PROVIDER_PARAM),
  ];
  const script = `for (const [re, key] of [${rules.join(", ")}]) {
  const m = re.exec(location.pathname);
  if (m) { location.replace(${JSON.stringify(BASE)} + "?" + key + "=" + m[1]); break; }
}`;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>Nicht gefunden – Zwergenplan</title>
<link rel="icon" href="${BASE}icons/icon.svg" type="image/svg+xml">
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
<p class="brand">Zwergenplan</p>
<h1>Diese Seite gibt es im Zwergenplan nicht (mehr).</h1>
<p><a href="${BASE}">Zum Zwergenplan</a></p>
</main>
<script>${script}</script>
</body>
</html>
`;
}

/** Fehler je Seite über `MAX_PAGE_BYTES` (Tests 10); `build-data` bricht dann ab. */
export function checkSharePages(pages: readonly SharePage[]): string[] {
  return pages.flatMap(({ path, html }) => {
    const bytes = new TextEncoder().encode(html).length;
    if (bytes <= MAX_PAGE_BYTES) return [];
    const fmt = (n: number) => n.toLocaleString("de-DE");
    return [`${path}: ${fmt(bytes)} Byte (höchstens ${fmt(MAX_PAGE_BYTES)})`];
  });
}
