/**
 * Programmseite → lesbarer Text plus strukturierte Hinweise für die Recherche-Agenten (aus fetch_page.py).
 * Rein: bekommt den Seiteninhalt, das Abrufen liegt in io/http.ts.
 */
import { type CheerioAPI, load } from "cheerio";
import { parseIcal } from "./ical.ts";

interface JsonLdEvent {
  name?: string;
  start?: string;
  end?: string;
  location?: string;
  address?: string;
  availability?: string;
  price?: string;
  url?: string;
}

export interface PageExtract {
  jsonLd: JsonLdEvent[];
  feeds: string[];
  text: string;
  links: Array<{ label: string; url: string }>;
  /** wenig Text bei vielen Skripten – vermutlich erst im Browser gerendert */
  jsRendered: boolean;
}

type Json = Record<string, unknown>;
const isObj = (x: unknown): x is Json => typeof x === "object" && x !== null && !Array.isArray(x);
const first = (x: unknown): unknown => (Array.isArray(x) ? x[0] : x);
const str = (x: unknown): string | undefined =>
  typeof x === "string" && x !== "" ? x : typeof x === "number" ? String(x) : undefined;

function compact(e: Record<keyof JsonLdEvent, string | undefined>): JsonLdEvent {
  // Nur definierte Felder behalten (exactOptionalPropertyTypes); die Schlüssel stammen aus JsonLdEvent.
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as JsonLdEvent;
}

function eventFrom(node: Json, fallback: Json = {}): JsonLdEvent {
  const loc = first(node["location"]);
  const offers = first(node["offers"]);
  const addr = isObj(loc) ? loc["address"] : undefined;
  return compact({
    name: str(node["name"]) ?? str(fallback["name"]),
    start: str(node["startDate"]),
    end: str(node["endDate"]),
    location: isObj(loc) ? str(loc["name"]) : str(loc),
    address: isObj(addr)
      ? ["streetAddress", "postalCode", "addressLocality"]
          .map((k) => str(addr[k]) ?? "")
          .join(" ")
          .trim()
      : str(addr),
    availability: isObj(offers) ? str(offers["availability"]) : undefined,
    price: isObj(offers) ? str(offers["price"]) : undefined,
    url: str(node["url"]) ?? str(fallback["url"]),
  });
}

function jsonLdEvents($: CheerioAPI): JsonLdEvent[] {
  const found: JsonLdEvent[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (!isObj(node)) return;
    const types = [node["@type"]].flat().filter((t): t is string => typeof t === "string");
    if (types.some((t) => t.includes("Event") && t !== "CourseInstance")) found.push(eventFrom(node));
    if (types.includes("Course")) {
      const instances = node["hasCourseInstance"];
      for (const inst of Array.isArray(instances) ? instances : []) if (isObj(inst)) found.push(eventFrom(inst, node));
    }
    for (const v of Object.values(node)) walk(v);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walk(JSON.parse($(el).text()));
    } catch {
      // kaputtes JSON-LD ignorieren – der Text bleibt auswertbar
    }
  });
  return found;
}

const FEED_HREF = /(\.ics\b|\bical\b|[./?&]ical|webcal:|\/feed\b|\.rss\b)/i;
const STATUS_CLASS = /ampel|status|avail|frei|belegt|ausgebucht|booked|(?<![-\w])full(?![-\w])|traffic/i;

function absolute(href: string, base: string): string | undefined {
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

/** Text aller Textknoten, je Knoten getrimmt, mit Zeilenumbruch verbunden (BeautifulSoup get_text("\n", strip=True)). */
/** Minimale Sicht auf domhandler-Knoten (cheerio exportiert die Typen nicht). */
interface DomNode {
  type: string;
  data?: string;
  children?: DomNode[];
}

function textOf(nodes: readonly DomNode[]): string {
  const parts: string[] = [];
  const walk = (n: DomNode) => {
    if (n.type === "text") {
      const t = (n.data ?? "").trim();
      if (t) parts.push(t);
    } else for (const c of n.children ?? []) walk(c);
  };
  for (const n of nodes) walk(n);
  return parts.join("\n");
}

function links($: CheerioAPI, base: string): PageExtract["links"] {
  const seen = new Set<string>();
  const out: PageExtract["links"] = [];
  $("*").each((_, el) => {
    const $el = $(el);
    const label =
      $el.text().replace(/\s+/g, " ").trim().slice(0, 80) || $el.attr("title") || $el.attr("aria-label") || "";
    const candidates = [$el.attr("href"), $el.attr("data-href"), $el.attr("data-url")];
    const onclick = /(?:window\.open|location(?:\.href)?\s*=)\s*\(?\s*['"]([^'"]+)/.exec($el.attr("onclick") ?? "");
    if (onclick?.[1]) candidates.push(onclick[1]);
    for (const c of candidates) {
      const url = c ? absolute(c, base) : undefined;
      if (url?.startsWith("http") && label && !seen.has(url)) {
        seen.add(url);
        out.push({ label, url });
      }
    }
  });
  return out;
}

export function extractPage(html: string, url: string): PageExtract {
  const $ = load(html);
  const pageLinks = links($, url);
  const jsonLd = jsonLdEvents($);
  const feeds = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const abs = FEED_HREF.test(href) ? absolute(href, url) : undefined;
    if (abs) feeds.add(abs);
  });
  $("link[href]").each((_, el) => {
    const type = $(el).attr("type") ?? "";
    const abs = /rss|calendar/.test(type) ? absolute($(el).attr("href") ?? "", url) : undefined;
    if (abs) feeds.add(abs);
  });
  // Status-Ampeln stehen oft nur in title/alt/aria-label/class (z. B. FBS: <span class="ampel red" title="…">)
  $("body")
    .find("span, i, abbr, div, img, em")
    .each((_, el) => {
      const $el = $(el);
      if ($el.text().trim()) return;
      const cls = ($el.attr("class") ?? "").trim().split(/\s+/).join(" ");
      const label = $el.attr("title") ?? $el.attr("aria-label") ?? $el.attr("alt");
      if (STATUS_CLASS.test(cls) || (label && ["span", "i", "abbr"].includes(el.tagName))) {
        $el.append(` [Status: ${label ?? ""} ${cls}] `.replace(/ {2}/g, " "));
      }
    });
  const scripts = $("script").length;
  $("script, style, noscript, svg, header, footer, nav, form").remove();
  const text = textOf($.root().toArray())
    .replace(/\n\s*\n+/g, "\n\n")
    .replace(/\[Status: ([^\]]*?) \]/g, "[Status: $1]");
  return { jsonLd, feeds: [...feeds].sort(), text, links: pageLinks, jsRendered: text.length < 1500 && scripts > 5 };
}

export interface FetchedPage {
  status: number;
  finalUrl: string;
  contentType: string;
  body: string;
}

/** Textausgabe von `pipeline fetch-page` (Format wie fetch_page.py, das die Agenten kennen). */
export function renderFetchReport(page: FetchedPage, opts: { maxChars: number; links: boolean }): string {
  const out = [`## META\nstatus=${page.status} final_url=${page.finalUrl} content_type=${page.contentType}`];
  if (page.contentType.includes("pdf")) {
    out.push("PDF – herunterladen und mit `pdftotext datei.pdf -` (ohne -layout) bzw. dem Read-Tool auswerten.");
    return out.join("\n");
  }
  if (page.contentType.includes("calendar") || page.body.trimStart().startsWith("BEGIN:VCALENDAR")) {
    out.push("## ICAL (VEVENTs: SUMMARY, DTSTART, DTEND, RRULE, LOCATION, URL, DESCRIPTION gekürzt)");
    out.push(JSON.stringify(parseIcal(page.body), null, 1).slice(0, opts.maxChars));
    return out.join("\n");
  }
  const page2 = extractPage(page.body, page.finalUrl);
  if (page2.jsRendered) out.push("HINWEIS: wenig Text bei vielen Skripten – Seite ist vermutlich JS-gerendert.");
  if (page2.jsonLd.length > 0) out.push(`## JSON-LD\n${JSON.stringify(page2.jsonLd, null, 1)}`);
  if (page2.feeds.length > 0) out.push(`## FEEDS\n${page2.feeds.join("\n")}`);
  out.push(`## TEXT\n${page2.text.slice(0, opts.maxChars)}`);
  if (page2.text.length > opts.maxChars) out.push(`\n[... gekürzt, ${page2.text.length} Zeichen gesamt]`);
  if (opts.links) out.push(`## LINKS\n${page2.links.map((l) => `${l.label} -> ${l.url}`).join("\n")}`);
  return out.join("\n");
}
