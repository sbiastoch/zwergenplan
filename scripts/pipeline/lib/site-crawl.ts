/**
 * Seitenfinder (Plan 0049, E1), rein: Startseiten, Bereich der Erkundung, geteilte Websites, Ausschlüsse, Reihenfolge,
 * Signale einer Programmseite und die Breitensuche mit eingespeistem Abruf. Den Abruf (Warteschlange je Host,
 * robots.txt, Browser, PDF) macht `io/site-crawl.ts`.
 */
import * as cheerio from "cheerio";
import type { Provider } from "../../../src/domain/schema.ts";
import { addDays } from "../../../src/domain/time.ts";
import type { PageExtract } from "./html-extract.ts";
import { isRelevant } from "./relevance.ts";
import { hostOf, normalizeUrl, parseUrl, sameSite } from "./url.ts";

/** Höchstens so viele Abrufe je Anbieter und Lauf, Startseiten, Browser, PDF und Weiterleitungen eingeschlossen (Ziel 4) */
const MAX_FETCHES = 20;
const MAX_DEPTH = 2;
/** Höchstens so viele Kandidaten je Anbieter in den Ertragsbeweis */
const MAX_CANDIDATES = 5;

/**
 * Buchungs- und Baukasten-Plattformen: viele Anbieter auf einem Host. Bei `jimdofree.com` und `wixsite.com` ist die
 * Subdomain die eigene Website des Anbieters (`sameSite` geht vor), nur der nackte Host gilt als geteilt.
 */
const SHARED_HOSTS = [
  "eversports.de",
  "hebamio.de",
  "kursorganizer.com",
  "miya360.de",
  "bsport.io",
  "gomus.de",
  "kikudoo.com",
  "fitogram.pro",
  "jimdofree.com",
  "wixsite.com",
] as const;
const OWN_SUBDOMAIN = new Set(["jimdofree.com", "wixsite.com"]);

/** Sammelkalender mit Adapter: deren Termine kommen über den Adapter, ihre Seiten sind nie Kandidat */
const AGGREGATOR_HOSTS = ["evangelische-termine.de", "frankenkids.de", "vk.nuernberg.de"];

const onPlatform = (host: string) =>
  SHARED_HOSTS.find((p) => host === p || (!OWN_SUBDOMAIN.has(p) && host.endsWith(`.${p}`)));

type Catalog = readonly Provider[];

/** Seiten eines Katalogeintrags: Website und Programmseiten */
const urlsOf = (p: Provider) => [p.url, ...p.programme.map((g) => g.url)];

/**
 * Dachseiten aus dem Katalog: Hosts (ohne `www.`), auf denen mindestens zwei Anbieter Start- oder Programmseiten haben,
 * etwa `nuernberg.de` oder `evdus.de`.
 */
export function umbrellaHosts(catalog: Catalog): Set<string> {
  const byHost = new Map<string, Set<string>>();
  for (const p of catalog) {
    if (p.role !== "anbieter") continue;
    for (const u of urlsOf(p)) {
      const h = hostOf(u);
      if (!h) continue;
      byHost.set(h, (byHost.get(h) ?? new Set()).add(p.id));
    }
  }
  return new Set([...byHost].filter(([, ids]) => ids.size >= 2).map(([h]) => h));
}

/** Geteilte Website: Plattform aus `SHARED_HOSTS` oder Dachseite des Katalogs, samt ihrer Subdomains (Arch-Review S1, M1) */
export function isShared(url: string, umbrellas: ReadonlySet<string>): boolean {
  const h = hostOf(url);
  return h !== undefined && (onPlatform(h) !== undefined || [...umbrellas].some((u) => h === u || h.endsWith(`.${u}`)));
}

/** Kontext der Erkundung eines Anbieters */
export interface CrawlScope {
  providerId: string;
  /** Startseiten in dieser Reihenfolge, ohne Dubletten */
  starts: string[];
  /** Seiten, die den Bereich festlegen (Startseiten und gesperrte Seiten), je mit „geteilt“ */
  anchors: ReadonlyArray<{ url: string; shared: boolean }>;
  /** normalisierte URLs, die der Katalog schon nennt (alle Einträge) */
  known: ReadonlySet<string>;
  /** URL-Präfixe der Programmseiten von Sammelkalendern (`role: aggregator`), normalisiert */
  aggregatorPrefixes: readonly string[];
  /** Hosts, für die der Katalog schon `render: browser` nutzt */
  browserHosts: ReadonlySet<string>;
  umbrellas: ReadonlySet<string>;
}

const hasPlaceholder = (url: string) => /\{(von|bis)\}/.test(url);

/** Wurzel der Website: Startseite nach einem Relaunch, wenn alle bekannten Seiten scheitern */
const rootOf = (url: string) => {
  const u = parseUrl(url);
  return u ? `${u.origin}/` : undefined;
};

/**
 * Bereich und Startseiten eines Anbieters (E1): `url`, die Wurzel ihrer Website und die Programmseiten ohne
 * `blocked`, ohne `{von}`/`{bis}` und ohne `request`. Gesperrte Seiten legen nur den Bereich fest. Auf einer geteilten
 * Website ist die Wurzel keine Startseite (sie gehört allen).
 */
export function crawlScope(provider: Provider, catalog: Catalog, umbrellas = umbrellaHosts(catalog)): CrawlScope {
  const fetchable = provider.programme.filter((g) => !g.blocked && !g.request && !hasPlaceholder(g.url));
  const candidates = [provider.url, rootOf(provider.url), ...fetchable.map((g) => g.url)].flatMap((u) =>
    u && !(u === rootOf(provider.url) && isShared(u, umbrellas)) ? [u] : [],
  );
  const seen = new Set<string>();
  const starts = candidates.filter((u) => {
    const n = normalizeUrl(u);
    if (!n || seen.has(n)) return false;
    seen.add(n);
    return true;
  });
  const anchors = [...starts, ...provider.programme.filter((g) => g.blocked).map((g) => g.url)].map((url) => ({
    url,
    shared: isShared(url, umbrellas),
  }));
  // die eigene `url` ist keine Programmseite: Nach einem Relaunch steht dort oft das Programm (S1, Messung Ziel 1);
  // `url` anderer Anbieter bleibt bekannt, deren Angebote gehören dorthin
  const known = new Set(
    catalog.flatMap((p) =>
      (p.id === provider.id ? p.programme.map((g) => g.url) : urlsOf(p)).flatMap((u) => normalizeUrl(u) ?? []),
    ),
  );
  const aggregatorPrefixes = catalog
    .filter((p) => p.role === "aggregator")
    .flatMap((p) => p.programme.flatMap((g) => normalizeUrl(g.url) ?? []));
  const browserHosts = new Set(
    catalog.flatMap((p) => p.programme.flatMap((g) => (g.render === "browser" ? (hostOf(g.url) ?? []) : []))),
  );
  return { providerId: provider.id, starts, anchors, known, aggregatorPrefixes, browserHosts, umbrellas };
}

/** Auf einer geteilten Website: nur unterhalb des Pfads einer Startseite, mit denselben Query-Parametern (Mandant) */
function underAnchor(url: string, anchor: string): boolean {
  const u = parseUrl(url);
  const a = parseUrl(anchor);
  if (!u || !a || hostOf(url) !== hostOf(anchor)) return false;
  const dir = a.pathname.endsWith("/") ? a.pathname : a.pathname.replace(/[^/]*$/, "");
  if (!u.pathname.startsWith(dir)) return false;
  return [...a.searchParams].every(([k, v]) => u.searchParams.get(k) === v);
}

/**
 * Gehört die URL zum Bereich des Anbieters? Ob geteilt, entscheidet der Host des Ziels (Arch-Review S1, M1): geteilt
 * nur unter einer Startseite, sonst dieselbe Website wie ein nicht geteilter Anker. So öffnet ein Anker auf einer
 * Subdomain der Dachseite (`bad.nuernberg.de`) nicht die ganze Dachseite.
 */
export function inScope(url: string, scope: CrawlScope): boolean {
  if (isShared(url, scope.umbrellas)) return scope.anchors.some((a) => underAnchor(url, a.url));
  return scope.anchors.some((a) => !a.shared && sameSite(url, a.url));
}

/** Plattform-Seite außerhalb des Bereichs: ein Sprung von der eigenen Website, nicht weiter erkundet */
const isPlatform = (url: string): boolean => {
  const h = hostOf(url);
  return h !== undefined && onPlatform(h) !== undefined;
};

/** ganze Pfadsegmente bzw. Wörter: „Workshop“ ist kein Shop (Arch-Review S1, M2) */
const EXCLUDED =
  /(^|[/_\-\s.])(impressum|datenschutz|datenschutzerklaerung|privacy|agb|warenkorb|cart|login|shop|onlineshop|presse|jobs|karriere)([/_\-\s.?]|$)/i;
const IMAGE = /\.(jpe?g|png|gif|webp|svg|ico|bmp|tiff?)(\?|$)/i;
/** Einzeltermin als `.ics`: Termin-ID im Pfad oder in der Query, der Feed selbst nicht */
const SINGLE_ICS = /(\/\d{3,}[^/]*\.ics$|[?&](event|termin|id|ical_id|eventid)=[^&]+)/i;

/** Nie besucht (E1): Impressum, Datenschutz, AGB, Warenkorb, Login, Shop, Presse, Jobs, Bilder */
export function neverVisit(url: string, label = ""): boolean {
  const u = parseUrl(url);
  if (!u) return true;
  return IMAGE.test(u.pathname) || EXCLUDED.test(u.pathname) || EXCLUDED.test(label.trim());
}

/**
 * Gottesdienst-, Kontakt- und Anfahrtsseite (Stichprobe S0): nur das letzte Pfadsegment, ganze Wörter. So bleiben
 * „krabbelgottesdienst“ und „kontaktgruppe“ Kandidaten. Besucht wird die Seite weiter (Kontaktseiten braucht die
 * Ortsprüfung). Downloadseiten bleiben Kandidaten, denn dort liegen oft die Programmhefte.
 */
const NOT_PROGRAMME = /(^|[_\-.])(gottesdienste?|kontakt|anfahrt)([_\-.]|$)/i;

/** Nie Kandidat (E1): Sammelkalender, Seiten des Katalogs, Einzeltermin-`.ics`, Gottesdienst/Kontakt/Anfahrt */
export function neverCandidate(url: string, scope: CrawlScope): boolean {
  const n = normalizeUrl(url);
  const h = hostOf(url);
  if (!n || !h) return true;
  if (AGGREGATOR_HOSTS.some((a) => h === a || h.endsWith(`.${a}`))) return true;
  if (scope.aggregatorPrefixes.some((p) => n.startsWith(p))) return true;
  if (scope.known.has(n)) return true;
  const path = parseUrl(url)?.pathname ?? "";
  if (NOT_PROGRAMME.test(path.split("/").filter(Boolean).at(-1) ?? "")) return true;
  return /\.ics$/i.test(path) && SINGLE_ICS.test(`${path}${parseUrl(url)?.search ?? ""}`);
}

const WORDS = [
  /kurs/i,
  /termin/i,
  /programm/i,
  /stundenplan/i,
  /kalender/i,
  /veranstaltung/i,
  /baby/i,
  /eltern-?kind/i,
  /krabbel/i,
  /famili/i,
  /anmeld/i,
];

/** Wörter in Linktext und Pfad; mehr ist früher */
const linkScore = (url: string, label: string): number => {
  const path = parseUrl(url)?.pathname ?? "";
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // ungültige Prozentfolge oder Latin-1 („/f%FCr-babys“): roher Pfad (Arch-Review S1, M3)
  }
  const text = `${label} ${decoded}`;
  return WORDS.filter((w) => w.test(text)).length;
};

/** Links aus `iframe[src]`: eingebettete Buchungs-Widgets (`extractPage` liest sie nicht) */
export function iframeLinks(html: string, base: string): string[] {
  const $ = cheerio.load(html);
  return $("iframe[src]")
    .toArray()
    .flatMap((el) => {
      try {
        return [new URL($(el).attr("src") ?? "", base).href];
      } catch {
        return [];
      }
    });
}

const WEEKDAYS = "(Mo|Di|Mi|Do|Fr|Sa|So|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)";
const WEEKDAY_TIME = new RegExp(
  // bis zu 25 Zeichen ohne Ziffer zwischen Wochentag und Uhrzeit, auch über eine Zeile („Dienstag / Zeit: 09:15 Uhr“)
  `\\b${WEEKDAYS}s?\\b\\.?[^\\d]{0,25}?(ab\\s*)?\\d{1,2}([:.]\\d{2})?\\s*(-|–|bis)?\\s*\\d{0,2}[:.]?\\d{0,2}\\s*Uhr`,
  "g",
);
const DATE = /\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?(?!\d)/g;
/** Ein Datum mehr als so viele Monate voraus gilt als vergangen (Archiv mit Jahr ohne Angabe) */
const FUTURE_MONTHS = 10;

const pad = (n: number) => String(n).padStart(2, "0");

/** Monatsnamen und gängige Kürzel → Monat (S1, Messung Ziel 1: „07. Oktober – 16. Dezember 2026“) */
const MONTHS: ReadonlyArray<[string, number]> = [
  ["januar", 1],
  ["jan", 1],
  ["februar", 2],
  ["feb", 2],
  ["märz", 3],
  ["maerz", 3],
  ["mär", 3],
  ["april", 4],
  ["apr", 4],
  ["mai", 5],
  ["juni", 6],
  ["jun", 6],
  ["juli", 7],
  ["jul", 7],
  ["august", 8],
  ["aug", 8],
  ["september", 9],
  ["sept", 9],
  ["sep", 9],
  ["oktober", 10],
  ["okt", 10],
  ["november", 11],
  ["nov", 11],
  ["dezember", 12],
  ["dez", 12],
];
const MONTH_OF = new Map(MONTHS);
const DATE_NAMED = new RegExp(
  `\\b(\\d{1,2})\\.\\s*(${MONTHS.map(([m]) => m).join("|")})(?![a-zäöü])\\.?(?:\\s*(\\d{4}))?`,
  "gi",
);

/**
 * Künftige Datumsangaben `TT.MM.`, `TT.MM.JJJJ` oder mit Monatsnamen (`7. Oktober`, `19.März 2027`) ab `today`
 * (Europe/Berlin). Ohne Jahr: das nächste Vorkommen; mehr als 10 Monate voraus: vergangen.
 */
export function futureDates(text: string, today: string): number {
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7));
  const limit = addDays(today, FUTURE_MONTHS * 31);
  const seen = new Set<string>();
  const found = [
    ...[...text.matchAll(DATE)].map((m) => ({ day: Number(m[1]), month: Number(m[2]), y: m[3] })),
    ...[...text.matchAll(DATE_NAMED)].map((m) => ({
      day: Number(m[1]),
      month: MONTH_OF.get((m[2] ?? "").toLowerCase()) ?? 0,
      y: m[3],
    })),
  ];
  for (const { day, month, y } of found) {
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    let year: number;
    if (y) year = y.length === 2 ? 2000 + Number(y) : Number(y);
    else year = month < tm || (month === tm && `${ty}-${pad(month)}-${pad(day)}` < today) ? ty + 1 : ty;
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    if (iso >= today && iso <= limit) seen.add(iso);
  }
  return seen.size;
}

export interface PageSignals {
  candidate: boolean;
  /** künftige Termine für die Reihenfolge der Kandidaten */
  future: number;
  reason: string;
}

/**
 * Programmseite? (E1) Ein Signal (iCal, JSON-LD mit künftigen Terminen, ≥ 3 künftige Daten, ≥ 2 Wochentag plus
 * Uhrzeit) **und** Kleinkindbezug (`isRelevant`).
 */
export function pageSignals(page: PageExtract, today: string): PageSignals {
  // ein Feed selbst (`text/calendar`): künftige DTSTART (Arch-Review S1, M5)
  const icsFuture = new Set(
    [...page.text.matchAll(/DTSTART[^:\n]*:(\d{4})(\d{2})(\d{2})/g)]
      .map((m) => `${m[1]}-${m[2]}-${m[3]}`)
      .filter((d) => d >= today),
  ).size;
  if (icsFuture > 0)
    return isRelevant(page.text)
      ? { candidate: true, future: icsFuture, reason: "iCal" }
      : { candidate: false, future: icsFuture, reason: "iCal, ohne Kleinkindbezug" };
  const future = futureDates(page.text, today);
  const jsonLdFuture = page.jsonLd.filter((e) => e.start && e.start.slice(0, 10) >= today).length;
  const weekly = [...page.text.matchAll(WEEKDAY_TIME)].length;
  const signal = page.feeds.some((f) => /\.ics(\?|$)|webcal:|ical/i.test(f))
    ? "iCal"
    : jsonLdFuture > 0
      ? "JSON-LD"
      : future >= 3
        ? `${future} künftige Daten`
        : weekly >= 2
          ? `${weekly}× Wochentag mit Uhrzeit`
          : undefined;
  if (!signal) return { candidate: false, future, reason: "kein Terminsignal" };
  // Kleinkindbezug auch aus JSON-LD (Kursname wie „Babys ab 3 Monate“ steht oft nur dort; S1, Messung Ziel 1)
  if (!isRelevant(page.text, ...page.jsonLd.map((e) => JSON.stringify(e))))
    return { candidate: false, future, reason: `${signal}, ohne Kleinkindbezug` };
  return { candidate: true, future: Math.max(future, jsonLdFuture), reason: signal };
}

/** Art des Kandidaten aus dem Content-Type; JSON ist kein Kandidat */
export function kindOf(contentType: string): "html" | "ical" | "pdf" | undefined {
  if (/text\/calendar/i.test(contentType)) return "ical";
  if (/application\/pdf/i.test(contentType)) return "pdf";
  if (/json/i.test(contentType)) return undefined;
  return "html";
}

/** Ergebnis eines Abrufs in der Erkundung, wie `io/site-crawl.ts` es liefert */
export type CrawlFetch =
  | {
      ok: true;
      url: string;
      finalUrl: string;
      contentType: string;
      /** gerendert im Browser */
      browser: boolean;
      /** `extractPage` (HTML) bzw. Text (PDF, iCal) */
      page: PageExtract;
      /** rohes HTML für `iframe` und die Ortsprüfung */
      html: string;
      /** Abrufe, die dieser eine gekostet hat (Weiterleitungen, Browser) */
      cost: number;
    }
  | { ok: false; url: string; reason: string; cost: number; gesperrt?: boolean };

interface CrawlPage {
  url: string;
  depth: number;
  result: CrawlFetch;
  /** Seite, die hierher verlinkt (`finalUrl`), fehlt bei den Startseiten */
  from?: string;
  /** Kontaktseite für die Ortsprüfung (Nachtrag 1), vor Tiefe 1 abgerufen; Kandidat nur außer Impressum & Co. */
  contact?: true;
}

export interface CrawlResult {
  pages: CrawlPage[];
  fetches: number;
  /** abgerufene Seiten, die robots.txt sperrt */
  gesperrt: string[];
}

interface Queued {
  url: string;
  depth: number;
  score: number;
  /** Plattform-Seite oder Iframe außerhalb des Bereichs: abrufen, nicht weiter */
  leaf: boolean;
  from?: string;
}

/** Seiten mit der Adresse: Reihenfolge = Vorrang (Kontakt vor Anfahrt vor Impressum vor „Über uns“) */
const CONTACT_PATTERNS = [
  /kontakt|contact/i,
  /anfahrt|standort|so finden sie uns|lageplan|adresse/i,
  /impressum|imprint/i,
  /über uns|ueber-uns|uber-uns|about/i,
];
/** weitere Seiten je Kandidat im Bewerten (Entdecken) bzw. je Anbieter in der Erkundung (Ortsprüfung) */
const MAX_CONTACT_PAGES = 2;

/**
 * Kontakt- oder Adressseiten derselben Website aus den Links einer Seite (Nutzerentscheid 2026-10-11, Option A):
 * Startseiten nennen die Kursorte oft nicht. Höchstens zwei, nach Vorrang; erkannt am Linktext oder am Pfad. Interne
 * Adressen schließt `parseUrl` aus. Genutzt vom Bewerten im Entdecken und von der Ortsprüfung (Plan 0049, Nachtrag 1).
 */
export function contactLinks(page: {
  finalUrl: string;
  links: ReadonlyArray<{ label: string; url: string }>;
}): string[] {
  const self = normalizeUrl(page.finalUrl);
  if (!self) return [];
  const ranked = new Map<string, number>();
  for (const l of page.links) {
    const n = normalizeUrl(l.url);
    if (!n || n === self || !sameSite(l.url, page.finalUrl)) continue;
    const path = parseUrl(l.url)?.pathname ?? "";
    const rank = CONTACT_PATTERNS.findIndex((p) => p.test(l.label) || p.test(path));
    if (rank >= 0 && !ranked.has(n)) ranked.set(n, rank);
  }
  const urls = new Map(page.links.map((l) => [normalizeUrl(l.url) ?? "", l.url] as const));
  return [...ranked]
    .sort(([, a], [, b]) => a - b)
    .slice(0, MAX_CONTACT_PAGES)
    .flatMap(([n]) => urls.get(n) ?? []);
}

const cmp = (a: Queued, b: Queued) =>
  b.score - a.score || a.depth - b.depth || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0);

/**
 * Breitensuche (E1): Startseiten zuerst (Tiefe 0), dann je Tiefe nach Wörtern, Tiefe und URL; höchstens
 * `MAX_FETCHES` Abrufe und Tiefe `MAX_DEPTH`. Plattform-Links und Iframes der eigenen Website außerhalb des Bereichs
 * werden abgerufen, aber nicht erkundet. Nach Tiefe 0 kommen höchstens zwei Kontaktseiten der Startseiten im Bereich
 * (Ortsprüfung, Nachtrag 1), auch Impressum trotz `neverVisit`, innerhalb des Budgets.
 */
export async function exploreSite(
  scope: CrawlScope,
  /** `remaining`: Restbudget; ein Abruf, der mehr kosten würde (Browser), lässt den teuren Teil aus (M4) */
  fetchOne: (url: string, remaining: number) => Promise<CrawlFetch>,
  limits: { maxFetches?: number; maxDepth?: number } = {},
): Promise<CrawlResult> {
  const maxFetches = limits.maxFetches ?? MAX_FETCHES;
  const maxDepth = limits.maxDepth ?? MAX_DEPTH;
  const visited = new Set<string>();
  const pages: CrawlPage[] = [];
  const gesperrt: string[] = [];
  let fetches = 0;
  const visit = async (q: Queued, contact: boolean) => {
    const key = normalizeUrl(q.url);
    if (!key || visited.has(key)) return undefined;
    visited.add(key);
    const result = await fetchOne(q.url, maxFetches - fetches);
    fetches += Math.max(1, result.cost);
    pages.push({
      url: q.url,
      depth: q.depth,
      result,
      ...(q.from ? { from: q.from } : {}),
      ...(contact ? { contact: true as const } : {}),
    });
    if (!result.ok) {
      if (result.gesperrt) gesperrt.push(q.url);
      return undefined;
    }
    if (result.finalUrl !== q.url) {
      const fk = normalizeUrl(result.finalUrl);
      if (fk) visited.add(fk);
    }
    return result;
  };
  /** Links einer Seite in Tiefe `depth` als Einträge der nächsten Tiefe */
  const linksOf = (result: Extract<CrawlFetch, { ok: true }>, depth: number): Queued[] => {
    const links = [
      ...result.page.links,
      // verlinkte Feeds sind selbst Kandidat (E1)
      ...result.page.feeds.filter((f) => /^https?:/i.test(f)).map((url) => ({ url, label: "iCal-Kalender" })),
      ...iframeLinks(result.html, result.finalUrl).map((url) => ({ url, label: "iframe" })),
    ];
    return links.flatMap((l) => {
      const n = normalizeUrl(l.url);
      if (!n || visited.has(n) || neverVisit(l.url, l.label)) return [];
      const own = inScope(l.url, scope);
      // ein Sprung auf eine Plattform nur von der eigenen Website
      const leaf = !own && isPlatform(l.url) && inScope(result.finalUrl, scope);
      if (!own && !leaf) return [];
      return [{ url: l.url, depth: depth + 1, score: linkScore(l.url, l.label), leaf, from: result.finalUrl }];
    });
  };
  // Links der Kontaktseiten (Tiefe 1) kommen mit den übrigen Links der Tiefe 1 in Tiefe 2 (Arch-Review N1, M1)
  let carry: Queued[] = [];
  let level: Queued[] = scope.starts.map((url) => ({ url, depth: 0, score: 0, leaf: false }));
  for (let depth = 0; depth <= maxDepth && level.length + carry.length > 0; depth++) {
    const next: Queued[] = depth === 1 ? carry : [];
    for (const q of depth === 0 ? level : [...level].sort(cmp)) {
      if (fetches >= maxFetches) return { pages, fetches, gesperrt };
      const result = await visit(q, false);
      if (!result || q.leaf || depth === maxDepth) continue;
      next.push(...linksOf(result, depth));
    }
    if (depth === 0) {
      const contacts = pages.flatMap(({ result: r }) =>
        r.ok
          ? contactLinks({ finalUrl: r.finalUrl, links: r.page.links })
              .filter((u) => inScope(u, scope) && !visited.has(normalizeUrl(u) ?? ""))
              .map((url) => ({ url, from: r.finalUrl }))
          : [],
      );
      const seen = new Set<string>();
      for (const c of contacts) {
        const n = normalizeUrl(c.url) ?? c.url;
        if (seen.has(n) || seen.size >= MAX_CONTACT_PAGES) continue;
        seen.add(n);
        if (fetches >= maxFetches) return { pages, fetches, gesperrt };
        const result = await visit({ url: c.url, depth: 1, score: 0, leaf: false, from: c.from }, true);
        if (result && maxDepth > 1) carry.push(...linksOf(result, 1));
      }
    }
    // gleiche URL über mehrere Links: der beste Eintrag zählt
    const best = new Map<string, Queued>();
    for (const q of next) {
      const n = normalizeUrl(q.url) ?? q.url;
      const old = best.get(n);
      if (!old || cmp(q, old) < 0) best.set(n, q);
    }
    level = [...best.values()];
    if (depth >= 1) carry = [];
  }
  return { pages, fetches, gesperrt };
}

export interface Candidate {
  url: string;
  kind: "html" | "ical" | "pdf";
  browser: boolean;
  future: number;
  reason: string;
}

/**
 * Kandidaten (E1): Signale, nicht im Katalog, kein Sammelkalender; höchstens 5, nach künftigen Terminen, dann URL.
 * `skip` (Pflege: abgelehnt oder in Ruhe, E4) nimmt eine Seite vor der Grenze heraus, sonst verdrängten ruhende Seiten
 * neue auf Dauer.
 */
export function candidatesOf(
  crawl: CrawlResult,
  scope: CrawlScope,
  today: string,
  skip: (url: string) => boolean = () => false,
): Candidate[] {
  const out = new Map<string, Candidate>();
  for (const p of crawl.pages) {
    // eine Kontaktseite bleibt Kandidat, wenn sie Programm zeigt („Kontaktgruppe Babys“); Impressum nie (M1)
    if (!p.result.ok || (p.contact && neverVisit(p.url))) continue;
    const url = p.result.finalUrl;
    const kind = kindOf(p.result.contentType);
    if (!kind || neverCandidate(url, scope) || neverCandidate(p.url, scope)) continue;
    const s = pageSignals(p.result.page, today);
    if (!s.candidate || skip(url)) continue;
    const n = normalizeUrl(url) ?? url;
    if (!out.has(n)) out.set(n, { url, kind, browser: p.result.browser, future: s.future, reason: s.reason });
  }
  return [...out.values()]
    .sort((a, b) => b.future - a.future || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
    .slice(0, MAX_CANDIDATES);
}

/** Browser nötig? (E1) bei `jsRendered`, sonst bei 403/Bot-Schutz auf einer Plattform oder einem Browser-Host */
export function wantsBrowser(
  r: { status: number; jsRendered: boolean; botWall: boolean; url: string },
  scope: CrawlScope,
): boolean {
  // eine Fehlerseite mit Skripten lohnt den Browser nicht (Arch-Review S1, m2)
  if (r.jsRendered) return r.status < 400;
  if (r.status !== 403 && !r.botWall) return false;
  const h = hostOf(r.url);
  return h !== undefined && (isPlatform(r.url) || scope.browserHosts.has(h));
}
