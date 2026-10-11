/**
 * Weiterleitungen des Abrufs je Sprung (Plan 0032, „Stufe 4 – Umsetzung“, Nutzerentscheid nach dem Arch-Review S4b):
 * `io/http.ts` folgt nicht mehr automatisch, sondern fragt hier für jeden Sprung, ob und wohin. Jede Zieladresse muss
 * http(s) sein und darf weder ein IP-Literal noch `localhost` sein; höchstens `MAX_REDIRECTS` Sprünge. Rein.
 */

/** wie `fetch` mit `redirect: "follow"` (dort 20); mehr braucht keine Programmseite */
export const MAX_REDIRECTS = 5;

/** IP-Literale (v4 und v6) und `localhost`/`.local`: nie abrufen, auch nicht als Weiterleitungsziel */
const INTERNAL_HOST = /^(localhost|[\d.]+|\[.*\])$|\.(local|localhost|internal|lan|home\.arpa)$/i;

/**
 * Namensbasierte Sperre (Nutzerentscheid): IP-Literale, `localhost` und lokale Suffixe, auch mit Punkt am Ende.
 * Restrisiko: Ein öffentlicher Name, der auf eine private oder Link-Local-Adresse auflöst, kommt durch (keine
 * DNS-Prüfung); der Abruf läuft nur im Job mit Leserecht (Plan 0032, „Stufe 4 – Umsetzung“).
 */
export const isInternalHost = (hostname: string): boolean => INTERNAL_HOST.test(hostname.replace(/\.$/, ""));

/** Grund, warum eine Adresse nicht abgerufen wird; `undefined` = erlaubt */
export function blockedUrl(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return `keine gültige Adresse: ${url}`;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return `kein http(s): ${url}`;
  if (isInternalHost(u.hostname)) return `interne Adresse: ${u.hostname}`;
  return undefined;
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);

export type Hop =
  | { kind: "fertig" }
  | { kind: "weiter"; url: string; method: "GET" | "POST"; body: boolean }
  | { kind: "fehler"; reason: string };

/**
 * Nächster Sprung nach einer Antwort. Methode wie `fetch` mit `redirect: "follow"`: 303 immer GET, 301/302 machen aus
 * POST ein GET (ohne Body), 307/308 behalten Methode und Body.
 */
export function nextHop(input: {
  url: string;
  status: number;
  location: string | null;
  method: "GET" | "POST";
  hops: number;
}): Hop {
  if (!REDIRECT.has(input.status)) return { kind: "fertig" };
  if (!input.location) return { kind: "fertig" };
  if (input.hops >= MAX_REDIRECTS) return { kind: "fehler", reason: `mehr als ${MAX_REDIRECTS} Weiterleitungen` };
  let target: string;
  try {
    target = new URL(input.location, input.url).toString();
  } catch {
    return { kind: "fehler", reason: `Weiterleitung auf ungültige Adresse: ${input.location}` };
  }
  const blocked = blockedUrl(target);
  if (blocked) return { kind: "fehler", reason: `Weiterleitung abgelehnt (${blocked})` };
  const keep = input.status === 307 || input.status === 308;
  const method = keep ? input.method : "GET";
  return { kind: "weiter", url: target, method, body: keep && input.method === "POST" };
}
