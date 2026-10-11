/**
 * Große Anbieter in Teilen extrahieren (Plan 0032, E4, Nachtrag „Aufteilen“): Die Ausgabe des Modells wächst mit
 * der Zahl der Angebote, nicht mit der Eingabe, und ist auf `CLAUDE_CODE_MAX_OUTPUT_TOKENS` begrenzt (davon 70–85 %
 * Thinking). Über der Schwelle wird die Eingabe deshalb in Teile zerlegt, jeder Teil ist ein eigener Aufruf.
 *
 * Geschnitten wird nur an Grenzen, die keinen Eintrag trennen:
 * 1. zwischen Seiten (`## Seite N: …`); kleine Seiten werden der Reihe nach bis zur Schwelle zusammengepackt;
 * 2. in einer Seite über der Schwelle vor jedem Abschnitt (`## TEXT`, `## ICAL`, `## JSON-LD`);
 * 3. in JSON (iCal, JSON-Schnittstelle, JSON-LD) nur zwischen den Elementen einer Ebene, oberste Ebene zuerst;
 * 4. im Text nach der wiederkehrenden Zeile, die einen Eintrag abschließt: die häufigste Zeile (mindestens 3-mal),
 *    bei Gleichstand die, die im ersten Eintrag zuletzt kommt (fbs-nuernberg.de: „Angebot drucken »“, Staatstheater:
 *    „Tickets“, PDF der Stadtbibliothek: die Fußzeile je Seite);
 * 5. erst wenn nichts davon greift, an Zeilengrenzen.
 * Ein Teil einer zerlegten Seite beginnt wieder mit ihrer Kopfzeile, damit `sourceUrl` eindeutig bleibt. Der
 * Abschnitt `## Kandidaten (N)` (nur der letzte, wie in `inputsFromFetch`) kommt in den ersten Teil, in den er
 * passt, sonst in einen eigenen; über der Schwelle zeilenweise mit eigener Zahl je Teil.
 */
import { slug } from "../../../src/domain/ids.ts";
import { expansionWindow, type RawEvent } from "./raw.ts";
import { type ExpandWindow, expandSchedule } from "./schedule.ts";
import { similarTitle } from "./similar.ts";

/**
 * Schwelle in Zeichen je Teil. Gemessen mit Haiku an fbs-nuernberg.de (2026-10-11, dichteste Eingabe, ~1 600 Zeichen
 * je Kurs): Teile bis 30 000 Zeichen brauchten 9 000–25 500 Ausgabe-Tokens (Thinking eingeschlossen) von 32 000.
 * 25 000 lassen rund ein Drittel Luft; Abschneiden kostet den ganzen Anbieter. Begründung: Plan 0032, „Aufteilen“.
 */
export const PART_MAX_CHARS = 25_000;

const PAGE_HEADER = /^## Seite \d+: /;
const CANDIDATES_HEADER = /^## Kandidaten \(\d+\)$/;
/** Abschnitte innerhalb einer Seite (`programmeText`): `## TEXT`, `## ICAL`, `## JSON-LD` */
const SECTION_HEADER = /^## /;
const MIN_REPEATS = 3;

type Lines = readonly string[];

const size = (lines: Lines) => lines.reduce((n, l) => n + l.length, 0) + Math.max(0, lines.length - 1);

/** Zeilen nach den Indizes in `after` trennen (Schnitt jeweils hinter der Zeile). */
function cutAfter<T>(items: readonly T[], after: readonly number[]): T[][] {
  const out: T[][] = [];
  let start = 0;
  for (const i of after) {
    if (i + 1 <= start || i + 1 >= items.length) continue;
    out.push(items.slice(start, i + 1));
    start = i + 1;
  }
  out.push(items.slice(start));
  return out;
}

/** Aufeinanderfolgende Stücke zusammenlegen, solange sie unter der Schwelle bleiben. */
function pack(pieces: readonly (readonly string[])[], max: number): string[][] {
  const out: string[][] = [];
  for (const piece of pieces) {
    const last = out.at(-1);
    if (last && size(last) + 1 + size(piece) <= max) last.push(...piece);
    else out.push([...piece]);
  }
  return out;
}

/** Letzter Ausweg: an Zeilengrenzen. Eine einzelne Zeile über der Schwelle bleibt ganz. */
const byLines = (lines: Lines, max: number) =>
  pack(
    lines.map((l) => [l]),
    max,
  );

/** Zeile, die einen Eintrag abschließt (siehe Kopf, Punkt 4), oder undefined. */
function entryEnd(lines: Lines): string | undefined {
  const seen = new Map<string, { count: number; first: number }>();
  lines.forEach((l, i) => {
    if (SECTION_HEADER.test(l)) return;
    const s = seen.get(l);
    if (s) s.count++;
    else seen.set(l, { count: 1, first: i });
  });
  let best: { line: string; count: number; first: number } | undefined;
  for (const [line, s] of seen) {
    if (s.count < MIN_REPEATS) continue;
    if (!best || s.count > best.count || (s.count === best.count && s.first > best.first)) best = { line, ...s };
  }
  return best?.line;
}

function splitText(lines: Lines, max: number): string[][] {
  if (size(lines) <= max) return [[...lines]];
  const end = entryEnd(lines);
  const cuts = end === undefined ? [] : lines.flatMap((l, i) => (l === end ? [i] : []));
  const pieces = cutAfter(lines, cuts);
  if (pieces.length <= 1) return byLines(lines, max);
  return pack(
    pieces.flatMap((p) => splitText(p, max)),
    max,
  );
}

interface JsonLine {
  line: string;
  /** Verschachtelungstiefe vor und nach der Zeile (Klammern in Zeichenketten zählen nicht) */
  before: number;
  after: number;
}

function jsonLines(lines: Lines): JsonLine[] {
  let depth = 0;
  return lines.map((line) => {
    const before = depth;
    let inString = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inString) {
        if (c === "\\") i++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") depth--;
    }
    return { line, before, after: depth };
  });
}

const MAX_JSON_LEVEL = 8;

/** Schnitt hinter Zeilen, die auf `level` zurückschließen; reicht das nicht, eine Ebene tiefer. */
function splitJson(items: readonly JsonLine[], level: number, max: number): string[][] {
  const lines = items.map((j) => j.line);
  if (size(lines) <= max) return [lines];
  if (level > MAX_JSON_LEVEL) return byLines(lines, max);
  const cuts = items.flatMap((j, i) => (j.after === level && j.before > level ? [i] : []));
  const pieces = cutAfter(items, cuts);
  if (pieces.length <= 1) return splitJson(items, level + 1, max);
  return pack(
    pieces.flatMap((p) => splitJson(p, level + 1, max)),
    max,
  );
}

/** Rumpf einer Seite (ohne Kopfzeile) in Stücke unter `max`: Abschnitte, dann JSON oder Text. */
function splitBody(lines: Lines, max: number): string[][] {
  const starts = lines.flatMap((l, i) => (i > 0 && SECTION_HEADER.test(l) ? [i - 1] : []));
  const sections = cutAfter(lines, starts);
  const pieces = sections.flatMap((section) => {
    const [head, ...rest] = section;
    const hasHead = head !== undefined && SECTION_HEADER.test(head);
    const body = hasHead ? rest : section;
    const isJson = body[0] === "[" || body[0] === "{";
    if (!isJson) return splitText(section, max);
    // Kopf des Abschnitts zum ersten Stück; Tiefe zählt ab dem JSON
    const json = splitJson(jsonLines(body), 1, hasHead ? max - head.length - 1 : max);
    return hasHead ? [[head, ...(json[0] ?? [])], ...json.slice(1)] : json;
  });
  return pack(pieces, max);
}

/** Blöcke einer Seite: ganz, oder Stücke mit wiederholter Kopfzeile. */
function pageBlocks(page: Lines, max: number): string[] {
  if (size(page) <= max) return [page.join("\n")];
  const [head, ...body] = page;
  if (head === undefined || !PAGE_HEADER.test(head)) return splitBody(page, max).map((p) => p.join("\n"));
  return splitBody(body, max - head.length - 1).map((p) => [head, ...p].join("\n"));
}

function candidateBlocks(rows: Lines, max: number): string[] {
  const block = (r: Lines) => [`## Kandidaten (${r.length})`, ...r].join("\n");
  if (block(rows).length <= max) return [block(rows)];
  // Kopfzeile mit bis zu fünf Stellen einplanen
  return byLines(rows, max - "## Kandidaten (00000)".length - 1).map(block);
}

/** Eingabe eines Anbieters (`assembleProvider`) in Teile bis `maxChars`; bis zur Schwelle unverändert ein Teil. */
export function splitInput(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const lines = text.split("\n");
  const at = lines.findLastIndex((l) => CANDIDATES_HEADER.test(l));
  const pageLines = at >= 0 ? lines.slice(0, at) : lines;
  const rows = at >= 0 ? lines.slice(at + 1) : [];
  const starts = pageLines.flatMap((l, i) => (i > 0 && PAGE_HEADER.test(l) ? [i - 1] : []));
  const pages = cutAfter(pageLines, starts).filter((p) => p.length > 0 && size(p) > 0);
  const parts = pack(
    pages.flatMap((p) => pageBlocks(p, maxChars)).map((b) => [b]),
    maxChars,
  ).map((p) => p.join("\n"));
  if (at >= 0)
    for (const block of candidateBlocks(rows, maxChars)) {
      const fit = parts.findIndex((p) => p.length + 1 + block.length <= maxChars);
      if (fit >= 0) parts[fit] = `${parts[fit]}\n${block}`;
      else parts.push(block);
    }
  return parts;
}

type Mergeable = Pick<RawEvent, "title" | "venueId" | "schedule" | "format">;

/** Fenster für den Vergleich der Termine (wie `validateRaw`: Kurse mit allen Terminen, sonst ab Horizontbeginn). */
export interface MergeWindow {
  from: string;
  to: string;
  freeDays: ExpandWindow["freeDays"];
}

/**
 * Schlüssel, unter dem zwei Events aus verschiedenen Teilen sicher dasselbe Angebot sind: regelmäßige Angebote über
 * ihre ID (gekürzter Titel und Ort, ADR 0006, wie in `validateRaw`), sonst gleicher Titel, Ort und gleiche Termine.
 */
function sameOfferKey(e: Mergeable): string {
  return e.format === "regelmaessig"
    ? JSON.stringify(["regelmaessig", slug(e.title), e.venueId])
    : JSON.stringify([e.title, e.venueId, e.schedule]);
}

function starts(e: Mergeable, w: MergeWindow): string[] {
  return expandSchedule(e.schedule, {
    to: expansionWindow(e, w.to),
    freeDays: w.freeDays,
    ...(e.format === "kurs" ? {} : { from: w.from }),
  })
    .map((o) => o.start)
    .filter((start) => e.format === "kurs" || start.slice(0, 10) >= w.from);
}

/**
 * Events aller Teile der Reihe nach vereinigen. Dasselbe Angebot auf mehreren Seiten (fbs-nuernberg.de: Kursliste,
 * Seite des Treffs, Suchseite) kommt aus mehreren Teilen, oft anders formuliert. Ein Event aus einem späteren Teil
 * gilt als schon erfasst, wenn ein früheres
 * - denselben Schlüssel hat (`sameOfferKey`; ein regelmäßiges Angebot mit derselben ID wäre im Build ohnehin eines),
 * - oder am selben Ort mit demselben ersten Termin beginnt und einen ähnlichen Titel hat (`similarTitle`, wie die
 *   Dublettenprüfung des Builds).
 * Im zweiten Fall entfällt es, wenn seine Termine im früheren enthalten sind oder es regelmäßig ist; sonst bekommt es
 * den Titel des früheren, damit der Build die Termine vereinigt (gleicher `windowKey`). Innerhalb eines Teils bleibt
 * alles, wie es das Modell geliefert hat (dort prüft `validateRaw`).
 */
export function mergeParts<T extends Mergeable>(
  parts: readonly (readonly T[])[],
  window: MergeWindow,
): { events: T[]; duplicates: number; retitled: number } {
  const keys = new Set<string>();
  const earlier: Array<{ e: T; starts: string[] }> = [];
  const events: T[] = [];
  let duplicates = 0;
  let retitled = 0;
  for (const part of parts) {
    const added: Array<{ e: T; starts: string[] }> = [];
    for (const e of part) {
      if (keys.has(sameOfferKey(e))) {
        duplicates++;
        continue;
      }
      const own = starts(e, window);
      const twin = earlier.find(
        (x) =>
          x.e.venueId === e.venueId &&
          x.starts[0] !== undefined &&
          x.starts[0] === own[0] &&
          similarTitle(x.e.title, e.title),
      );
      if (twin && (e.format === "regelmaessig" || own.every((s) => twin.starts.includes(s)))) {
        duplicates++;
        continue;
      }
      const kept = twin ? { ...e, title: twin.e.title } : e;
      if (twin) retitled++;
      events.push(kept);
      added.push({ e: kept, starts: own });
    }
    for (const a of added) keys.add(sameOfferKey(a.e));
    earlier.push(...added);
  }
  return { events, duplicates, retitled };
}
