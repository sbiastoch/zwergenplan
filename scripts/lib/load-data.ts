/** Lädt und prüft den Datenbestand – echte Daten (data/) oder Fixtures (ZWERGENPLAN_DATA=fixture). */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { type ValidationResult, validateDataset } from "../../src/domain/dataset.ts";
import type { NetworkId } from "../../src/domain/regions.ts";
import { type Timetable, timetableSchema } from "../../src/domain/schema.ts";

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
 * Plan 0009, E7 (Review B1): Bis zum Zusammenführen von Pipeline und Tabelle (Schritt 5) gab es den echten
 * Fahrplanauszug noch nicht, sein Fehlen war nur eine Warnung. Seit Schritt 5 ist es rot.
 */
export const TIMETABLE_REQUIRED = true;

export type TimetableLoad =
  | { kind: "ok"; timetable: Timetable }
  | { kind: "missing"; file: string }
  | { kind: "invalid"; file: string; errors: string[] };

/** Pfad relativ zum Repo, sonst absolut (für Meldungen) */
function relativeToRoot(file: URL): string {
  const path = fileURLToPath(file);
  const root = fileURLToPath(ROOT);
  return path.startsWith(root) ? path.slice(root.length) : path;
}

/** Liest und prüft den Fahrplanauszug eines Netzes (`timetableSchema`, src/domain/schema.ts). */
export function readTimetable(file: URL, network: NetworkId): TimetableLoad {
  const text = readOptional(file);
  const path = relativeToRoot(file);
  if (text === undefined) return { kind: "missing", file: path };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { kind: "invalid", file: path, errors: [`Lesefehler: ${(e as Error).message}`] };
  }
  const r = timetableSchema(network).safeParse(raw);
  if (r.success) return { kind: "ok", timetable: r.data };
  const errors = r.error.issues.map((i) => `${i.path.join(".") || "(Wurzel)"}: ${i.message}`);
  return { kind: "invalid", file: path, errors };
}

/** `<Datenverzeichnis>/oepnv/<netz>.json` (Plan 0009, E4/E7; ein Auszug je Netz, Plan 0039, E4) */
export function loadTimetable(source: DataSource, network: NetworkId): TimetableLoad {
  return readTimetable(new URL(`oepnv/${network}.json`, dataDir(source)), network);
}

/** Fehler und Warnungen zum Auszug; Aktualität prüft `timetableWarnings` (scripts/transit/freshness.ts). */
export function timetableIssues(
  load: TimetableLoad,
  opts: { required: boolean },
): { errors: string[]; warnings: string[] } {
  if (load.kind === "invalid") {
    return { errors: load.errors.map((e) => `Fahrplanauszug ${load.file}: ${e}`), warnings: [] };
  }
  if (load.kind === "missing") {
    const msg = `Kein Fahrplanauszug (${load.file}) – Wegzeit entfällt, \`pnpm pipeline oepnv\` ausführen`;
    return opts.required ? { errors: [msg], warnings: [] } : { errors: [], warnings: [msg] };
  }
  return { errors: [], warnings: [] };
}
