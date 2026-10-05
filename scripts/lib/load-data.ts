/** Lädt und prüft den Datenbestand – echte Daten (data/) oder Fixtures (ZWERGENPLAN_DATA=fixture). */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { type ValidationResult, validateDataset } from "../../src/domain/dataset.ts";
import { Timetable } from "../../src/domain/schema.ts";

export const ROOT = new URL("../../", import.meta.url);

export type DataSource = "real" | "fixture";

export function dataSource(): DataSource {
  return process.env["ZWERGENPLAN_DATA"] === "fixture" ? "fixture" : "real";
}

function readOptional(url: URL): string | undefined {
  return existsSync(url) ? readFileSync(url, "utf8") : undefined;
}

/** Datenverzeichnis je Quelle: data/ oder tests/fixtures/ */
function dataDir(source: DataSource): URL {
  return new URL(source === "fixture" ? "tests/fixtures/" : "data/", ROOT);
}

export function loadDataset(source: DataSource = dataSource()): ValidationResult {
  const dir = dataDir(source);
  const providersText = readOptional(new URL("providers.yaml", dir));
  const offersText = readOptional(new URL("offers.json", dir));
  if (providersText === undefined || offersText === undefined) {
    return { ok: false, errors: [`${dir.pathname}providers.yaml und offers.json müssen existieren`] };
  }
  try {
    return validateDataset(parse(providersText), JSON.parse(offersText));
  } catch (e) {
    return { ok: false, errors: [`Lesefehler: ${(e as Error).message}`] };
  }
}

/**
 * Plan 0009, E7 (Review B1): Bis zum Zusammenführen von Pipeline und Tabelle (Schritt 5) gibt es den echten
 * Fahrplanauszug noch nicht. Solange ist sein Fehlen nur eine Warnung; Schritt 5 setzt das auf `true`.
 */
export const TIMETABLE_REQUIRED = false;

export type TimetableLoad =
  | { kind: "ok"; timetable: Timetable }
  | { kind: "missing"; file: string }
  | { kind: "invalid"; errors: string[] };

/** Pfad relativ zum Repo, sonst absolut (für Meldungen) */
function relativeToRoot(file: URL): string {
  const path = fileURLToPath(file);
  const root = fileURLToPath(ROOT);
  return path.startsWith(root) ? path.slice(root.length) : path;
}

/** Liest und prüft einen Fahrplanauszug (Schema `Timetable`, src/domain/schema.ts). */
export function readTimetable(file: URL): TimetableLoad {
  const text = readOptional(file);
  if (text === undefined) return { kind: "missing", file: relativeToRoot(file) };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { kind: "invalid", errors: [`Lesefehler: ${(e as Error).message}`] };
  }
  const r = Timetable.safeParse(raw);
  if (r.success) return { kind: "ok", timetable: r.data };
  return { kind: "invalid", errors: r.error.issues.map((i) => `${i.path.join(".") || "(Wurzel)"}: ${i.message}`) };
}

/** `<Datenverzeichnis>/oepnv/fahrplan.json` (Plan 0009, E4/E7) */
export function loadTimetable(source: DataSource = dataSource()): TimetableLoad {
  return readTimetable(new URL("oepnv/fahrplan.json", dataDir(source)));
}

/** Fehler und Warnungen zum Auszug; Aktualität prüft `timetableWarnings` (scripts/transit/freshness.ts). */
export function timetableIssues(
  load: TimetableLoad,
  opts: { required: boolean },
): { errors: string[]; warnings: string[] } {
  if (load.kind === "invalid") return { errors: load.errors.map((e) => `Fahrplanauszug: ${e}`), warnings: [] };
  if (load.kind === "missing") {
    const msg = `Kein Fahrplanauszug (${load.file}) – Wegzeit entfällt, \`pnpm pipeline oepnv\` ausführen`;
    return opts.required ? { errors: [msg], warnings: [] } : { errors: [], warnings: [msg] };
  }
  return { errors: [], warnings: [] };
}
