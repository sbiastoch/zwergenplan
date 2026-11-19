/** Dateien und git für die Pipeline: Katalog, offers.json, Zustand je Anbieter. Keine Logik. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  type OffersFile,
  OffersFile as OffersFileSchema,
  type Provider,
  ProvidersFile,
} from "../../../src/domain/schema.ts";
import { IdAcceptance, ProviderRaw } from "../lib/raw.ts";
import { parseResting, type RestingFile } from "../lib/resting.ts";

export const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CATALOG = join(ROOT, "data/providers.yaml");
const OFFERS = join(ROOT, "data/offers.json");
/** Zustand je Anbieter (Plan 0032, E5) */
export const RAW_DIR = join(ROOT, "data/raw");
/** Stichproben und Trägerarten des Entdecken-Evals (Plan 0050, E6) */
export const DISCOVER_EVAL = join(ROOT, "evals/discover.json");
/** Urteile von Hand über zusätzliche Aufnahmen im Entdecken-Eval (Plan 0050, Ziel 3) */
export const DISCOVER_URTEILE = join(ROOT, "evals/discover-urteile.json");

export const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));
/** Atomar (temporäre Datei, dann umbenennen): Ein Abbruch mitten im Schreiben hinterlässt keine kaputte Datei. */
export function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 1)}\n`);
  renameSync(tmp, file);
}

export function readCatalog(file: string = CATALOG): Provider[] {
  return ProvidersFile.parse(parse(readFileSync(file, "utf8")));
}

/**
 * Hinnehmen-Datei `<dataDir>/id-hinnehmen.yaml` (ADR 0041, Punkt 7), von Hand gepflegt. Fehlt sie, gilt die leere
 * Liste; ist sie kaputt oder ungültig, wirft es mit dem Pfad.
 */
export function readIdAcceptance(dataDir: string): IdAcceptance {
  const file = join(dataDir, "id-hinnehmen.yaml");
  if (!existsSync(file)) return [];
  try {
    return IdAcceptance.parse(parse(readFileSync(file, "utf8")) ?? []);
  } catch (e) {
    throw new Error(`${file}: ${(e as Error).message}`, { cause: e });
  }
}

/**
 * Wie `readIdAcceptance`, für den Nachtlauf: Eine kaputte Datei bricht ihn nicht ab (Arch-Review B, m6). `warn`
 * bekommt den Fehler, und es gilt die leere Liste, also nichts hingenommen; rot wird dann `data:validate`.
 */
export function readIdAcceptanceOrWarn(dataDir: string, warn: (message: string) => void): IdAcceptance {
  try {
    return readIdAcceptance(dataDir);
  } catch (e) {
    warn((e as Error).message);
    return [];
  }
}

/**
 * Ruhende Angebote `<dataDir>/ruhend.json` (Plan 0061, E2). Fehlt die Datei oder ist sie ungültig, gilt die leere Ruhe
 * mit Hinweis: Der Build verhält sich dann wie ohne Ruhe und legt sie neu an.
 */
export function readResting(file: string, generatedAt: string): { resting: RestingFile; warning?: string } {
  const empty: RestingFile = { generatedAt, entries: [] };
  if (!existsSync(file)) return { resting: empty, warning: `${file} fehlt – ohne Ruhe gebaut, neu angelegt` };
  let value: unknown;
  try {
    value = readJson(file);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return {
      resting: empty,
      warning: `${file} ist kein JSON (${why}) – Inhalt verworfen, ohne Ruhe gebaut, leer neu angelegt`,
    };
  }
  const parsed = parseResting(value);
  return "file" in parsed
    ? { resting: parsed.file }
    : {
        resting: empty,
        warning: `${file} ungültig (${parsed.error}) – Inhalt verworfen, ohne Ruhe gebaut, leer neu angelegt`,
      };
}

/**
 * Schreibt die Ruhe atomar, ein Eintrag je Zeile (Plan 0061, E2; Review 2, Minor 9): `writeJson` rückt ein und ließe
 * die Datei um ein Vielfaches wachsen. Biome nimmt die Datei aus (`biome.json`).
 */
export function writeResting(file: RestingFile, target: string): void {
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  const entries = file.entries.map((e) => `    ${JSON.stringify(e)}`).join(",\n");
  writeFileSync(
    tmp,
    `{\n  "generatedAt": ${JSON.stringify(file.generatedAt)},\n  "entries": [${entries ? `\n${entries}\n  ` : ""}]\n}\n`,
  );
  renameSync(tmp, target);
}

export function readPreviousOffers(file: string = OFFERS): OffersFile | undefined {
  if (!existsSync(file)) return undefined;
  return OffersFileSchema.parse(readJson(file));
}

/** Schreibt data/offers.json und formatiert es wie das Repo (Biome), damit Lint und Diffs stimmen; andere Ziele roh. */
export function writeOffers(file: OffersFile, target: string = OFFERS): void {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`);
  // Biome nur im Repo: ignorierte Pfade (runs/) und Temp-Verzeichnisse lehnt es ab
  if (target === OFFERS)
    execFileSync(join(ROOT, "node_modules/.bin/biome"), ["format", "--write", target], { cwd: ROOT, stdio: "pipe" });
}

export function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

/** `<dir>/<providerId>.json`, geprüft; fehlt die Datei, `undefined`. */
export function readRaw(dir: string, providerId: string): ProviderRaw | undefined {
  const file = join(dir, `${providerId}.json`);
  return existsSync(file) ? ProviderRaw.parse(readJson(file)) : undefined;
}

/** Alle Zustände eines Verzeichnisses (fehlt es, keine). */
export function readRawDir(dir: string): Record<string, ProviderRaw> {
  if (!existsSync(dir)) return {};
  const out: Record<string, ProviderRaw> = {};
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort())
    out[f.slice(0, -".json".length)] = ProviderRaw.parse(readJson(join(dir, f)));
  return out;
}

export function removeRaw(dir: string, providerId: string): void {
  rmSync(join(dir, `${providerId}.json`), { force: true });
}

export function writeRaw(dir: string, providerId: string, raw: ProviderRaw): void {
  writeJson(join(dir, `${providerId}.json`), ProviderRaw.parse(raw));
}
