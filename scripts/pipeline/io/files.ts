/** Dateien und git für die Pipeline: Laufverzeichnis, Katalog, offers.json. Keine Logik. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  type OffersFile,
  OffersFile as OffersFileSchema,
  type Provider,
  ProvidersFile,
} from "../../../src/domain/schema.ts";
import { toBerlinIso } from "../../../src/domain/time.ts";
import { type Candidate, CandidatesFile, SOURCES, type Source } from "../lib/candidate.ts";
import { appendEntries, providerIdsOf } from "../lib/catalog-yaml.ts";
import { ProviderRaw } from "../lib/raw.ts";
import { type RunMeta, RunMeta as RunMetaSchema, type SourceStatus, SourceStatusFile } from "../lib/run.ts";

export const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const CATALOG = join(ROOT, "data/providers.yaml");
const OFFERS = join(ROOT, "data/offers.json");
/** Zustand je Anbieter (Plan 0032, E5) */
export const RAW_DIR = join(ROOT, "data/raw");

export const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));
export function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`);
}

export function readMeta(runDir: string): RunMeta {
  const file = join(runDir, "meta.json");
  if (!existsSync(file)) throw new Error(`${file} fehlt – zuerst \`pnpm pipeline init\``);
  return RunMetaSchema.parse(readJson(file));
}

export function readCatalog(file: string = CATALOG): Provider[] {
  return ProvidersFile.parse(parse(readFileSync(file, "utf8")));
}

/** Hängt Einträge an den Katalog an, ohne Formatierung und Kommentare der übrigen zu ändern. */
export function appendToCatalog(entries: readonly Provider[]): void {
  writeFileSync(CATALOG, appendEntries(readFileSync(CATALOG, "utf8"), entries));
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

export function candidatesOf(runDir: string): Array<Candidate & { cid: string }> {
  const out: Array<Candidate & { cid: string }> = [];
  for (const source of SOURCES) {
    const file = join(runDir, "candidates", `${source}.json`);
    if (!existsSync(file)) continue;
    CandidatesFile.parse(readJson(file)).forEach((c, i) => {
      out.push({ ...c, cid: `${source.slice(0, 2)}${i}` });
    });
  }
  return out;
}

export function sourceStatus(runDir: string): Partial<Record<Source, SourceStatus>> {
  const file = join(runDir, "candidates", "_status.json");
  return existsSync(file) ? SourceStatusFile.parse(readJson(file)) : {};
}

/** Anbieter-IDs eines Pakets (batch-<n>.json). */
export function batchProviders(file: string): string[] {
  return providerIdsOf(readJson(file));
}

/** Prüfzeitpunkt einer Rohdatei = ihre Änderungszeit (kein Agent schreibt eine Uhrzeit). */
export function checkedAtOf(file: string): string {
  return toBerlinIso(statSync(file).mtime);
}

/** Paket zur Rohdatei: raw/batch-3.json ↔ batch-3.json */
export function batchFileFor(rawFile: string): string {
  return join(dirname(dirname(rawFile)), basename(rawFile));
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

export function writeRaw(dir: string, providerId: string, raw: ProviderRaw): void {
  writeJson(join(dir, `${providerId}.json`), ProviderRaw.parse(raw));
}
