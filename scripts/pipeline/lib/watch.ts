/**
 * Wächter des Nachtlaufs (Plan 0048, E10; ADR 0033, Punkt 5), reine Logik: Befunde aus dem Zustand `data/raw` nach dem
 * Lauf und der Text des Wächter-Issues. Den Ablauf (Issue anlegen, bearbeiten, schließen) macht der Job `waechter` in
 * `.github/workflows/nightly.yml` mit `gh`, ohne Checkout; er vergleicht nur die Marker.
 */
import { createHash } from "node:crypto";
import { addDays, berlinIsoDate, formatGermanDate } from "../../../src/domain/time.ts";
import { isV2, type ProviderRaw, type ProviderRawV2, type UnitState } from "./raw.ts";

type WatchKind = "seite" | "entfernt" | "gesperrt" | "einbruch" | "leer" | "anbieter" | "umstellung";

export interface WatchFinding {
  providerId: string;
  kind: WatchKind;
  /** Kennung der Einheit oder Beilage (`seite:<URL>`, `kandidaten`); nur bei Befunden einer Seite */
  page?: string | undefined;
  reason: string;
  /** Zeitpunkt, seit dem der Befund gilt */
  since?: string | undefined;
}

/** `leer` wird so lange gemeldet, wie das späteste `emptySince` höchstens so viele Tage zurückliegt (Ziel 3) */
const EMPTY_REPORT_DAYS = 14;

/** Seit mindestens einem Kalendertag (Europe/Berlin) vor `today`, also mindestens die zweite Nacht */
const sinceYesterday = (instant: string | undefined, today: string) =>
  instant !== undefined && berlinIsoDate(instant) <= addDays(today, -1);

function unitFindings(providerId: string, page: string, u: UnitState, today: string): WatchFinding[] {
  const out: WatchFinding[] = [];
  if (u.removedAt !== undefined)
    out.push({ providerId, kind: "entfernt", page, reason: u.reason ?? "entfernt", since: u.removedAt });
  else if (u.klasse === "gesperrt")
    out.push({ providerId, kind: "gesperrt", page, reason: u.reason ?? "gesperrt", since: u.klasseSince });
  else if (u.status === "fehler" && sinceYesterday(u.failingSince, today))
    out.push({ providerId, kind: "seite", page, reason: u.reason ?? "Fehler", since: u.failingSince });
  if (u.pending)
    out.push({
      providerId,
      kind: "einbruch",
      page,
      reason: `zurückgehalten: ${u.pending.events.length} statt ${u.events.length} Events`,
    });
  return out;
}

function beilageFindings(providerId: string, raw: ProviderRawV2, today: string): WatchFinding[] {
  return Object.entries(raw.beilagen ?? {}).flatMap(([page, b]): WatchFinding[] => {
    const reason = `Beilage: ${b.reason ?? "Fehler"}`;
    if (b.klasse === "gesperrt") return [{ providerId, kind: "gesperrt", page, reason, since: b.klasseSince }];
    if (b.status === "fehler" && sinceYesterday(b.failingSince, today))
      return [{ providerId, kind: "seite", page, reason, since: b.failingSince }];
    return [];
  });
}

/**
 * Keine Einheit hat künftige Events: `emptySince` pflegt `refresh` in jedem Pfad genau für „hat Events, aber keine
 * künftigen“ (lib/refresh.ts, `withEmptySince`), der Wächter rechnet den Kalender nicht nach. Gemeldet, solange das
 * späteste `emptySince` höchstens 14 Tage zurückliegt.
 */
function emptyFinding(providerId: string, units: readonly UnitState[], today: string): WatchFinding[] {
  if (!units.every((u) => u.events.length === 0 || u.emptySince !== undefined)) return [];
  const latest = units
    .flatMap((u) => (u.emptySince ? [u.emptySince] : []))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  if (latest === undefined || berlinIsoDate(latest) < addDays(today, -EMPTY_REPORT_DAYS)) return [];
  return [{ providerId, kind: "leer", reason: "keine künftigen Angebote", since: latest }];
}

/**
 * Befunde des Wächters (E10) aus dem ganzen Zustand nach dem Lauf, nicht nur aus den Anbietern des Laufs (ein Lauf mit
 * `only` sähe sonst eine Teilmenge und schlösse das Issue falsch; Arch-Review S2, M1). Gezählt werden die Anbieter
 * des Katalogs, die der Nachtlauf abruft (`role: anbieter`, ohne `skipCrawl`). `today` ist das Datum des Laufs.
 * Scheitern alle Einheiten seit mindestens einem Tag, steht eine Zeile `anbieter` statt einer je Seite.
 */
export function watchFindings(i: {
  raws: Readonly<Record<string, ProviderRaw>>;
  catalog: ReadonlyArray<{ id: string; role: string; skipCrawl?: unknown }>;
  today: string;
}): WatchFinding[] {
  const crawled = new Set(i.catalog.filter((p) => p.role === "anbieter" && p.skipCrawl === undefined).map((p) => p.id));
  const out: WatchFinding[] = [];
  for (const [providerId, raw] of Object.entries(i.raws)) {
    if (!crawled.has(providerId)) continue;
    if (!isV2(raw)) {
      out.push({ providerId, kind: "umstellung", reason: "Rohdatei noch im alten Format (V1)" });
      continue;
    }
    const units = Object.entries(raw.units);
    const pages = units.flatMap(([page, u]) => unitFindings(providerId, page, u, i.today));
    const allFailing =
      units.length > 0 && units.every(([, u]) => u.status === "fehler" && sinceYesterday(u.failingSince, i.today));
    if (allFailing) {
      const since = units.map(([, u]) => u.failingSince ?? "").sort((a, b) => Date.parse(a) - Date.parse(b))[0];
      const reasons = units.map(([page, u]) => `${page}: ${u.reason ?? "Fehler"}`).join("; ");
      out.push({ providerId, kind: "anbieter", reason: `alle ${units.length} Seiten scheitern (${reasons})`, since });
    }
    out.push(...pages.filter((f) => !(allFailing && f.kind === "seite")));
    out.push(...beilageFindings(providerId, raw, i.today));
    out.push(...emptyFinding(providerId, Object.values(raw.units), i.today));
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return out.sort((a, b) => cmp(a.providerId, b.providerId) || cmp(a.kind, b.kind) || cmp(a.page ?? "", b.page ?? ""));
}

/** Schlüssel im Marker: Anbieter-ID, bei Befunden einer Seite `<id>#<SHA-256 der Kennung, 8 Hex-Zeichen>` */
export function watchKey(f: WatchFinding): string {
  return f.page === undefined
    ? f.providerId
    : `${f.providerId}#${createHash("sha256").update(f.page).digest("hex").slice(0, 8)}`;
}

/** Letzte Zeile des Issue-Texts; der Job `waechter` liest sie mit demselben Zeichensatz (`grep -o`) */
export const WATCH_MARKER = /^<!-- waechter: ([a-z0-9:,#-]*) -->$/m;
const MAX_LINE = 200;
const MAX_TOTAL = 60_000;
/** Höchstlänge der Seite in einer Zeile; den Rest bekommt der Grund */
const MAX_PAGE = 90;

/** Fremder Text für einen Code-Span: ohne Backticks und Zeilenumbrüche, `@` entschärft, gekürzt mit „…“ */
function clean(s: string, max: number): string {
  const t = s
    .replaceAll("`", "'")
    .replace(/\s*[\r\n]+\s*/g, " ")
    .replaceAll("@", "(at)");
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}…`;
}

function line(f: WatchFinding): string {
  const head = `- \`${clean(f.providerId, 60)}\` · ${f.kind}`;
  const tail = f.since ? ` · seit ${formatGermanDate(berlinIsoDate(f.since))}` : "";
  // je Code-Span „ · `…`“: 5 Zeichen Rahmen
  let room = MAX_LINE - head.length - tail.length - 5;
  let page = "";
  if (f.page !== undefined) {
    const p = clean(f.page, Math.min(MAX_PAGE, room - 5 - 10));
    page = ` · \`${p}\``;
    room -= p.length + 5;
  }
  return `${head}${page} · \`${clean(f.reason, room)}\`${tail}`;
}

/**
 * Text des Wächter-Issues (E10) als Liste; leer ohne Befunde. Letzte Zeile ein Marker mit den Paaren `schlüssel:art`,
 * an dem der Job neue Befunde erkennt. Gesamt unter 60 000 Zeichen: Der Marker trägt alle Paare, die Liste wird bei
 * Bedarf gekürzt.
 */
export function watchIssue(findings: readonly WatchFinding[], today: string): string {
  if (findings.length === 0) return "";
  const pairs = findings.map((f) => `${watchKey(f)}:${f.kind}`);
  const markerOf = (ps: readonly string[]) => `<!-- waechter: ${ps.join(",")} -->`;
  // nur bei tausenden Befunden: dann fehlt den letzten Paaren der Kommentar, das Issue bleibt gültig
  while (pairs.length > 0 && markerOf(pairs).length > MAX_TOTAL / 2) pairs.pop();
  const marker = markerOf(pairs);
  if (!WATCH_MARKER.test(marker))
    throw new Error(`Marker des Wächters mit unerlaubten Zeichen: ${marker.slice(0, 200)}`);
  const head = [
    `Befunde des Wächters vom ${formatGermanDate(today)} (Plan 0048, E10). Den Text schreibt der Nachtlauf; das Issue schließt sich, wenn nichts mehr offen ist.`,
    "",
  ];
  // Platz für die Zeile „… und N weitere“, die Leerzeile und den Marker
  const budget = MAX_TOTAL - 1 - marker.length - head.join("\n").length - 2 * MAX_LINE;
  const lines: string[] = [];
  let used = 0;
  for (const f of findings) {
    const l = line(f);
    if (used + l.length + 1 > budget) break;
    lines.push(l);
    used += l.length + 1;
  }
  const rest = findings.length - lines.length;
  if (rest > 0) lines.push(`- … und ${rest} weitere Befunde (Bericht des Nachtlaufs, Artefakt nachtlauf)`);
  return [...head, ...lines, "", marker].join("\n");
}
