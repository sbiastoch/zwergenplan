/**
 * URL-Hilfen für Entdecken, Wächter, Klärfälle und Seitenfinder (Plan 0049, E1), rein. Aus `lib/discover.ts`
 * herausgezogen, damit `lib/site-crawl.ts` sie nutzt, ohne das Entdecken zu importieren.
 */
import { isInternalHost } from "./redirect.ts";

/** Keine IP-Literale und kein `localhost` (`isInternalHost`, gemeinsam mit dem Abruf `io/http.ts`) */
export const parseUrl = (url: string): URL | undefined => {
  try {
    const u = new URL(url);
    return (u.protocol === "http:" || u.protocol === "https:") && !isInternalHost(u.hostname) ? u : undefined;
  } catch {
    return undefined;
  }
};

const bareHost = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, "");

/** Host ohne `www.`; ungültige URL: undefined */
export const hostOf = (url: string): string | undefined => {
  const u = parseUrl(url);
  return u ? bareHost(u) : undefined;
};

/** Vergleichsform einer URL: ohne Schema, `www.`, Fragment, Tracking-Parameter und Schrägstrich am Ende. */
export function normalizeUrl(url: string): string | undefined {
  const u = parseUrl(url);
  if (!u) return undefined;
  const params = [...u.searchParams]
    .filter(([k]) => !/^(utm_|fbclid$|gclid$)/i.test(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  const path = u.pathname.replace(/\/+$/, "");
  return `${bareHost(u)}${path}${params.length > 0 ? `?${params.join("&")}` : ""}`;
}

/**
 * Dieselbe Website: gleicher Host oder einer ist Subdomain des anderen (`www.`, `info.`). Strenger als „letzte zwei
 * Teile“, damit zwei Seiten beim selben Baukasten-Hoster (`*.jimdofree.com`) nicht als eine gelten (Arch-Review S4b,
 * m2). Interne Adressen: nie (`hostOf` liefert dann nichts).
 */
export function sameSite(a: string, b: string): boolean {
  const x = hostOf(a);
  const y = hostOf(b);
  return x !== undefined && y !== undefined && (x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`));
}
