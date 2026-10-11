/**
 * Große Anbieter in Teilen extrahieren (Plan 0032, E4, Nachtrag „Aufteilen“): Die Ausgabe des Modells wächst mit
 * der Zahl der Angebote, nicht mit der Eingabe, und ist auf `CLAUDE_CODE_MAX_OUTPUT_TOKENS` begrenzt (davon 70–85 %
 * Thinking). Über der Schwelle wird die Eingabe deshalb in Teile zerlegt, jeder Teil ist ein eigener Aufruf.
 *
 * Geschnitten wird nur an Grenzen, die keinen Eintrag trennen:
 * 1. zwischen Seiten (`## Seite N: …`); kleine Seiten werden der Reihe nach bis zur Schwelle zusammengepackt;
 * 2. in einer Seite über der Schwelle vor jedem Abschnitt (`## TEXT`, `## ICAL`, `## JSON-LD`);
 * 3. in JSON (iCal, JSON-Schnittstelle, JSON-LD) nur zwischen den Elementen einer Ebene, oberste Ebene zuerst;
 * 4. im Text nach der wiederkehrenden Zeile, die einen Eintrag abschließt (`entryEnd`: die im ersten Eintrag letzte
 *    der Zeilen, die je Eintrag einmal vorkommen; fbs-nuernberg.de: „Angebot drucken »“, Staatstheater: „Tickets“,
 *    PDF der Stadtbibliothek: die Fußzeile je Seite); ist sie ein Feldname („Leitung:“), nach dessen Wert;
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

/** Zählt, wo nur noch an Zeilengrenzen geschnitten werden konnte (Hinweis bis `nightly.json`). */
interface Fallbacks {
  lines: number;
}

/** Letzter Ausweg: an Zeilengrenzen. Eine einzelne Zeile über der Schwelle bleibt ganz. */
function byLines(lines: Lines, max: number, fb: Fallbacks): string[][] {
  const out = pack(
    lines.map((l) => [l]),
    max,
  );
  if (out.length > 1) fb.lines += out.length - 1;
  return out;
}

/**
 * Zeile, die einen Eintrag abschließt (siehe Kopf, Punkt 4), oder undefined. Kandidaten sind Zeilen, die mindestens
 * 3-mal und mindestens halb so oft wie die häufigste vorkommen. Je Eintrag kommen die festen Feldzeilen gleich oft
 * vor; deshalb zählt die Häufigkeit, die die meisten Zeilen teilen (eine Zeile, die zweimal je Eintrag steht, etwa
 * zwei „Uhrzeit:“, gewinnt so nicht), bei Gleichstand die höhere. In dieser Gruppe gilt die Zeile, die im ersten
 * Eintrag zuletzt kommt.
 */
function entryEnd(lines: Lines): string | undefined {
  const seen = new Map<string, { count: number; first: number }>();
  lines.forEach((l, i) => {
    if (SECTION_HEADER.test(l)) return;
    const s = seen.get(l);
    if (s) s.count++;
    else seen.set(l, { count: 1, first: i });
  });
  const maxCount = Math.max(0, ...[...seen.values()].map((s) => s.count));
  const floor = Math.max(MIN_REPEATS, Math.ceil(maxCount / 2));
  const groups = new Map<number, Array<{ line: string; first: number }>>();
  for (const [line, s] of seen)
    if (s.count >= floor) groups.set(s.count, [...(groups.get(s.count) ?? []), { line, first: s.first }]);
  let best: { count: number; members: Array<{ line: string; first: number }> } | undefined;
  for (const [count, members] of groups)
    if (!best || members.length > best.members.length || (members.length === best.members.length && count > best.count))
      best = { count, members };
  return best?.members.reduce((a, b) => (b.first > a.first ? b : a)).line;
}

function splitText(lines: Lines, max: number, fb: Fallbacks): string[][] {
  if (size(lines) <= max) return [[...lines]];
  const end = entryEnd(lines);
  // Endet die Zeile mit „:“ (Feldname), gehört die nächste noch zum Eintrag (martha-maria.de: „Leitung:“, Name)
  const after = end?.endsWith(":") ? 1 : 0;
  const cuts = end === undefined ? [] : lines.flatMap((l, i) => (l === end ? [i + after] : []));
  const pieces = cutAfter(lines, cuts);
  if (pieces.length <= 1) return byLines(lines, max, fb);
  return pack(
    pieces.flatMap((p) => splitText(p, max, fb)),
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
function splitJson(items: readonly JsonLine[], level: number, max: number, fb: Fallbacks): string[][] {
  const lines = items.map((j) => j.line);
  if (size(lines) <= max) return [lines];
  if (level > MAX_JSON_LEVEL) return byLines(lines, max, fb);
  const cuts = items.flatMap((j, i) => (j.after === level && j.before > level ? [i] : []));
  const pieces = cutAfter(items, cuts);
  if (pieces.length <= 1) return splitJson(items, level + 1, max, fb);
  return pack(
    pieces.flatMap((p) => splitJson(p, level + 1, max, fb)),
    max,
  );
}

/** Rumpf einer Seite (ohne Kopfzeile) in Stücke unter `max`: Abschnitte, dann JSON oder Text. */
function splitBody(lines: Lines, max: number, fb: Fallbacks): string[][] {
  const starts = lines.flatMap((l, i) => (i > 0 && SECTION_HEADER.test(l) ? [i - 1] : []));
  const sections = cutAfter(lines, starts);
  const pieces = sections.flatMap((section) => {
    const [head, ...rest] = section;
    const hasHead = head !== undefined && SECTION_HEADER.test(head);
    const body = hasHead ? rest : section;
    const isJson = body[0] === "[" || body[0] === "{";
    if (!isJson) return splitText(section, max, fb);
    // Kopf des Abschnitts zum ersten Stück; Tiefe zählt ab dem JSON
    const json = splitJson(jsonLines(body), 1, hasHead ? max - head.length - 1 : max, fb);
    return hasHead ? [[head, ...(json[0] ?? [])], ...json.slice(1)] : json;
  });
  return pack(pieces, max);
}

/** Blöcke einer Seite: ganz, oder Stücke mit wiederholter Kopfzeile. */
function pageBlocks(page: Lines, max: number, notes: string[]): string[] {
  if (size(page) <= max) return [page.join("\n")];
  const [head, ...body] = page;
  const fb: Fallbacks = { lines: 0 };
  const own = head !== undefined && PAGE_HEADER.test(head);
  const blocks = own
    ? splitBody(body, max - head.length - 1, fb).map((p) => [head, ...p].join("\n"))
    : splitBody(page, max, fb).map((p) => p.join("\n"));
  if (fb.lines > 0)
    notes.push(
      `${own ? head.replace(/ \([^)]*\)$/, "").replace(/^## /, "") : "Eingabe"}: ${fb.lines}-mal nur an Zeilengrenzen geschnitten, ein Eintrag kann getrennt sein`,
    );
  return blocks;
}

function candidateBlocks(rows: Lines, max: number): string[] {
  const block = (r: Lines) => [`## Kandidaten (${r.length})`, ...r].join("\n");
  if (block(rows).length <= max) return [block(rows)];
  // Kopfzeile mit bis zu fünf Stellen einplanen; jede Zeile ist ein Kandidat, ein Schnitt trennt keinen
  return pack(
    rows.map((r) => [r]),
    max - "## Kandidaten (00000)".length - 1,
  ).map(block);
}

/** Was der Abruf über die Eingabe weiß; nur diese Kopfzeilen sind echte Grenzen (Schutz gegen gefälschte im Text). */
export interface InputLayout {
  /** URLs der abgerufenen Seiten in der Reihenfolge von `assembleProvider` (`## Seite 1: …` ist die erste) */
  pageUrls: readonly string[];
  /** Zahl der Kandidaten; nur dann gibt es einen Abschnitt `## Kandidaten (N)` mit genau dieser Zahl */
  candidates: number;
}

/**
 * Eingabe eines Anbieters (`assembleProvider`) in Teile bis `maxChars`; bis zur Schwelle unverändert ein Teil.
 * Seitengrenze ist nur die Kopfzeile `## Seite k: <k-te URL> (` in der erwarteten Reihenfolge, Kandidatenabschnitt nur
 * der letzte mit der erwarteten Zahl; Gleiches im Seitentext bleibt Text. `notes`: wo nur an Zeilengrenzen
 * geschnitten werden konnte.
 */
export function splitInput(text: string, maxChars: number, layout: InputLayout): { parts: string[]; notes: string[] } {
  if (text.length <= maxChars) return { parts: [text], notes: [] };
  const lines = text.split("\n");
  const candidatesHeader = `## Kandidaten (${layout.candidates})`;
  const at = layout.candidates > 0 ? lines.lastIndexOf(candidatesHeader) : -1;
  const pageLines = at >= 0 ? lines.slice(0, at) : lines;
  const rows = at >= 0 ? lines.slice(at + 1) : [];
  const starts: number[] = [];
  let next = 0;
  pageLines.forEach((l, i) => {
    const url = layout.pageUrls[next];
    if (url !== undefined && l.startsWith(`## Seite ${next + 1}: ${url} (`)) {
      if (i > 0) starts.push(i - 1);
      next++;
    }
  });
  const notes: string[] = [];
  const pages = cutAfter(pageLines, starts).filter((p) => p.length > 0 && size(p) > 0);
  const parts = pack(
    pages.flatMap((p) => pageBlocks(p, maxChars, notes)).map((b) => [b]),
    maxChars,
  ).map((p) => p.join("\n"));
  if (at >= 0)
    for (const block of candidateBlocks(rows, maxChars)) {
      const fit = parts.findIndex((p) => p.length + 1 + block.length <= maxChars);
      if (fit >= 0) parts[fit] = `${parts[fit]}\n${block}`;
      else parts.push(block);
    }
  return { parts, notes };
}

type Mergeable = Pick<RawEvent, "title" | "venueId" | "schedule" | "format" | "age">;

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

type Occurrences = Array<{ start: string; end?: string | undefined }>;

function occurrences(e: Mergeable, w: MergeWindow): Occurrences {
  return expandSchedule(e.schedule, {
    to: expansionWindow(e, w.to),
    freeDays: w.freeDays,
    ...(e.format === "kurs" ? {} : { from: w.from }),
  }).filter((o) => e.format === "kurs" || o.start.slice(0, 10) >= w.from);
}

/** Alles außer dem Titel, woran zwei Fassungen desselben Angebots gleich sein müssen. */
function shape(e: Mergeable, occ: Occurrences): string {
  const s = e.schedule;
  const weekdays = s.kind === "weekly" ? s.weekdays : s.kind === "monthly" ? [s.nth, s.weekday] : null;
  return JSON.stringify([e.venueId, e.format, e.age ?? null, occ[0]?.start ?? null, occ[0]?.end ?? null, weekdays]);
}

export interface MergeResult<T> {
  events: T[];
  /** je entfallenem oder angeglichenem Event eine Zeile mit beiden Titeln, für den Bericht */
  notes: string[];
}

/**
 * Events aller Teile der Reihe nach vereinigen. Dasselbe Angebot auf mehreren Seiten (fbs-nuernberg.de: Kursliste,
 * Seite des Treffs, Suchseite) kommt aus mehreren Teilen, oft anders formuliert. Ein Event aus einem späteren Teil
 * gilt als schon erfasst, wenn ein früheres
 * - denselben Schlüssel hat (`sameOfferKey`; ein regelmäßiges Angebot mit derselben ID wäre im Build eines oder ein
 *   Fehler, ADR 0006),
 * - oder gleich gebaut ist (Ort, Format, Alter, Beginn und Ende des ersten Termins, Wochentage) und einen ähnlichen
 *   Titel hat (`similarTitle`).
 * Im zweiten Fall entfällt es, wenn seine Termine im früheren enthalten sind; sonst bekommt es den Titel des
 * früheren, damit der Build die Termine vereinigt (gleicher `windowKey`). Anders als die Dublettenprüfung des Builds
 * (nur rangniedere Quellen) gilt das für gleichrangige Events, deshalb die strenge Gleichheit; zwei parallele Gruppen
 * mit anderem Alter oder anderer Uhrzeit bleiben beide. Innerhalb eines Teils bleibt alles, wie es das Modell
 * geliefert hat (dort prüft `validateRaw`).
 */
export function mergeParts<T extends Mergeable>(parts: readonly (readonly T[])[], window: MergeWindow): MergeResult<T> {
  const keys = new Map<string, { title: string; part: number }>();
  const earlier: Array<{ e: T; occ: Occurrences; shape: string; part: number }> = [];
  const events: T[] = [];
  const notes: string[] = [];
  parts.forEach((part, p) => {
    const added: typeof earlier = [];
    for (const e of part) {
      const label = `Teil ${p + 1}: „${e.title}“`;
      const same = keys.get(sameOfferKey(e));
      if (same) {
        notes.push(`${label} entfällt, gleich „${same.title}“ aus Teil ${same.part}`);
        continue;
      }
      const occ = occurrences(e, window);
      const own = shape(e, occ);
      const twin = earlier.find((x) => occ.length > 0 && x.shape === own && similarTitle(x.e.title, e.title));
      if (twin && (e.format === "regelmaessig" || occ.every((o) => twin.occ.some((t) => t.start === o.start)))) {
        notes.push(`${label} entfällt, Termine schon in „${twin.e.title}“ aus Teil ${twin.part}`);
        continue;
      }
      const kept = twin ? { ...e, title: twin.e.title } : e;
      if (twin) notes.push(`${label} unter dem Titel „${twin.e.title}“ aus Teil ${twin.part} (Termine vereinigt)`);
      events.push(kept);
      added.push({ e: kept, occ, shape: own, part: p + 1 });
    }
    for (const a of added) keys.set(sameOfferKey(a.e), { title: a.e.title, part: a.part });
    earlier.push(...added);
  });
  return { events, notes };
}
