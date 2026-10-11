/**
 * Normalisierung vor dem Hash und der Cache-Schlüssel `inputHash` (Plan 0032, E3/E4). Rein.
 *
 * Ziel: Ein Anbieter, dessen Seiten sich inhaltlich nicht geändert haben, behält seinen Hash über Nächte hinweg.
 * Entfernt wird nur, was sich bei gleichem Inhalt ändert: Leerraum, Zeitstempel der Seite (nicht Termine),
 * Session-IDs und Tracking-Parameter in URLs, Zeilen von Cookie-Bannern aus einer festen Liste. S1.2 misst, ob das
 * reicht (R5); neue Muster kommen mit einem Testfall in `normalize.test.ts` dazu.
 */
import { createHash } from "node:crypto";
import type { Provider } from "../../../src/domain/schema.ts";
import { addDays, berlinIsoDate } from "../../../src/domain/time.ts";
import type { Candidate } from "./candidate.ts";

/** Zeilen, die eines dieser Stücke enthalten (Kleinschreibung) und kurz sind, gehören zum Cookie-Banner. */
const COOKIE_BANNER = [
  "wir verwenden cookies",
  "wir nutzen cookies",
  "diese website verwendet cookies",
  "diese webseite verwendet cookies",
  "diese website nutzt cookies",
  "diese webseite nutzt cookies",
  "cookie-einstellungen",
  "cookie einstellungen",
  "cookie-richtlinie",
  "cookies akzeptieren",
  "alle akzeptieren",
  "alle ablehnen",
  "nur notwendige cookies",
  "nur essenzielle cookies",
  "cookies zulassen",
  "auswahl erlauben",
  "datenschutzeinstellungen",
  "privatsphäre-einstellungen",
  "we use cookies",
  "accept all cookies",
  "cookiebot",
  "usercentrics",
  "borlabs",
] as const;
/** Längere Zeilen sind Inhalt, auch wenn sie „Cookies“ erwähnen. */
const COOKIE_LINE_MAX = 300;

const DATE_DE = String.raw`\d{1,2}\.\d{1,2}\.\d{2,4}(?:,?\s*(?:um\s*)?\d{1,2}:\d{2}(?::\d{2})?(?:\s*Uhr)?)?`;
const DATE_ISO = String.raw`\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?`;
/**
 * „Stand: 11.10.2026 03:12“ – Zeitpunkt der Seite, nicht eines Termins. Groß-/Kleinschreibung zählt, „Stand“ braucht
 * einen Doppelpunkt und darf nicht Teil eines Worts sein („Info-Stand 20.10.2026“ ist ein Termin).
 */
const LABELLED_TIME = new RegExp(
  String.raw`(?<![\p{L}-])(Stand:|Zuletzt aktualisiert(?: am)?:?|Letzte Änderung(?: am)?:?|Aktualisiert am:?|Generiert am:?|Erstellt am:?)(\s*)(?:${DATE_ISO}|${DATE_DE})`,
  "gu",
);
/** Zeitstempel-Felder in JSON-Antworten */
const JSON_TIME =
  /"(updated_?at|created_?at|modified|last_?modified|timestamp|generated(?:_?at)?|dtstamp|server_?time|now)"\s*:\s*("[^"]*"|\d+)/gi;
/**
 * Zeitpunkt mit Sekunden oder Bruchteilen ≠ 0: Uhr des Servers. Termine stehen auf vollen Minuten, auch als
 * `10:15:00.000Z` aus APIs, oder enden auf `23:59:59`; die bleiben.
 */
const SECONDS = String.raw`(?!(?:00|59)(?:\.0+)?(?![\d.]))\d{2}(?:\.\d+)?`;
const ISO_SECONDS = new RegExp(String.raw`\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:${SECONDS}(?:Z|[+-]\d{2}:?\d{2})?`, "g");
const CLOCK_SECONDS = new RegExp(String.raw`\b\d{1,2}:\d{2}:${SECONDS}\b`, "g");
/** Aktuelle Uhrzeit hinter einer Zeitzone, „Mitteleuropäische Zeit (08:45)“ (Calendly) */
const ZONE_CLOCK = /((?:Zeit|Time)\s*)\(\d{1,2}:\d{2}(?:\s*[ap]m)?\)/gi;
/**
 * Unix-Zeit als Cache-Brecher in der Query (`?_=…`, `?v=…`). Nur dort: In JSON-Antworten kann dieselbe Zahl der
 * Beginn eines Termins oder eine ID sein (Arch-Review S1.2, M1).
 */
const EPOCH = /([?&](?:_|t|ts|v|cb|time|timestamp)=)1[6-9]\d{8}(?:\d{3})?\b/g;

const PATH_SESSION = /;jsessionid=[^?#&\s"'<>]*/gi;
const QUERY_SESSION =
  /([?&](?:phpsessid|sid|sessionid|session_id|jsessionid|zenid|oscsid|_ga|_gl|fbclid|gclid|mc_eid|utm_[a-z]+)=)[^&#\s"'<>]*/gi;

const isCookieLine = (line: string) => {
  if (line.length > COOKIE_LINE_MAX) return false;
  const lower = line.toLowerCase();
  return COOKIE_BANNER.some((p) => lower.includes(p));
};

/** Nur Leerraum: so geht der Text als Eingabe ans Modell und ins Artefakt (E9 friert ihn ein). */
export function normalizeWhitespace(text: string): string {
  return flatten(text)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .join("\n");
}

function flatten(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[   ]/g, " ")
    .replace(/[­​-‍⁠﻿]/g, "")
    .replace(/[ \t\f\v]+/g, " ");
}

/** Normalisierung für den Hash: zusätzlich Zeitstempel, Session-IDs und Cookie-Banner (E3). */
export function normalizeText(text: string): string {
  return normalizeValues(text)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !isCookieLine(l))
    .join("\n");
}

/** Zeitstempel und Session-IDs wie `normalizeText`, ohne den Zeilenfilter (für einzeilige Bestandteile, `extractKey`). */
function normalizeValues(text: string): string {
  return flatten(text)
    .replace(LABELLED_TIME, "$1$2<zeit>")
    .replace(JSON_TIME, '"$1":"<zeit>"')
    .replace(ISO_SECONDS, "<zeit>")
    .replace(CLOCK_SECONDS, "<zeit>")
    .replace(ZONE_CLOCK, "$1(<zeit>)")
    .replace(EPOCH, "$1<zeit>")
    .replace(PATH_SESSION, "")
    .replace(QUERY_SESSION, "$1<sid>");
}

export interface HashInput {
  /** abgerufene Seiten in Katalogreihenfolge; `text` wie abgerufen, normalisiert wird hier */
  pages: ReadonlyArray<{ url: string; text: string }>;
  /** zugeordnete Kandidaten aus Sammelkalendern; ihre Reihenfolge zählt nicht */
  candidates: readonly unknown[];
  /** Weitere benannte Bestandteile des Schlüssels; Katalogauszug, Prompt, Schema und Modell setzt `extractKey` (E4). */
  extra?: Readonly<Record<string, string>>;
}

/** sha256 (hex) über den normalisierten Text aller Seiten eines Anbieters plus seine Kandidaten (E3/E4). */
export function inputHash(input: HashInput): string {
  return hash(input, (text) => normalizeText(text));
}

/**
 * Nur Messung (S1.2, R5): Hash über die Zeilen jeder Seite ohne ihre Reihenfolge. Zeigt, wie viele Änderungen nur
 * Umsortierungen sind (FBS sortiert Kurse am selben Tag bei jedem Abruf anders). Kein Cache-Schlüssel: Ein Tausch
 * von Platzständen zwischen zwei Kursen bliebe unsichtbar.
 */
export function orderFreeHash(input: HashInput): string {
  return hash(input, (text) => normalizeText(text).split("\n").sort().join("\n"));
}

/**
 * Offener Nutzerentscheid nach den 7 Messnächten (Plan 0032, S1.2): Wird der reihenfolgefreie Hash Cache-Schlüssel?
 * Dafür: Anbieter, die bei jedem Laden umsortieren (FBS), würden sonst jede Nacht neu extrahiert. Dagegen: Ein
 * reiner Tausch von Platzständen zwischen zwei Kursen bliebe unsichtbar. Bis zum Entscheid der normale Hash.
 */
export const ORDER_FREE_KEY = false;

/** Bestandteile des Schlüssels außer der Eingabe (E4); `catalog` aus `catalogExcerpt`. */
interface KeyParts {
  catalog: string;
  prompt: string;
  schema: string;
  model: string;
}

/** Überschrift des Seitentexts eines iCal-Feeds (`programmeText` in lib/fetch.ts), dahinter die Termine als JSON. */
export const ICAL_HEADING = "## ICAL\n";

/**
 * Cache-Schlüssel der Extraktion (E4, Kostenhebel „vergangene Termine“ in Plan 0032).
 * - `hash`: Grundschlüssel über Seiten, Katalogauszug, Prompt, Schema und Modell, ohne datierte Bestandteile. Ohne solche
 *   ist er bitgleich zum früheren `inputHash`.
 * - `dated`: je letztem Tag (`YYYY-MM-DD`, nur ab `today`) ein Hash über die datierten Bestandteile dieses Tags,
 *   nämlich iCal-Termine ohne RRULE (letzter Berliner Tag) und jeder Termin eines Kandidaten.
 * Was vor heute endet, zählt nicht; sonst änderte jeder Feed den Schlüssel jede Nacht, nur weil die Zeit vergeht.
 */
export interface ExtractKey {
  hash: string;
  dated: Record<string, string>;
}

/** Ändert sich einer der Bestandteile, wird der Anbieter neu extrahiert. Gespeichert in `data/raw` (`inputHash`, `dated`). */
export function extractKey(
  input: { pages: HashInput["pages"]; candidates: readonly Candidate[] },
  parts: KeyParts,
  opts: { today: string; orderFree?: boolean },
): ExtractKey {
  const items: Array<{ day: string; text: string }> = [];
  const pages = input.pages.map((p) => {
    const events = icalEvents(p.text);
    if (!events) return p;
    const rest = events.filter((e) => {
      const day = icalLastDay(e);
      // mit Feed: Ein Termin, der zu einem anderen Feed (Standort) wandert, ist eine Änderung
      if (day) items.push({ day, text: JSON.stringify({ url: p.url, e }) });
      return !day;
    });
    return rest.length === events.length ? p : { url: p.url, text: ICAL_HEADING + JSON.stringify(rest, null, 1) };
  });
  // je Termin: Fällt ein vergangener Termin einer Reihe weg, bleiben die künftigen gleich; eine Änderung am Kandidaten
  // (Titel, Plätze) ändert alle seine Tage
  for (const { occurrences, ...c } of input.candidates)
    for (const o of occurrences)
      items.push({ day: (o.end ?? o.start).slice(0, 10), text: JSON.stringify({ ...c, o }) });
  const base = { pages, candidates: [], extra: { ...parts } };
  const hash = (opts.orderFree ?? ORDER_FREE_KEY) ? orderFreeHash(base) : inputHash(base);
  const byDay = new Map<string, string[]>();
  for (const { day, text } of items)
    if (day >= opts.today) byDay.set(day, [...(byDay.get(day) ?? []), normalizeValues(text)]);
  const dated = Object.fromEntries(
    [...byDay]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, texts]) => [day, createHash("sha256").update(JSON.stringify(texts.sort())).digest("hex")]),
  );
  return { hash, dated };
}

/** Gleiche Eingabe für die Extraktion: gleicher Grundschlüssel und gleiche datierte Bestandteile ab `today`. */
export function sameKey(
  stored: { inputHash?: string | undefined; dated?: Record<string, string> | undefined } | undefined,
  key: ExtractKey,
  today: string,
): boolean {
  if (stored?.inputHash !== key.hash) return false;
  const a = datedFrom(stored.dated ?? {}, today);
  const b = datedFrom(key.dated, today);
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Datierte Bestandteile ab `today`, nach Tag sortiert (zum Vergleichen und Speichern). */
export function datedFrom(dated: Readonly<Record<string, string>>, today: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(dated)
      .filter(([day]) => day >= today)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

type IcalItem = Record<string, unknown>;

/** Termine eines iCal-Seitentexts, sonst `undefined` (andere Art oder kein lesbares JSON). */
function icalEvents(text: string): IcalItem[] | undefined {
  if (!text.startsWith(ICAL_HEADING)) return undefined;
  try {
    const parsed: unknown = JSON.parse(text.slice(ICAL_HEADING.length));
    return Array.isArray(parsed) && parsed.every(isRecord) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

const isRecord = (v: unknown): v is IcalItem => typeof v === "object" && v !== null && !Array.isArray(v);

/** Datum oder lokale/UTC-Zeit (`ical.ts` verwirft Parameter wie TZID und VALUE); alles andere ist nicht lesbar. */
const ICAL_DATE = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/;

/** Berliner Tag eines iCal-Werts; `allDay`: nur ein Datum (ganztägig, DTEND ist dann exklusiv). */
function icalDay(v: unknown): { day: string; allDay: boolean } | undefined {
  const m = typeof v === "string" ? ICAL_DATE.exec(v) : null;
  if (!m) return undefined;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  // UTC exakt umrechnen (`20261011T223000Z` ist der 12. in Berlin); lokale Zeiten gelten als Berliner Zeit
  if (m[7]) return { day: berlinIsoDate(`${day}T${m[4]}:${m[5]}:${m[6]}Z`), allDay: false };
  return { day, allDay: m[4] === undefined };
}

/**
 * Letzter Berliner Tag eines einzelnen iCal-Termins; Serien (RRULE) und Termine ohne lesbares DTSTART haben keinen.
 * Exakt, ohne Zuschlag: Ein Tag zu lange hieße, dass der gestrige Termin noch zählt, wenn der Feed ihn nachts schon
 * weglässt, und der Hebel griffe nie (Arch-Review, Blocker 1).
 */
function icalLastDay(e: IcalItem): string | undefined {
  if (e["RRULE"] !== undefined) return undefined;
  const start = icalDay(e["DTSTART"]);
  if (!start) return undefined;
  const end = icalDay(e["DTEND"]);
  const last = end ? (end.allDay ? addDays(end.day, -1) : end.day) : start.day;
  return last > start.day ? last : start.day;
}

/** Katalogauszug für den Schlüssel: der Eintrag ohne `notes` (Protokoll für Menschen, ADR 0025, Punkt 5). */
export function catalogExcerpt(provider: Provider): string {
  const { notes: _notes, ...rest } = provider;
  return JSON.stringify(rest);
}

function hash(input: HashInput, pageText: (text: string) => string): string {
  const payload = {
    pages: input.pages.map((p) => [normalizeText(p.url), pageText(p.text)]),
    candidates: input.candidates.map((c) => normalizeText(JSON.stringify(c))).sort(),
    extra: Object.entries(input.extra ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
