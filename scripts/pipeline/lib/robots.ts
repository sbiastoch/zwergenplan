/**
 * robots.txt nach RFC 9309 (Plan 0048, E8), rein: Datei lesen, Regeln für unseren Token wählen, einen Pfad prüfen.
 * Den Abruf samt Cache je Origin (RFC 9309, 2.3) macht `io/robots.ts`.
 */

/** Produkt-Token im User-Agent (`io/http.ts`, `BOT_UA`); eine Gruppe mit diesem Token ersetzt `*` */
const ROBOTS_TOKEN = "zwergenplan";
/** RFC 9309, 2.5: mindestens 500 KiB lesen; was dahinter steht, gilt nicht */
export const ROBOTS_MAX_BYTES = 500 * 1024;

interface Rule {
  allow: boolean;
  /** normalisiertes Muster, für die Länge */
  pattern: string;
  /** Teile zwischen den `*` */
  parts: readonly string[];
  /** Muster endet auf `$` */
  anchored: boolean;
}
export interface RobotsRules {
  rules: readonly Rule[];
}

/** Prozent-Kodierung vergleichbar machen: Nicht-ASCII als UTF-8 kodiert, Hex-Ziffern groß (RFC 9309, 2.2.2) */
function normalize(s: string): string {
  return [...s.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase())]
    .map((ch) => ((ch.codePointAt(0) ?? 0) > 0x7f ? encodeURIComponent(ch) : ch))
    .join("");
}

function toRule(allow: boolean, raw: string): Rule {
  const pattern = normalize(raw);
  const anchored = pattern.endsWith("$");
  return { allow, pattern, parts: (anchored ? pattern.slice(0, -1) : pattern).split("*"), anchored };
}

/**
 * Muster gegen den Pfad ohne RegExp (Arch-Review S3, m1): Eine fremde robots.txt mit vielen `*` ließe ein
 * Backtracking hängen, synchron und ohne Zeitlimit. Hier: erster Teil als Präfix, die übrigen je am frühesten Vorkommen,
 * bei `$` der letzte als Suffix hinter den übrigen; höchstens O(Pfad · Muster).
 */
function matches(rule: Rule, path: string): boolean {
  const [first = "", ...rest] = rule.parts;
  if (!path.startsWith(first)) return false;
  if (rest.length === 0) return !rule.anchored || path.length === first.length;
  let pos = first.length;
  const middle = rule.anchored ? rest.slice(0, -1) : rest;
  for (const part of middle) {
    const at = path.indexOf(part, pos);
    if (at < 0) return false;
    pos = at + part.length;
  }
  if (!rule.anchored) return true;
  const last = rest.at(-1) ?? "";
  return path.length - last.length >= pos && path.endsWith(last);
}

function truncate(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return bytes.length <= ROBOTS_MAX_BYTES ? text : new TextDecoder().decode(bytes.slice(0, ROBOTS_MAX_BYTES));
}

/**
 * Regeln für `zwergenplan`, sonst für `*`. Mehrere Gruppen mit demselben Token werden zusammengeführt; aufeinander
 * folgende `User-agent`-Zeilen teilen sich eine Gruppe. Zeilen ohne Doppelpunkt (etwa HTML) zählen nicht.
 */
export function parseRobots(text: string): RobotsRules {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | undefined;
  let lastWasAgent = false;
  for (const rawLine of truncate(text).split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      // Produkt-Token ohne Version („zwergenplan/1.0“)
      current.agents.push(value.split("/")[0]?.trim().toLowerCase() ?? "");
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current || (key !== "allow" && key !== "disallow")) continue;
    // leeres Disallow (oder Allow) ist keine Regel
    if (value !== "") current.rules.push(toRule(key === "allow", value));
  }
  const own = groups.filter((g) => g.agents.includes(ROBOTS_TOKEN));
  const chosen = own.length > 0 ? own : groups.filter((g) => g.agents.includes("*"));
  return { rules: chosen.flatMap((g) => g.rules) };
}

/** Pfad samt Query, wie in der URL kodiert. Die längste passende Regel gilt, bei Gleichstand `Allow` (RFC 9309, 2.2.2) */
export function robotsAllows(r: RobotsRules, pathAndQuery: string): boolean {
  if (pathAndQuery === "/robots.txt") return true;
  const path = normalize(pathAndQuery);
  let best: Rule | undefined;
  for (const rule of r.rules) {
    if (!matches(rule, path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    )
      best = rule;
  }
  return best?.allow ?? true;
}

export type RobotsState =
  | { kind: "regeln"; rules: RobotsRules }
  | { kind: "alles" }
  /** Server-Fehler, 429 oder nicht erreichbar: für diesen Lauf ist alles gesperrt (RFC 9309, 2.3.1.4) */
  | { kind: "unerreichbar"; reason: string };

/** Stand nach dem Abruf der robots.txt (Weiterleitungen schon verfolgt): 4xx erlaubt alles, 5xx und 429 sperren */
export function robotsFromResponse(status: number, body: string): RobotsState {
  if (status >= 200 && status < 300) return { kind: "regeln", rules: parseRobots(body) };
  if (status === 429 || status >= 500)
    return { kind: "unerreichbar", reason: `robots.txt nicht erreichbar (HTTP ${status})` };
  return { kind: "alles" };
}
