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
import { ProviderRaw } from "../lib/raw.ts";

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
